"""Exact ordinary Kohya LoRA qualification and native pinned PEFT application.

Only tensor dictionaries produced from the verified safetensors snapshot reach
Diffusers. Metadata cannot inject a PEFT configuration or enable another algorithm.
"""

from __future__ import annotations

import hashlib
import importlib
import json
import math
import os
import re
import stat
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, cast

from imagegen_worker.derivatives import DerivativeError, canonical_absolute_path
from imagegen_worker.protocol import GenerationLora

MAX_LORA_HEADER_BYTES = 32 * 1024 * 1024
_KEY = re.compile(
    r"(lora_(?:unet|te|te1|te2)_[A-Za-z0-9_]+)\.(lora_down\.weight|lora_up\.weight|alpha)\Z"
)
_COMPONENTS = ("unet", "text_encoder", "text_encoder_2")


@dataclass(frozen=True)
class QualifiedLoraTarget:
    component: str
    path: str
    down: Any
    up: Any
    alpha: float
    rank: int


def _unsupported(message: str) -> DerivativeError:
    return DerivativeError("GENERATION_LORA_UNSUPPORTED", message)


def _unique_header_fields(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise _unsupported("LoRA safetensors header has duplicate fields.")
        result[key] = value
    return result


def read_lora_snapshot(lora: GenerationLora) -> bytes:
    canonical_absolute_path(lora.path, label="LoRA")
    try:
        descriptor = os.open(lora.path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, "rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_size != lora.byte_size:
                raise DerivativeError("GENERATION_INPUT_CHANGED", "LoRA changed after enqueue.")
            prefix = stream.read(8)
            header_size = int.from_bytes(prefix, "little")
            if len(prefix) != 8 or not 2 <= header_size <= MAX_LORA_HEADER_BYTES:
                raise _unsupported("LoRA safetensors header is unsupported.")
            if header_size + 8 > before.st_size:
                raise _unsupported("LoRA safetensors header is truncated.")
            digest = hashlib.sha256(prefix)
            chunks = [prefix]
            size = 8
            while chunk := stream.read(min(1024 * 1024, lora.byte_size - size + 1)):
                size += len(chunk)
                if size > lora.byte_size:
                    raise DerivativeError(
                        "GENERATION_INPUT_CHANGED", "LoRA changed during reading."
                    )
                digest.update(chunk)
                chunks.append(chunk)
            after = os.fstat(stream.fileno())
            if (
                size != lora.byte_size
                or (before.st_size, before.st_mtime_ns, before.st_ctime_ns)
                != (after.st_size, after.st_mtime_ns, after.st_ctime_ns)
                or digest.hexdigest() != lora.sha256
            ):
                raise DerivativeError("GENERATION_INPUT_CHANGED", "LoRA changed after enqueue.")
    except OSError as error:
        raise DerivativeError("GENERATION_INPUT_CHANGED", "LoRA is unavailable.") from error
    snapshot = b"".join(chunks)
    try:
        header: object = json.loads(
            snapshot[8 : 8 + header_size], object_pairs_hook=_unique_header_fields
        )
        if not isinstance(header, dict):
            raise _unsupported("LoRA safetensors header must be an object.")
    except (ValueError, RecursionError) as error:
        raise _unsupported("LoRA safetensors header is invalid.") from error
    return snapshot


def qualify_lora_state(
    pipeline: Any, state: dict[str, Any], torch: Any
) -> tuple[dict[str, Any], tuple[QualifiedLoraTarget, ...]]:
    """Prove complete native conversion and match every pair to an actual module."""
    # Keep the derivatives-only environment independent of optional ML packages.
    converters = cast(Any, importlib.import_module("diffusers.utils.state_dict_utils"))

    if not state:
        raise _unsupported("LoRA must contain ordinary up/down tensor pairs.")
    groups: dict[str, dict[str, Any]] = {}
    for key, tensor in state.items():
        match = _KEY.fullmatch(key)
        if match is None:
            raise _unsupported("LoRA contains unsupported tensor keys or algorithms.")
        if tensor.dtype not in (torch.float16, torch.bfloat16, torch.float32):
            raise _unsupported("LoRA tensor dtype is unsupported.")
        if not bool(torch.isfinite(tensor).all().item()):
            raise _unsupported("LoRA contains non-finite tensors.")
        groups.setdefault(match[1], {})[match[2]] = tensor
    unet_names = [key for key in groups if key.startswith("lora_unet_")]
    sgm = any(
        re.search(r"_(?:input_blocks|middle_block|output_blocks)_", key) for key in unet_names
    )
    diffusers = any(re.search(r"_(?:down_blocks|mid_block|up_blocks)_", key) for key in unet_names)
    if sgm and diffusers:
        raise _unsupported("LoRA mixes SGM and Diffusers UNet naming.")

    normalized = dict(state)
    originals: dict[int, tuple[Any, float, int]] = {}
    for name, group in groups.items():
        if not {"lora_down.weight", "lora_up.weight"} <= group.keys():
            raise _unsupported("LoRA contains an incomplete tensor pair.")
        down, up = group["lora_down.weight"], group["lora_up.weight"]
        if down.ndim not in (2, 4) or up.ndim != down.ndim or min(down.shape) < 1:
            raise _unsupported("LoRA tensor dimensions are unsupported.")
        rank = int(down.shape[0])
        if up.shape[1] != rank or min(up.shape) < 1:
            raise _unsupported("LoRA tensor ranks do not match.")
        alpha_tensor = group.get("alpha")
        if alpha_tensor is not None and alpha_tensor.ndim != 0:
            raise _unsupported("LoRA alpha must be a finite scalar.")
        alpha = float(rank if alpha_tensor is None else alpha_tensor.item())
        # Native PEFT uses a common alpha for unspecified modules when some are supplied.
        # Supplying the documented rank default for every missing alpha preserves scale 1.
        if alpha_tensor is None:
            normalized[name + ".alpha"] = torch.tensor(float(rank), dtype=torch.float32)
        originals[id(down)] = (up, alpha, rank)

    try:
        converted, alphas = pipeline.lora_state_dict(normalized, unet_config=pipeline.unet.config)
        if len(converted) != 2 * len(groups) or len(alphas) != len(groups):
            raise _unsupported("LoRA native conversion did not preserve every tensor pair.")
        targets: list[QualifiedLoraTarget] = []
        consumed: set[str] = set()
        for component in _COMPONENTS:
            subset = {
                key[len(component) + 1 :]: tensor
                for key, tensor in converted.items()
                if key.startswith(component + ".")
            }
            if not subset:
                continue
            peft = cast(
                dict[str, Any],
                (
                    converters.convert_unet_state_dict_to_peft(subset)
                    if component == "unet"
                    else converters.convert_state_dict_to_peft(
                        converters.convert_state_dict_to_diffusers(
                            subset, original_type=converters.StateDictType.DIFFUSERS_OLD
                        ),
                        original_type=converters.StateDictType.DIFFUSERS,
                    )
                ),
            )
            model = getattr(pipeline, component)
            for key, down in peft.items():
                if not key.endswith(".lora_A.weight"):
                    continue
                path = key.removesuffix(".lora_A.weight")
                up_key = path + ".lora_B.weight"
                up = peft[up_key]
                original_up, alpha, rank = originals[id(down)]
                if up is not original_up:
                    raise _unsupported("LoRA native conversion changed tensor pairing.")
                module = model.get_submodule(path)
                if hasattr(module, "get_base_layer"):
                    module = module.get_base_layer()
                if isinstance(module, torch.nn.Linear):
                    expected_down = (rank, module.in_features)
                    expected_up = (module.out_features, rank)
                elif isinstance(module, torch.nn.Conv2d) and module.groups == 1:
                    expected_down = (rank, module.in_channels, *module.kernel_size)
                    expected_up = (module.out_channels, rank, 1, 1)
                else:
                    raise _unsupported("LoRA target module is unsupported.")
                if tuple(down.shape) != expected_down or tuple(up.shape) != expected_up:
                    raise _unsupported("LoRA tensor shapes do not match the loaded model.")
                consumed.update((component + "." + key, component + "." + up_key))
                targets.append(QualifiedLoraTarget(component, path, down, up, alpha, rank))
        if len(consumed) != len(converted) or len(targets) != len(groups):
            raise _unsupported("LoRA contains unconsumed or duplicate target tensors.")
    except DerivativeError:
        raise
    except Exception as error:
        raise _unsupported("LoRA naming or targets do not match the loaded model.") from error
    canonical: dict[str, Any] = {}
    for target in targets:
        stem = target.component + "." + target.path
        canonical[stem + ".lora_A.weight"] = target.down
        canonical[stem + ".lora_B.weight"] = target.up
    return canonical, tuple(targets)


def _load_native_targets(
    pipeline: Any, canonical: dict[str, Any], targets: tuple[QualifiedLoraTarget, ...], name: str
) -> None:
    """Use public native loaders with exact configuration instead of format guessing.

    The pinned TE loader guesses formats and derives ranks only for q/k/v/out/fc
    targets. Explicit metadata supports valid isolated attention/MLP/projection
    subsets and per-module alpha without copying or modifying a weight tensor.
    This metadata is derived here; safetensors metadata is never trusted.
    """
    for component in _COMPONENTS:
        component_targets = [target for target in targets if target.component == component]
        if not component_targets:
            continue
        first = component_targets[0]
        config: dict[str, Any] = {
            "r": first.rank,
            "lora_alpha": first.alpha,
            "rank_pattern": {target.path: target.rank for target in component_targets},
            "alpha_pattern": {target.path: target.alpha for target in component_targets},
            "target_modules": [target.path for target in component_targets],
            "use_dora": False,
            "lora_bias": False,
        }
        metadata = {component + "." + key: value for key, value in config.items()}
        if component == "unet":
            pipeline.load_lora_into_unet(
                canonical,
                None,
                pipeline.unet,
                adapter_name=name,
                _pipeline=pipeline,
                low_cpu_mem_usage=False,
                metadata=metadata,
            )
        else:
            # Pinned PEFT->Diffusers auto conversion maps attention names only.
            # The public loader also accepts current Diffusers linear-layer keys;
            # use that unambiguous format for every validated CLIP Linear target.
            text_state: dict[str, Any] = {}
            for target in component_targets:
                stem = component + "." + target.path + ".lora_linear_layer."
                text_state[stem + "down.weight"] = target.down
                text_state[stem + "up.weight"] = target.up
            pipeline.load_lora_into_text_encoder(
                text_state,
                None,
                getattr(pipeline, component),
                prefix=component,
                adapter_name=name,
                _pipeline=pipeline,
                low_cpu_mem_usage=False,
                metadata=metadata,
            )


def load_generation_loras(pipeline: Any, loras: tuple[GenerationLora, ...], torch: Any) -> None:
    """Load into this job's fresh pipeline, then activate the exact signed stack."""
    if not loras:
        return
    safetensors = cast(Any, importlib.import_module("safetensors.torch"))

    if len({lora.path for lora in loras}) != len(loras):
        raise _unsupported("Enabled LoRAs must be distinct.")
    names: list[str] = []
    qualified: list[tuple[str, GenerationLora, tuple[QualifiedLoraTarget, ...]]] = []
    for index, lora in enumerate(loras):
        if not math.isfinite(lora.weight):
            raise _unsupported("LoRA weight must be finite.")
        snapshot = read_lora_snapshot(lora)
        try:
            state = cast(dict[str, Any], safetensors.load(snapshot))
        except Exception as error:
            raise _unsupported("LoRA safetensors data is invalid.") from error
        canonical, targets = qualify_lora_state(pipeline, state, torch)
        name = f"igs_lora_{index}"
        try:
            _load_native_targets(pipeline, canonical, targets, name)
        except Exception as error:
            raise _unsupported("Native LoRA loading failed.") from error
        names.append(name)
        qualified.append((name, lora, targets))
    pipeline.set_adapters(names, adapter_weights=[lora.weight for lora in loras])
    for name, lora, targets in qualified:
        for target in targets:
            module = getattr(pipeline, target.component).get_submodule(target.path)
            expected_scale = lora.weight * target.alpha / target.rank
            if (
                not math.isfinite(expected_scale)
                or name not in module.active_adapters
                or module.r.get(name) != target.rank
                or module.lora_alpha.get(name) != target.alpha
                or module.scaling.get(name) != expected_scale
                or not bool(
                    torch.isfinite(torch.tensor(expected_scale, dtype=module.weight.dtype)).item()
                )
            ):
                raise _unsupported("LoRA effective scale is not finite in the inference dtype.")
            for actual, expected in (
                (module.lora_A[name].weight, target.down),
                (module.lora_B[name].weight, target.up),
            ):
                if not bool(torch.isfinite(actual).all().item()) or not torch.equal(
                    actual.detach().cpu(), expected.to(dtype=actual.dtype)
                ):
                    raise _unsupported("Native LoRA loading lost or overflowed a tensor.")


@contextmanager
def finite_lora_outputs(pipeline: Any, torch: Any) -> Generator[None]:
    """Refuse numeric overflow before Diffusers turns non-finite values into pixels."""

    def check(_module: Any, _args: Any, output: Any) -> None:
        tensor = cast(
            Any, output[0] if isinstance(output, tuple) else getattr(output, "sample", output)
        )
        if not bool(torch.isfinite(tensor).all().item()):
            raise DerivativeError(
                "GENERATION_WORKER_FAILED", "LoRA inference produced non-finite values."
            )

    handles = [
        pipeline.unet.register_forward_hook(check),
        pipeline.vae.decoder.register_forward_hook(check),
    ]
    try:
        yield
    finally:
        for handle in handles:
            handle.remove()
