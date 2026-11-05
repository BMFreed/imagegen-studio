"""Prepare an ordered ordinary LoRA stack on a fresh, job-owned native pipeline.

Adapted from InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd:
backend/patches/layers/lora_layer.py (get_weight), lora_layer_base.py
(scale/get_parameters), and layer_patcher.py (_apply_model_layer_patch).
The SDXL Compel and UNet callers apply the same stack before their consumers.

Studio's existing exact Kohya qualifier supplies the complete native targets.
Only Invoke's equal-rank, bias-free direct arithmetic is adapted here; PEFT,
sidecars, cached originals and borrowed-module restoration are not used. This
preparation precedes all regional borrowing. On failure the caller discards the
fresh owned pipeline; this is not an atomic patch API for borrowed pipelines.
"""

from __future__ import annotations

import importlib
import math
from pathlib import Path
from typing import Any, cast

from .derivatives import DerivativeError, canonical_absolute_path
from .inference_lora import QualifiedLoraTarget, qualify_lora_state, read_lora_snapshot
from .protocol import (
    _SHA256_PATTERN,  # pyright: ignore[reportPrivateUsage]
    GenerationLora,
)

__all__ = (
    "MAX_REGIONAL_LORA_BYTES",
    "MAX_REGIONAL_LORA_WORK_BYTES",
    "MAX_REGIONAL_LORA_SOURCES",
    "prepare_regional_loras",
    "verify_regional_lora_resources",
)

# Separate from the unchanged exact-TI/text/source budgets. The serialized
# safety bound includes safetensors headers; it is not a trained capacity claim.
MAX_REGIONAL_LORA_BYTES = 512 * 1024 * 1024
MAX_REGIONAL_LORA_WORK_BYTES = 512 * 1024 * 1024
MAX_REGIONAL_LORA_SOURCES = 10_000  # Main's existing defensive source-count ceiling.
_COMPONENTS = ("unet", "text_encoder", "text_encoder_2")


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise DerivativeError("GENERATION_LORA_UNSUPPORTED", message)


def _descriptors(loras: tuple[GenerationLora, ...]) -> None:
    _require(
        type(loras) is tuple and len(loras) <= MAX_REGIONAL_LORA_SOURCES,
        "Regional LoRAs require a bounded ordered tuple.",
    )
    identities: dict[Path, tuple[str, int]] = {}
    for lora in loras:
        _require(type(lora) is GenerationLora, "Regional LoRA descriptors are invalid.")
        path = canonical_absolute_path(lora.path, label="Regional LoRA")
        _require(
            type(lora.byte_size) is int
            and lora.byte_size >= 1
            and type(lora.sha256) is str
            and _SHA256_PATTERN.fullmatch(lora.sha256) is not None
            and type(lora.weight) in (int, float)
            and math.isfinite(lora.weight),
            "Regional LoRA identity and signed weight must be exact and finite.",
        )
        identity = (lora.sha256, lora.byte_size)
        _require(
            path not in identities or identities[path] == identity,
            "One regional LoRA path has conflicting descriptors.",
        )
        _require(path not in identities, "Enabled regional LoRAs must be distinct.")
        identities[path] = identity
    _require(
        sum(size for _, size in identities.values()) <= MAX_REGIONAL_LORA_BYTES,
        "Regional serialized LoRAs exceed the 512 MiB safety bound.",
    )


def verify_regional_lora_resources(
    loras: tuple[GenerationLora, ...], root: Path, checkpoint: Path
) -> None:
    """Verify descriptors, aggregate size and exact bytes before model loading."""
    _descriptors(loras)
    for lora in loras:
        _require(
            lora.path != checkpoint and lora.path != root and root not in lora.path.parents,
            "Regional LoRAs must be outside staging and distinct from checkpoint.",
        )
    for lora in loras:
        # Hash-bound, no-follow safe header verification; no tensor deserialization.
        snapshot = read_lora_snapshot(lora)
        del snapshot


def _fresh_components(pipeline: Any) -> None:
    for component in _COMPONENTS:
        for module in getattr(pipeline, component).modules():
            _require(
                not getattr(module, "_hf_peft_config_loaded", False)
                and not getattr(module, "peft_config", None)
                and getattr(module, "lora_layer", None) is None
                and not any(
                    hasattr(module, name)
                    for name in ("get_base_layer", "lora_A", "lora_B", "lora_embedding_A")
                )
                and not hasattr(module, "_orig_mod")
                and not hasattr(module, "_hf_hook")
                and getattr(module, "_compiled_call_impl", None) is None,
                "Regional LoRA preparation requires fresh native components without adapters.",
            )


def _target_module(pipeline: Any, target: QualifiedLoraTarget, torch: Any) -> Any:
    module = getattr(pipeline, target.component).get_submodule(target.path)
    _require(
        type(module) is torch.nn.Linear or (type(module) is torch.nn.Conv2d and module.groups == 1),
        "Regional LoRA targets must be exact native Linear or ungrouped Conv2d modules.",
    )
    _require(
        type(module.weight) is torch.nn.Parameter
        and module.weight.dtype in (torch.float16, torch.bfloat16, torch.float32)
        and module.weight.device.type in ("cpu", "cuda")
        and module.weight.layout is torch.strided
        and not any(
            key in module.__dict__
            for key in ("forward", "__call__", "_call_impl", "_wrapped_call_impl", "_slow_forward")
        ),
        "Regional LoRA targets require native floating parameters and unshadowed calls.",
    )
    elements = module.weight.numel()
    scratch = 4 * (target.up.numel() + target.down.numel()) + max(
        8 * elements, (4 + 2 * module.weight.element_size()) * elements
    )
    _require(
        scratch <= MAX_REGIONAL_LORA_WORK_BYTES,
        "A regional LoRA target exceeds the 512 MiB arithmetic workspace bound.",
    )
    _require(
        bool(torch.isfinite(module.weight).all().item()),
        "Regional LoRA target weights must be finite before preparation.",
    )
    return module


def prepare_regional_loras(pipeline: Any, loras: tuple[GenerationLora, ...], torch: Any) -> None:
    """Qualify the entire stack, then apply Invoke's sequential direct updates.

    Enabled zero entries still verify exact bytes, keys, conversion, every target
    and workspace. Like Invoke they skip numeric patching. Parameter objects,
    dtype/device and requires_grad flags survive the out-of-place data update.
    """
    if not loras:
        return
    _descriptors(loras)
    _fresh_components(pipeline)
    safetensors = cast(Any, importlib.import_module("safetensors.torch"))
    qualified: list[tuple[GenerationLora, tuple[QualifiedLoraTarget, ...]]] = []
    for lora in loras:
        # Reread expected SHA even after parse-time verification: files can change
        # while the checkpoint is loading, before this preparation starts.
        snapshot = read_lora_snapshot(lora)
        try:
            state = cast(dict[str, Any], safetensors.load(snapshot))
        except Exception as error:
            raise DerivativeError(
                "GENERATION_LORA_UNSUPPORTED", "Regional LoRA safetensors data is invalid."
            ) from error
        del snapshot
        canonical, targets = qualify_lora_state(pipeline, state, torch)
        for target in targets:
            _target_module(pipeline, target, torch)
            scale = lora.weight * (target.alpha / target.rank)
            _require(
                math.isfinite(scale) and abs(scale) <= torch.finfo(torch.float32).max,
                "Regional LoRA signed scale must be finite in float32 arithmetic.",
            )
        qualified.append((lora, targets))
        del canonical, state

    with torch.no_grad():
        for lora, targets in qualified:
            if lora.weight == 0:
                continue
            for target in targets:
                module = getattr(pipeline, target.component).get_submodule(target.path)
                weight = module.weight
                up = target.up.to(device=weight.device, dtype=torch.float32)
                down = target.down.to(device=weight.device, dtype=torch.float32)
                delta = up.reshape(up.shape[0], -1) @ down.reshape(target.rank, -1)
                del up, down
                delta = (delta * (lora.weight * (target.alpha / target.rank))).reshape(weight.shape)
                _require(
                    bool(torch.isfinite(delta).all().item()),
                    "Regional LoRA float32 residual is non-finite.",
                )
                converted = delta.to(dtype=weight.dtype)
                _require(
                    bool(torch.isfinite(converted).all().item()),
                    "Regional LoRA residual is non-finite in the model dtype.",
                )
                updated = weight.data + converted
                _require(
                    bool(torch.isfinite(updated).all().item()),
                    "Regional LoRA updated model weight is non-finite.",
                )
                # Invoke's direct path preserves Parameter identity and leaves
                # the previous storage intact, including any shared CPU view.
                weight.data = updated
                del delta, converted, updated
