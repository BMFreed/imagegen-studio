"""Strict ordinary Anima LoRA snapshots and scoped native PEFT application.

Aliases come from the checked native profile shared with Main. Shapes and every
loaded tensor are verified against the actual models, before either prompt is
encoded. Safetensors metadata cannot choose a loader or inject configuration.
"""

from __future__ import annotations

import importlib
import importlib.metadata
import json
import math
import re
from collections.abc import Generator
from contextlib import contextmanager
from functools import lru_cache
from importlib import resources
from pathlib import Path
from typing import Any, cast

from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.inference_anima import LoadedAnimaModels
from imagegen_worker.inference_lora import QualifiedLoraTarget, read_lora_snapshot
from imagegen_worker.protocol import GenerationLora

_COMPONENTS = ("transformer", "text_conditioner", "qwen3_encoder")
_KEY = re.compile(
    r"(.+)\.(lora_down\.weight|lora_up\.weight|lora_A\.weight|lora_B\.weight|alpha)\Z"
)


def _unsupported(message: str) -> DerivativeError:
    return DerivativeError("GENERATION_LORA_UNSUPPORTED", message)


def capture_anima_loras(value: object) -> tuple[GenerationLora, ...]:
    """Freeze internal input before callbacks, imports or native model mutation."""
    if not isinstance(value, (list, tuple)):
        raise _unsupported("Anima LoRAs must be an exact resource sequence.")
    captured: list[GenerationLora] = []
    for item in cast(list[object] | tuple[object, ...], value):
        if not isinstance(item, GenerationLora):
            raise _unsupported("Anima LoRA resource is invalid.")
        try:
            finite_weight = type(item.weight) in (int, float) and math.isfinite(item.weight)
        except OverflowError:
            finite_weight = False
        if (
            not finite_weight
            or not isinstance(cast(object, item.path), Path)
            or type(item.byte_size) is not int
            or item.byte_size < 10
            or type(item.sha256) is not str
            or re.fullmatch(r"[a-f0-9]{64}", item.sha256) is None
        ):
            raise _unsupported("Anima LoRA identity or finite weight is invalid.")
        captured.append(GenerationLora(item.path, item.sha256, item.byte_size, item.weight))
    if len({item.path for item in captured}) != len(captured):
        raise _unsupported("Enabled Anima LoRAs must be distinct.")
    return tuple(captured)


@lru_cache(maxsize=1)
def _aliases() -> dict[str, tuple[str, str]]:
    profile = cast(
        list[dict[str, Any]],
        json.loads(
            resources.files("imagegen_worker")
            .joinpath("resources", "anima_lora_targets.json")
            .read_text(encoding="utf-8")
        ),
    )
    result: dict[str, tuple[str, str]] = {}
    for row in profile:
        component, path = row["target"].split(".", maxsplit=1)
        if component not in _COMPONENTS:
            raise _unsupported("Bundled Anima LoRA profile is invalid.")
        for alias in row["aliases"]:
            if alias in result:
                raise _unsupported("Bundled Anima LoRA aliases are ambiguous.")
            result[alias] = (component, path)
    return result


def qualify_anima_lora_state(
    models: LoadedAnimaModels, state: dict[str, Any], torch: Any
) -> tuple[QualifiedLoraTarget, ...]:
    """Refuse partial native loading: every tensor belongs to one ordinary pair."""
    if not state:
        raise _unsupported("Anima LoRA must contain ordinary Linear tensor pairs.")
    aliases = _aliases()
    groups: dict[str, dict[str, Any]] = {}
    styles: set[str] = set()
    for key, tensor in state.items():
        match = _KEY.fullmatch(key)
        if match is None or match[1] not in aliases:
            raise _unsupported("Anima LoRA contains unsupported targets or algorithms.")
        stem, role = match[1], match[2]
        kohya = stem.startswith(("lora_unet_", "lora_te_"))
        if role != "alpha":
            expected = (
                ("lora_down.weight", "lora_up.weight")
                if kohya
                else ("lora_A.weight", "lora_B.weight")
            )
            if role not in expected:
                raise _unsupported("Anima LoRA suffix style does not match its namespace.")
            styles.add("kohya" if kohya else "peft")
        if (
            not torch.is_tensor(tensor)
            or tensor.dtype not in (torch.float16, torch.bfloat16, torch.float32)
            or not bool(torch.isfinite(tensor).all().item())
        ):
            raise _unsupported("Anima LoRA tensors require finite floating point data.")
        groups.setdefault(stem, {})[role] = tensor
    if len(styles) != 1:
        raise _unsupported("Anima LoRA mixes tensor suffix styles.")

    targets: list[QualifiedLoraTarget] = []
    consumed: set[tuple[str, str]] = set()
    for stem, group in groups.items():
        component, path = aliases[stem]
        if (component, path) in consumed:
            raise _unsupported("Anima LoRA aliases collide on the same native target.")
        consumed.add((component, path))
        down_key, up_key = (
            ("lora_down.weight", "lora_up.weight")
            if stem.startswith(("lora_unet_", "lora_te_"))
            else ("lora_A.weight", "lora_B.weight")
        )
        if not {down_key, up_key} <= group.keys():
            raise _unsupported("Anima LoRA tensor pair is incomplete.")
        down, up = group[down_key], group[up_key]
        try:
            module = getattr(models, component).get_submodule(path)
        except (AttributeError, KeyError) as error:
            raise _unsupported("Anima LoRA target is absent from the native model.") from error
        if not isinstance(module, torch.nn.Linear) or hasattr(module, "lora_A"):
            raise _unsupported("Anima LoRA requires an ordinary unadapted Linear target.")
        if down.ndim != 2 or up.ndim != 2 or min(down.shape) < 1:
            raise _unsupported("Anima LoRA tensor dimensions are unsupported.")
        rank = int(down.shape[0])
        if tuple(down.shape) != (rank, module.in_features) or tuple(up.shape) != (
            module.out_features,
            rank,
        ):
            raise _unsupported("Anima LoRA pair rank or target dimensions differ.")
        alpha_tensor = group.get("alpha")
        if alpha_tensor is not None and alpha_tensor.ndim != 0:
            raise _unsupported("Anima LoRA alpha must be a finite scalar.")
        alpha = float(rank if alpha_tensor is None else alpha_tensor.item())
        targets.append(QualifiedLoraTarget(component, path, down, up, alpha, rank))
    return tuple(targets)


def _config(targets: list[QualifiedLoraTarget]) -> dict[str, Any]:
    first = targets[0]
    return {
        "r": first.rank,
        "lora_alpha": first.alpha,
        "rank_pattern": {target.path: target.rank for target in targets},
        "alpha_pattern": {target.path: target.alpha for target in targets},
        "target_modules": "^(?:" + "|".join(re.escape(target.path) for target in targets) + ")$",
        "bias": "none",
        "use_dora": False,
        "lora_bias": False,
        "init_lora_weights": False,
        "inference_mode": True,
    }


def _load_component(
    model: Any, component: str, targets: list[QualifiedLoraTarget], name: str
) -> None:
    # Qwen's native loader can assign CPU parameter storage from these tensors.
    # Keep the captured verification reference independent of native mutation.
    state = {
        target.path + ".lora_" + role + ".weight": tensor.clone()
        for target in targets
        for role, tensor in (("A", target.down), ("B", target.up))
    }
    config = _config(targets)
    if component == "qwen3_encoder":
        peft = cast(Any, importlib.import_module("peft"))
        # State+derived config never asks Transformers to resolve a model ID.
        model.load_adapter(
            adapter_name=name,
            peft_config=peft.LoraConfig(**config),
            adapter_state_dict=state,
            hotswap=False,
        )
    else:
        model.load_lora_adapter(
            {component + "." + key: value for key, value in state.items()},
            prefix=component,
            adapter_name=name,
            metadata={component + "." + key: value for key, value in config.items()},
            low_cpu_mem_usage=False,
        )
    model.eval()


def _verify_loaded(
    models: LoadedAnimaModels,
    name: str,
    lora: GenerationLora,
    targets: tuple[QualifiedLoraTarget, ...],
    torch: Any,
) -> None:
    expected_targets = {(target.component, target.path) for target in targets}
    actual_targets = {
        (component, path)
        for component in _COMPONENTS
        for path, module in getattr(models, component).named_modules()
        if hasattr(module, "lora_A") and name in module.lora_A
    }
    if actual_targets != expected_targets:
        raise _unsupported("Anima native loading did not preserve the exact target set.")
    for target in targets:
        module = getattr(models, target.component).get_submodule(target.path)
        # Match pinned PEFT set_scale's evaluation order, including FP rounding.
        scale = lora.weight * target.alpha / target.rank
        if (
            not math.isfinite(scale)
            or name not in module.active_adapters
            or module.r.get(name) != target.rank
            or module.lora_alpha.get(name) != target.alpha
            or module.scaling.get(name) != scale
            or not bool(torch.isfinite(torch.tensor(scale, dtype=module.weight.dtype)).item())
        ):
            raise _unsupported("Anima native adapter scaling is invalid or non-finite.")
        for actual, expected in (
            (module.lora_A[name].weight, target.down),
            (module.lora_B[name].weight, target.up),
        ):
            if not bool(torch.isfinite(actual).all().item()) or not torch.equal(
                actual.detach().cpu(), expected.to(dtype=actual.dtype)
            ):
                raise _unsupported("Anima native loading lost or overflowed a tensor.")


@contextmanager
def scoped_anima_generation_loras(
    models: LoadedAnimaModels, loras: tuple[GenerationLora, ...], torch: Any
) -> Generator[None]:
    captured = capture_anima_loras(loras)
    if not captured:
        yield
        return
    for package, version in (
        ("diffusers", "0.40.0"),
        ("transformers", "5.5.4"),
        ("peft", "0.21.2"),
    ):
        if importlib.metadata.version(package) != version:
            raise DerivativeError("INFERENCE_UNAVAILABLE", "Pinned Anima adapter runtime differs.")
    component_models = {component: getattr(models, component) for component in _COMPONENTS}
    if any(
        model.training
        or getattr(model, "peft_config", {})
        or any(hasattr(module, "lora_A") for module in model.modules())
        for model in component_models.values()
    ):
        raise _unsupported("Anima scoped adapters require unadapted eval models.")
    safetensors = cast(Any, importlib.import_module("safetensors.torch"))
    qualified: list[tuple[str, GenerationLora, tuple[QualifiedLoraTarget, ...]]] = []
    # All files are captured/qualified before any mutation of the reused models.
    for index, lora in enumerate(captured):
        snapshot = read_lora_snapshot(lora)
        try:
            state = cast(dict[str, Any], safetensors.load(snapshot))
        except Exception as error:
            raise _unsupported("Anima LoRA safetensors data is invalid.") from error
        targets = qualify_anima_lora_state(models, state, torch)
        qualified.append((f"igs_anima_lora_{index}", lora, targets))

    attempted: set[str] = set()
    adapter_flags = {
        component: getattr(model, "_hf_peft_config_loaded", False)
        for component, model in component_models.items()
    }
    gradient_flags = [
        (parameter, parameter.requires_grad)
        for model in component_models.values()
        for parameter in model.parameters()
    ]
    cuda_devices = sorted(
        {
            parameter.device.index
            for model in component_models.values()
            for parameter in model.parameters()
            if parameter.device.type == "cuda"
        }
    )
    try:
        # Native adapter constructors initialize Linear layers using global RNG.
        with torch.random.fork_rng(devices=cuda_devices):
            for name, _lora, targets in qualified:
                for component, model in component_models.items():
                    subset = [target for target in targets if target.component == component]
                    if subset:
                        attempted.add(component)
                        try:
                            _load_component(model, component, subset, name)
                        except Exception as error:
                            raise _unsupported("Anima native adapter loading failed.") from error
        text_scaling = cast(Any, importlib.import_module("diffusers.loaders.lora_base"))
        for component, model in component_models.items():
            stack = [
                (name, lora.weight)
                for name, lora, targets in qualified
                if any(target.component == component for target in targets)
            ]
            if not stack:
                continue
            names, weights = [item[0] for item in stack], [item[1] for item in stack]
            if component == "qwen3_encoder":
                text_scaling.set_adapters_for_text_encoder(names, model, weights)
            else:
                model.set_adapters(names, weights)
        for name, lora, targets in qualified:
            _verify_loaded(models, name, lora, targets, torch)
        # PEFT computes B(A(x)) before multiplying by the scale. Even finite
        # matrices can overflow there, and 0 * Inf is NaN. Verify every loaded
        # resource first, then use native per-layer activation to skip exactly
        # zero contributions (weight, alpha or double-precision underflow).
        for model in component_models.values():
            for module in model.modules():
                if hasattr(module, "lora_A"):
                    module.set_adapter(
                        [
                            name
                            for name in module.active_adapters
                            if name in module.lora_A and module.scaling[name] != 0
                        ],
                        inference_mode=True,
                    )
        yield
    finally:
        cleanup_errors: list[Exception] = []
        for component in reversed(_COMPONENTS):
            if component not in attempted:
                continue
            model = component_models[component]
            try:
                if component == "qwen3_encoder":
                    # Injection can fail before Transformers marks an adapter
                    # loaded; its delete_adapter would then refuse cleanup.
                    # Native unwrapping works independently of that flag.
                    native_cleanup = cast(
                        Any, importlib.import_module("diffusers.utils.peft_utils")
                    )
                    native_cleanup.recurse_remove_peft_layers(model)
                    if hasattr(model, "peft_config"):
                        del model.peft_config
                else:
                    model.unload_lora()
                model._hf_peft_config_loaded = adapter_flags[component]
                if any(hasattr(module, "lora_A") for module in model.modules()) or getattr(
                    model, "peft_config", {}
                ):
                    raise _unsupported("Anima native adapter cleanup is incomplete.")
            except Exception as error:
                cleanup_errors.append(error)
        for parameter, enabled in gradient_flags:
            parameter.requires_grad_(enabled)
        if cleanup_errors:
            raise DerivativeError(
                "GENERATION_WORKER_FAILED", "Anima adapter cleanup failed."
            ) from cleanup_errors[0]
