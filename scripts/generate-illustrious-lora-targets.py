"""Regenerate the TS header-qualification profile from pinned, unallocated ML modules.

Run with the qualified inference dependencies and a verified offline config:
python -I scripts/generate-illustrious-lora-targets.py --config /path/to/config
No weights, downloads, CUDA allocation or model installation are performed.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import importlib
import importlib.metadata
import json
from pathlib import Path
from typing import Any, cast

from imagegen_worker.inference_config import verify_pinned_config


def generate(config: Path) -> str:
    for package, version in (("diffusers", "0.40.0"), ("transformers", "5.5.4")):
        if importlib.metadata.version(package) != version:
            raise ValueError(f"This generator requires {package}=={version}.")

    torch = cast(Any, importlib.import_module("torch"))
    accelerate = cast(Any, importlib.import_module("accelerate"))
    diffusers = cast(Any, importlib.import_module("diffusers"))
    conversions = cast(Any, importlib.import_module("diffusers.loaders.lora_conversion_utils"))
    states = cast(Any, importlib.import_module("diffusers.utils.state_dict_utils"))
    transformers = cast(Any, importlib.import_module("transformers"))

    root = Path(__file__).resolve().parent.parent
    header_path = root / "src/main/models/test-fixtures/illustrious-v01-safetensors-header.gz"
    header_bytes = header_path.read_bytes()
    header: dict[str, Any] = json.loads(gzip.decompress(header_bytes)[8:])
    configs = {
        name: json.loads((config / name / "config.json").read_text())
        for name in ("unet", "text_encoder", "text_encoder_2")
    }
    with accelerate.init_empty_weights():
        models: dict[str, Any] = {
            "unet": diffusers.UNet2DConditionModel.from_config(configs["unet"]),
            "text_encoder": transformers.CLIPTextModel(
                transformers.CLIPTextConfig.from_dict(configs["text_encoder"])
            ),
            "text_encoder_2": transformers.CLIPTextModelWithProjection(
                transformers.CLIPTextConfig.from_dict(configs["text_encoder_2"])
            ),
        }
    modules: dict[str, list[int]] = {}
    aliases: dict[str, list[int]] = {}
    prefixes = {
        "unet": "lora_unet_",
        "text_encoder": "lora_te1_",
        "text_encoder_2": "lora_te2_",
    }
    for prefix, model in models.items():
        for name, module in model.named_modules():
            if isinstance(module, (torch.nn.Linear, torch.nn.Conv2d)):
                shape = list(module.weight.shape)
                modules[f"{prefix}.{name}"] = shape
                aliases[prefixes[prefix] + name.replace(".", "_")] = shape

    sgm_aliases: dict[str, list[int]] = {
        "lora_unet_"
        + name.removeprefix("model.diffusion_model.")
        .removesuffix(".weight")
        .replace(".", "_"): descriptor["shape"]
        for name, descriptor in header.items()
        if name.startswith("model.diffusion_model.")
        and name.endswith(".weight")
        and len(descriptor["shape"]) in (2, 4)
    }
    profile: dict[str, tuple[str, list[int]]] = {}
    omitted: list[str] = []
    # Convert namespaces separately: the pinned mapper drops SGM keys in a mixed file.
    # Sentinel strings preserve identity; these converters do not read tensor data.
    for source in (sgm_aliases, aliases):
        state = {
            f"{alias}.{suffix}": alias
            for alias in source
            for suffix in ("lora_down.weight", "lora_up.weight")
        }
        mapped = conversions._maybe_map_sgm_blocks_to_diffusers(state, models["unet"].config)
        converted = cast(
            dict[str, str],
            conversions._convert_non_diffusers_lora_to_diffusers(mapped)[0],
        )
        for prefix in models:
            subset = {
                key.removeprefix(prefix + "."): value
                for key, value in converted.items()
                if key.startswith(prefix + ".")
            }
            peft = (
                states.convert_unet_state_dict_to_peft(subset)
                if prefix == "unet"
                else states.convert_state_dict_to_peft(
                    subset, original_type=states.StateDictType.DIFFUSERS_OLD
                )
            )
            for name, alias in cast(dict[str, str], peft).items():
                if not name.endswith(".lora_A.weight"):
                    continue
                target = prefix + "." + name.removesuffix(".lora_A.weight")
                if target not in modules or modules[target] != source[alias]:
                    omitted.append(alias)
                    continue
                value = (target, modules[target])
                if alias in profile and profile[alias] != value:
                    raise ValueError(f"Ambiguous target alias: {alias}")
                profile[alias] = value

    groups: dict[str, tuple[list[int], list[str]]] = {}
    for alias, (target, shape) in sorted(profile.items()):
        groups.setdefault(target, (shape, []))[1].append(alias)
    hashes = {
        f"{name}/config.json": hashlib.sha256(
            (config / name / "config.json").read_bytes()
        ).hexdigest()
        for name in models
    }
    lines = [
        "// Generated by scripts/generate-illustrious-lora-targets.py. Do not edit by hand.",
        "// Native Diffusers 0.40.0 / Transformers 5.5.4 modules and key converters.",
        "// This table qualifies architecture/format; it does not certify lineage or quality.",
        f"// Reference header gzip SHA-256: {hashlib.sha256(header_bytes).hexdigest()}",
        "// Config SHA-256: " + json.dumps(hashes, sort_keys=True),
        "// Native converter cannot resolve these aliases: " + ", ".join(sorted(omitted)),
        "export const ILLUSTRIOUS_LORA_TARGET_PROFILE: readonly {",
        "  aliases: readonly string[]",
        "  shape: readonly number[]",
        "  target: string",
        "}[] = [",
    ]
    lines.extend(
        "  " + json.dumps({"aliases": names, "shape": shape, "target": target}) + ","
        for target, (shape, names) in sorted(groups.items())
    )
    lines.extend(
        [
            "]",
            f"// {len(groups)} distinct native targets; {len(profile)} recognized Kohya aliases.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    arguments = parser.parse_args()
    config = verify_pinned_config(str(cast(Path, arguments.config).resolve(strict=True)))
    rendered = generate(config)
    destination = cast(Path | None, arguments.output)
    if destination is None:
        print(rendered, end="")
    else:
        destination.write_text(rendered)


if __name__ == "__main__":
    main()
