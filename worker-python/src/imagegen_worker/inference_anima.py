"""Offline structural/load foundation for the original Anima Base architecture.

This does not advertise an inference capability or implement prompt conditioning.
Diffusers 0.40.0 supplies the Cosmos backbone, original Anima text conditioner and
Wan VAE; Transformers 5.5.4 supplies Qwen3Model. Conversions stay in memory. No
model/config/tokenizer discovery, file conversion or device fallback is performed.

Architecture and key handling were checked against InvokeAI
9e1540962bcca7f8fa668d7d8e02cf79d75fda3b and real original-family headers.
The original Qwen-image-named companion uses AutoencoderKLWan, with its explicit
per-channel latent normalization; it is not AutoencoderKLQwenImage. Newer Anima
architectures/semantic connectors are not qualified by this loader.
"""

from __future__ import annotations

import hashlib
import importlib
import importlib.metadata
import json
import math
import os
import re
import stat
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Any, cast

from imagegen_worker.derivatives import DerivativeError, canonical_absolute_path

MAX_ANIMA_HEADER_BYTES = 32 * 1024 * 1024
_DTYPE_BYTES = {"F16": 2, "BF16": 2, "F32": 4}
_TRANSFORMER_ROOTS = (
    "blocks.",
    "llm_adapter.",
    "x_embedder.",
    "t_embedder.",
    "t_embedding_norm.",
    "final_layer.",
)
_DERIVED_KEYS = frozenset(
    (
        "pos_embedder.dim_spatial_range",
        "pos_embedder.dim_temporal_range",
        "pos_embedder.seq",
        "llm_adapter.rotary_emb.inv_freq",
    )
)
_MODEL_VERSIONS = {
    "torch": "2.7.1",
    "diffusers": "0.40.0",
    "transformers": "5.5.4",
    "accelerate": "1.14.0",
    "safetensors": "0.8.0",
}


@dataclass(frozen=True)
class AnimaModelFile:
    path: Path
    sha256: str
    byte_size: int


@dataclass(frozen=True)
class AnimaModelBundle:
    checkpoint: AnimaModelFile
    qwen3_encoder: AnimaModelFile
    vae: AnimaModelFile


@dataclass(frozen=True)
class LoadedAnimaModels:
    transformer: Any
    text_conditioner: Any
    qwen3_encoder: Any
    vae: Any


@dataclass(frozen=True)
class _AnimaArchitecture:
    """Trusted native-constructor configuration, never a worker request field.

    The private loader collaborator permits scaled native CPU tests of the same
    graph/converters. Production calls use ANIMA_BASE_ARCHITECTURE exclusively.
    """

    transformer: Mapping[str, Any]
    text_conditioner: Mapping[str, Any]
    qwen3_encoder: Mapping[str, Any]
    vae: Mapping[str, Any]
    companion_identities: Mapping[str, tuple[str, int]] | None


ANIMA_BASE_ARCHITECTURE = _AnimaArchitecture(
    transformer=MappingProxyType(
        {
            "in_channels": 16,
            "out_channels": 16,
            "num_attention_heads": 16,
            "attention_head_dim": 128,
            "num_layers": 28,
            "mlp_ratio": 4.0,
            "text_embed_dim": 1024,
            "adaln_lora_dim": 256,
            # Native Cosmos bounds its nonlearned RoPE sequence, unlike Invoke's
            # dynamic arange. Cover the 2048px envelope / Wan compression 8;
            # existing coordinate frequencies and every state tensor stay identical.
            "max_size": (1, 256, 256),
            "patch_size": (1, 2, 2),
            "rope_scale": (1.0, 4.0, 4.0),
            "concat_padding_mask": True,
            "extra_pos_embed_type": None,
            "use_crossattn_projection": False,
        }
    ),
    text_conditioner=MappingProxyType(
        {
            "source_dim": 1024,
            "target_dim": 1024,
            "model_dim": 1024,
            "num_layers": 6,
            "num_attention_heads": 16,
            "mlp_ratio": 4.0,
            "target_vocab_size": 32128,
            "use_self_attention": True,
            "use_layer_norm": False,
            "min_sequence_length": 512,
        }
    ),
    qwen3_encoder=MappingProxyType(
        {
            "vocab_size": 151936,
            "hidden_size": 1024,
            "intermediate_size": 3072,
            "num_hidden_layers": 28,
            "num_attention_heads": 16,
            "num_key_value_heads": 8,
            "head_dim": 128,
            "max_position_embeddings": 40960,
            "rms_norm_eps": 1e-6,
            "tie_word_embeddings": True,
            "rope_theta": 1000000.0,
            "attention_bias": False,
            "attention_dropout": 0.0,
        }
    ),
    vae=MappingProxyType({}),
    companion_identities=MappingProxyType(
        {
            "qwen3_encoder": (
                "cd2a512003e2f9f3cd3c32a9c3573f820bb28c940f73c57b1ddaa983d9223eba",
                1192135096,
            ),
            "vae": (
                "a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f",
                253806246,
            ),
        }
    ),
)


def _unsupported(message: str) -> DerivativeError:
    return DerivativeError("GENERATION_MODEL_UNSUPPORTED", message)


def _unique_fields(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise _unsupported("Anima safetensors header contains duplicate fields.")
        result[key] = value
    return result


def _invalid_constant(_value: str) -> object:
    raise _unsupported("Anima safetensors header contains invalid JSON numbers.")


def _derived_key(key: str) -> bool:
    # These are exactly the original Invoke-derived rotary/position buffers and
    # model_sampling exporter fields. Unknown model branches are never discarded.
    return key in _DERIVED_KEYS or key.startswith("model_sampling.")


def _normalize_checkpoint(state: dict[str, Any]) -> dict[str, Any]:
    prefixes = [
        prefix
        for prefix in ("", "net.", "model.diffusion_model.")
        if any(key.startswith(tuple(prefix + root for root in _TRANSFORMER_ROOTS)) for key in state)
    ]
    if len(prefixes) != 1:
        raise _unsupported("Anima checkpoint has missing or mixed transformer packaging.")
    prefix = prefixes[0]
    normalized: dict[str, Any] = {}
    for key, value in state.items():
        if prefix and not key.startswith(prefix):
            # ComfyUI may bundle its own TE/VAE. Their bytes are validated, but
            # they cannot replace the two separately verified pinned companions.
            if prefix == "model.diffusion_model." and key.startswith(
                ("first_stage_model.", "cond_stage_model.")
            ):
                continue
            if _derived_key(key):
                continue
            raise _unsupported("Anima checkpoint contains an unsupported tensor branch.")
        original = key[len(prefix) :]
        if not _derived_key(original):
            normalized[original] = value
    return normalized


def _convert_state(role: str, state: dict[str, Any], converters: Any) -> dict[str, dict[str, Any]]:
    try:
        if role == "checkpoint":
            normalized = _normalize_checkpoint(state)
            transformer = {
                key: value
                for key, value in normalized.items()
                if not key.startswith("llm_adapter.")
            }
            conditioner = {
                key.removeprefix("llm_adapter."): value
                for key, value in normalized.items()
                if key.startswith("llm_adapter.")
            }
            converted = cast(
                dict[str, Any],
                converters.convert_cosmos_transformer_checkpoint_to_diffusers(dict(transformer)),
            )
            if len(converted) != len(transformer):
                raise _unsupported("Anima backbone conversion discarded or merged tensors.")
            return {"transformer": converted, "text_conditioner": conditioner}
        if role == "qwen3_encoder":
            if any(not key.startswith("model.") for key in state):
                raise _unsupported(
                    "Anima Qwen3 companion must contain only its original text model."
                )
            return {role: {key.removeprefix("model."): value for key, value in state.items()}}
        converted = cast(dict[str, Any], converters.convert_wan_vae_to_diffusers(dict(state)))
        if len(converted) != len(state):
            raise _unsupported("Anima VAE conversion discarded or merged tensors.")
        return {role: converted}
    except DerivativeError:
        raise
    except Exception as error:
        raise _unsupported("Anima native tensor conversion failed.") from error


def _create_native_models(
    architecture: _AnimaArchitecture, torch: Any, diffusers: Any, transformers: Any, accelerate: Any
) -> dict[str, Any]:
    # Buffer constructors remain on CPU. Assigning every parameter later must
    # leave neither parameters nor rotary/non-persistent buffers on meta.
    with accelerate.init_empty_weights(include_buffers=False):
        return {
            "transformer": diffusers.CosmosTransformer3DModel(**architecture.transformer),
            "text_conditioner": diffusers.AnimaTextConditioner(**architecture.text_conditioner),
            "qwen3_encoder": transformers.Qwen3Model(
                transformers.Qwen3Config(**architecture.qwen3_encoder)
            ),
            "vae": diffusers.AutoencoderKLWan(**architecture.vae),
        }


def _validate_descriptors(header: object, payload_bytes: int) -> dict[str, Any]:
    if not isinstance(header, dict) or not header:
        raise _unsupported("Anima safetensors header must contain a tensor dictionary.")
    fields = cast(dict[str, object], header)
    metadata = fields.get("__metadata__")
    if "__metadata__" in fields and (
        not isinstance(metadata, dict)
        or any(not isinstance(value, str) for value in cast(dict[str, object], metadata).values())
    ):
        raise _unsupported("Anima safetensors metadata must contain only strings.")
    tensors = {key: value for key, value in fields.items() if key != "__metadata__"}
    ranges: list[tuple[int, int]] = []
    for value in tensors.values():
        if not isinstance(value, dict):
            raise _unsupported("Anima tensor descriptor fields are invalid.")
        descriptor = cast(dict[str, object], value)
        if set(descriptor) != {"dtype", "shape", "data_offsets"}:
            raise _unsupported("Anima tensor descriptor fields are invalid.")
        dtype, shape, offsets = (
            descriptor["dtype"],
            descriptor["shape"],
            descriptor["data_offsets"],
        )
        if not isinstance(dtype, str) or dtype not in _DTYPE_BYTES:
            raise _unsupported("Anima tensor dtype is unsupported.")
        if not isinstance(shape, list):
            raise _unsupported("Anima tensor shape is invalid.")
        dimensions = cast(list[object], shape)
        if len(dimensions) > 8 or any(
            type(dimension) is not int or dimension <= 0 for dimension in dimensions
        ):
            raise _unsupported("Anima tensor shape is invalid.")
        if (
            not isinstance(offsets, list)
            or len(cast(list[object], offsets)) != 2
            or any(type(offset) is not int for offset in cast(list[object], offsets))
        ):
            raise _unsupported("Anima tensor byte range is invalid.")
        start, end = cast(list[int], offsets)
        if (
            start < 0
            or end > payload_bytes
            or end - start != math.prod(cast(list[int], shape)) * _DTYPE_BYTES[dtype]
        ):
            raise _unsupported("Anima tensor byte range does not match its shape and dtype.")
        ranges.append((start, end))
    cursor = 0
    for start, end in sorted(ranges):
        if start != cursor:
            raise _unsupported("Anima tensor byte ranges overlap or leave holes.")
        cursor = end
    if not tensors or cursor != payload_bytes:
        raise _unsupported("Anima tensor byte ranges do not cover the exact file payload.")
    return tensors


def _validate_schema(
    states: dict[str, dict[str, Any]], models: dict[str, Any], *, descriptors: bool
) -> None:
    for component, state in states.items():
        expected = models[component].state_dict()
        if set(state) != set(expected):
            raise _unsupported(
                f"Anima {component} does not match the complete original architecture."
            )
        for key, tensor in expected.items():
            shape = state[key]["shape"] if descriptors else state[key].shape
            if tuple(shape) != tuple(tensor.shape):
                raise _unsupported(
                    f"Anima {component} tensor shapes do not match the original architecture."
                )


def _read_snapshot(
    file: AnimaModelFile, role: str, models: dict[str, Any], converters: Any
) -> bytes:
    canonical_absolute_path(file.path, label=f"Anima {role}")
    # A bundled checkpoint may contain the complete companions alongside its
    # backbone. This bound derives from actual native F32 parameter footprints.
    maximum_payload = sum(
        tensor.numel() * 4 for model in models.values() for tensor in model.state_dict().values()
    )
    if file.byte_size > 8 + MAX_ANIMA_HEADER_BYTES + maximum_payload:
        raise _unsupported("Anima file exceeds the complete native architecture's byte limit.")
    try:
        descriptor = os.open(file.path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, "rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_size != file.byte_size:
                raise DerivativeError("GENERATION_INPUT_CHANGED", "Anima file identity changed.")
            prefix = stream.read(8)
            header_bytes = int.from_bytes(prefix, "little")
            if (
                len(prefix) != 8
                or not 2 <= header_bytes <= MAX_ANIMA_HEADER_BYTES
                or 8 + header_bytes > file.byte_size
            ):
                raise _unsupported("Anima safetensors header is oversized or truncated.")
            raw_header = stream.read(header_bytes)
            try:
                header: object = json.loads(
                    raw_header,
                    object_pairs_hook=_unique_fields,
                    parse_constant=_invalid_constant,
                )
            except (ValueError, RecursionError) as error:
                raise _unsupported("Anima safetensors header is invalid.") from error
            tensors = _validate_descriptors(header, file.byte_size - 8 - header_bytes)
            _validate_schema(_convert_state(role, tensors, converters), models, descriptors=True)
            digest = hashlib.sha256(prefix + raw_header)
            chunks = [prefix, raw_header]
            read_bytes = 8 + header_bytes
            while chunk := stream.read(min(1024 * 1024, file.byte_size - read_bytes + 1)):
                read_bytes += len(chunk)
                if read_bytes > file.byte_size:
                    raise DerivativeError(
                        "GENERATION_INPUT_CHANGED", "Anima file changed while reading."
                    )
                digest.update(chunk)
                chunks.append(chunk)
            after = os.fstat(stream.fileno())
            if (
                read_bytes != file.byte_size
                or (before.st_size, before.st_mtime_ns, before.st_ctime_ns)
                != (after.st_size, after.st_mtime_ns, after.st_ctime_ns)
                or digest.hexdigest() != file.sha256
            ):
                raise DerivativeError("GENERATION_INPUT_CHANGED", "Anima file identity changed.")
    except OSError as error:
        raise DerivativeError("GENERATION_INPUT_CHANGED", "Anima file is unavailable.") from error
    return b"".join(chunks)


def load_anima_models(
    bundle: AnimaModelBundle,
    *,
    device: str = "cpu",
    dtype: Any = None,
    _architecture: _AnimaArchitecture = ANIMA_BASE_ARCHITECTURE,
) -> LoadedAnimaModels:
    """Load a complete verified bundle without enabling a generation capability.

    Default CPU compute is F32. A caller may explicitly request F16/BF16/F32 and
    a device; unsupported/failed placement never falls back to another device.
    Checkpoint tensors use that dtype; constructor-derived rotary buffers retain
    their native FP32 values during placement, as in Invoke's state-first loader.
    Tokenizers and the mandatory weighting path belong to a later boundary.
    """
    files = {
        "checkpoint": bundle.checkpoint,
        "qwen3_encoder": bundle.qwen3_encoder,
        "vae": bundle.vae,
    }
    for file in files.values():
        if (
            not isinstance(cast(object, file.path), Path)
            or not isinstance(cast(object, file.sha256), str)
            or re.fullmatch(r"[0-9a-f]{64}", file.sha256) is None
            or type(file.byte_size) is not int
            or file.byte_size <= 0
        ):
            raise _unsupported("Anima file identity is invalid.")
    if len({file.path for file in files.values()}) != 3:
        raise _unsupported("Anima components must be distinct exact files.")
    if _architecture.companion_identities is not None:
        for role, identity in _architecture.companion_identities.items():
            if (files[role].sha256, files[role].byte_size) != identity:
                raise _unsupported("Anima requires the exact pinned Qwen3 and VAE companions.")
    try:
        for name, expected in _MODEL_VERSIONS.items():
            if importlib.metadata.version(name).split("+", maxsplit=1)[0] != expected:
                raise DerivativeError(
                    "INFERENCE_UNAVAILABLE", "Pinned Anima native dependencies are unavailable."
                )
        torch = cast(Any, importlib.import_module("torch"))
        diffusers = cast(Any, importlib.import_module("diffusers"))
        transformers = cast(Any, importlib.import_module("transformers"))
        accelerate = cast(Any, importlib.import_module("accelerate"))
        safetensors = cast(Any, importlib.import_module("safetensors.torch"))
        converters = cast(Any, importlib.import_module("diffusers.loaders.single_file_utils"))
        selected_dtype = torch.float32 if dtype is None else dtype
        if selected_dtype not in (torch.float16, torch.bfloat16, torch.float32):
            raise _unsupported("Anima loading dtype must be F16, BF16 or F32.")
        models = _create_native_models(_architecture, torch, diffusers, transformers, accelerate)
        for role, file in files.items():
            snapshot = _read_snapshot(file, role, models, converters)
            try:
                state = cast(dict[str, Any], safetensors.load(snapshot))
            except Exception as error:
                raise _unsupported("Anima safetensors payload is invalid.") from error
            del snapshot
            for tensor in state.values():
                if tensor.dtype not in (torch.float16, torch.bfloat16, torch.float32):
                    raise _unsupported("Anima tensor dtype is unsupported.")
                if not bool(torch.isfinite(tensor).all().item()):
                    raise _unsupported("Anima contains non-finite tensors.")
            converted = _convert_state(role, state, converters)
            _validate_schema(converted, models, descriptors=False)
            for component, tensors in converted.items():
                tensors = {key: tensor.to(dtype=selected_dtype) for key, tensor in tensors.items()}
                if any(
                    not bool(torch.isfinite(tensor).all().item()) for tensor in tensors.values()
                ):
                    raise _unsupported("Anima weights overflowed the requested loading dtype.")
                models[component].load_state_dict(tensors, strict=True, assign=True)
            del state, converted
        for model in models.values():
            if any(tensor.is_meta for tensor in (*model.parameters(), *model.buffers())):
                raise _unsupported("Anima native loading left uninitialized tensors.")
            # State was already cast before strict assignment. A whole-module
            # dtype cast would also round native, nonpersistent RoPE buffers.
            model.to(device=torch.device(device))
            model.eval()
    except DerivativeError:
        raise
    except Exception as error:
        raise DerivativeError(
            "INFERENCE_UNAVAILABLE", "Anima native loading or device placement failed."
        ) from error
    return LoadedAnimaModels(**models)
