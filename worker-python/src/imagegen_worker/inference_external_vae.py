"""Exact standalone SDXL VAE tensors with an explicit offline native configuration.

Shape compatibility is not evidence of training lineage. Source applicability is
owned by main; this boundary proves a complete load into the pinned architecture.
"""

from __future__ import annotations

import hashlib
import importlib
import json
import os
import stat
from pathlib import Path
from typing import Any, cast

from imagegen_worker.derivatives import DerivativeError, canonical_absolute_path
from imagegen_worker.protocol import GenerationVae

MAX_VAE_HEADER_BYTES = 32 * 1024 * 1024
_COMPONENT_PREFIXES = ("encoder.", "decoder.", "quant_conv.", "post_quant_conv.")


def _unsupported(message: str) -> DerivativeError:
    return DerivativeError("GENERATION_VAE_UNSUPPORTED", message)


def _unique_header_fields(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise _unsupported("VAE safetensors header has duplicate fields.")
        result[key] = value
    return result


def read_vae_snapshot(vae: GenerationVae, *, max_payload_bytes: int) -> bytes:
    """Read bounded exact bytes once; the native loader never reopens this path."""
    canonical_absolute_path(vae.path, label="External VAE")
    try:
        descriptor = os.open(vae.path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, "rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_size != vae.byte_size:
                raise DerivativeError("GENERATION_INPUT_CHANGED", "VAE changed after enqueue.")
            # Every qualified tensor is F16/BF16/F32 and matches the complete
            # native state; its payload cannot exceed that state's F32 bytes.
            if vae.byte_size > 8 + MAX_VAE_HEADER_BYTES + max_payload_bytes:
                raise _unsupported("VAE exceeds the pinned architecture's tensor byte limit.")
            prefix = stream.read(8)
            header_size = int.from_bytes(prefix, "little")
            if len(prefix) != 8 or not 2 <= header_size <= MAX_VAE_HEADER_BYTES:
                raise _unsupported("VAE safetensors header is unsupported.")
            if header_size + 8 > before.st_size:
                raise _unsupported("VAE safetensors header is truncated.")
            digest = hashlib.sha256(prefix)
            chunks = [prefix]
            size = 8
            while chunk := stream.read(min(1024 * 1024, vae.byte_size - size + 1)):
                size += len(chunk)
                if size > vae.byte_size:
                    raise DerivativeError("GENERATION_INPUT_CHANGED", "VAE changed during reading.")
                digest.update(chunk)
                chunks.append(chunk)
            after = os.fstat(stream.fileno())
            if (
                size != vae.byte_size
                or (before.st_size, before.st_mtime_ns, before.st_ctime_ns)
                != (after.st_size, after.st_mtime_ns, after.st_ctime_ns)
                or digest.hexdigest() != vae.sha256
            ):
                raise DerivativeError("GENERATION_INPUT_CHANGED", "VAE changed after enqueue.")
    except OSError as error:
        raise DerivativeError("GENERATION_INPUT_CHANGED", "VAE is unavailable.") from error
    snapshot = b"".join(chunks)
    try:
        header: object = json.loads(
            snapshot[8 : 8 + header_size], object_pairs_hook=_unique_header_fields
        )
        if not isinstance(header, dict):
            raise _unsupported("VAE safetensors header must be an object.")
    except (ValueError, RecursionError) as error:
        raise _unsupported("VAE safetensors header is invalid.") from error
    return snapshot


def qualify_vae_state(
    state: dict[str, Any], expected: dict[str, Any], config: Any, torch: Any
) -> dict[str, Any]:
    """Use the pinned native mapping; reject ignored, missing or mismatched tensors."""
    if not state or any(not key.startswith(_COMPONENT_PREFIXES) for key in state):
        raise _unsupported("VAE must be a standalone encoder/decoder tensor dictionary.")
    for tensor in state.values():
        if tensor.dtype not in (torch.float16, torch.bfloat16, torch.float32):
            raise _unsupported("VAE tensor dtype is unsupported.")
        if not bool(torch.isfinite(tensor).all().item()):
            raise _unsupported("VAE contains non-finite tensors.")
    native = any(".down_blocks." in key or ".up_blocks." in key for key in state)
    ldm = any(".down." in key or ".up." in key for key in state)
    if native and ldm:
        raise _unsupported("VAE mixes native and original tensor naming.")
    try:
        converters = cast(Any, importlib.import_module("diffusers.loaders.single_file_utils"))
        converted = state if native else converters.convert_ldm_vae_checkpoint(state, config)
    except Exception as error:
        raise _unsupported("VAE native conversion failed.") from error
    if len(converted) != len(state) or set(converted) != set(expected):
        raise _unsupported("VAE tensor set does not match the complete pinned architecture.")
    if any(tuple(converted[key].shape) != tuple(tensor.shape) for key, tensor in expected.items()):
        raise _unsupported("VAE tensor shapes do not match the pinned architecture.")
    return cast(dict[str, Any], converted)


def load_generation_vae(vae: GenerationVae, config_dir: Path, diffusers: Any, torch: Any) -> Any:
    """Load only verified tensors; safetensors metadata cannot override SDXL scaling."""
    config = diffusers.AutoencoderKL.load_config(
        str(config_dir), subfolder="vae", local_files_only=True
    )
    with torch.device("meta"):
        expected_model = diffusers.AutoencoderKL.from_config(config)
    expected = expected_model.state_dict()
    maximum_payload = sum(tensor.numel() * 4 for tensor in expected.values())
    snapshot = read_vae_snapshot(vae, max_payload_bytes=maximum_payload)
    try:
        safetensors = cast(Any, importlib.import_module("safetensors.torch"))
        state = cast(dict[str, Any], safetensors.load(snapshot))
    except Exception as error:
        raise _unsupported("VAE safetensors tensors are invalid.") from error
    converted = qualify_vae_state(state, expected, config, torch)
    try:
        model = diffusers.AutoencoderKL.from_single_file(
            converted,
            config=str(config_dir),
            subfolder="vae",
            local_files_only=True,
            torch_dtype=torch.float16,
        )
    except Exception as error:
        raise _unsupported("VAE native loading failed.") from error
    if any(not bool(torch.isfinite(tensor).all().item()) for tensor in model.state_dict().values()):
        raise _unsupported("VAE weights overflowed the qualified FP16 loading dtype.")
    return model
