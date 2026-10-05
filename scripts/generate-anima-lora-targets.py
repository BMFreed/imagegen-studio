"""Generate both trusted Anima Linear LoRA profiles from pinned native meta models.

Run with the qualified inference environment and worker-python/src on PYTHONPATH.
Uses the original checked-in checkpoint header and the official Anima namespace
converter. No weights, network calls, model installation or CUDA allocation.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import importlib
import importlib.metadata
import json
import os
import tempfile
from pathlib import Path
from typing import Any, cast

from imagegen_worker.inference_anima import ANIMA_BASE_ARCHITECTURE


def generate() -> tuple[str, str]:
    for package, expected in (
        ("torch", "2.7.1"),
        ("diffusers", "0.40.0"),
        ("transformers", "5.5.4"),
        ("accelerate", "1.14.0"),
    ):
        if importlib.metadata.version(package).split("+")[0] != expected:
            raise ValueError(f"This generator requires {package}=={expected}.")
    root = Path(__file__).resolve().parent.parent
    header_bytes = (root / "src/main/models/test-fixtures/anima-base-1-header.json.gz").read_bytes()
    header = cast(dict[str, Any], json.loads(gzip.decompress(header_bytes)))
    torch = cast(Any, importlib.import_module("torch"))
    diffusers = cast(Any, importlib.import_module("diffusers"))
    transformers = cast(Any, importlib.import_module("transformers"))
    accelerate = cast(Any, importlib.import_module("accelerate"))
    conversions = cast(Any, importlib.import_module("diffusers.loaders.lora_conversion_utils"))
    anima = cast(Any, importlib.import_module("imagegen_worker.inference_anima"))
    models = anima._create_native_models(
        ANIMA_BASE_ARCHITECTURE, torch, diffusers, transformers, accelerate
    )
    modules: dict[str, list[int]] = {
        f"{component}.{name}": list(module.weight.shape)
        for component in ("transformer", "text_conditioner", "qwen3_encoder")
        for name, module in models[component].named_modules()
        if isinstance(module, torch.nn.Linear)
    }
    groups: dict[str, set[str]] = {target: set() for target in modules}
    aliases: dict[str, str] = {}

    def add(target: str, names: list[str]) -> None:
        for alias in names:
            if alias in aliases and aliases[alias] != target:
                raise ValueError(f"Ambiguous target alias: {alias}")
            aliases[alias] = target
            groups[target].add(alias)

    # Sentinel identity verifies every original source matrix independently. The
    # official converter reads key names only, so no reusable weights are allocated.
    original_shapes = {
        key.removeprefix("model.diffusion_model.").removesuffix(".weight"): list(tensor["shape"])
        for key, tensor in header.items()
        if key.endswith(".weight") and len(tensor["shape"]) == 2
    }
    state = {
        f"diffusion_model.{original}.lora_{suffix}.weight": original
        for original in original_shapes
        for suffix in ("A", "B")
    }
    converted = cast(
        dict[str, str], conversions._convert_non_diffusers_anima_lora_to_diffusers(state)
    )
    if len(converted) != len(state):
        raise ValueError("Native Anima conversion discarded or merged source matrices.")
    original_targets: set[str] = set()
    excluded: list[str] = []
    for key, original in converted.items():
        if not key.endswith(".lora_A.weight"):
            continue
        target = key.removesuffix(".lora_A.weight")
        if converted[target + ".lora_B.weight"] != original:
            raise ValueError("Native Anima conversion changed source pair identity.")
        if target not in modules:
            # The original conditioner embedding matrix is deliberately outside
            # ordinary Linear support, even though it has a two-dimensional weight.
            if target != "text_conditioner.embed":
                raise ValueError(f"Unexpected non-Linear original matrix: {target}")
            excluded.append(target)
            continue
        if modules[target] != original_shapes[original]:
            raise ValueError(f"Native Anima target dimensions differ: {target}")
        original_targets.add(target)
        native = target.split(".", 1)[1]
        if target.startswith("text_conditioner."):
            add(
                target,
                [
                    "lora_unet_" + original.replace(".", "_"),
                    "diffusion_model." + original,
                    "transformer." + original,
                    "base_model.model.transformer." + original,
                    "llm_adapter." + native,
                    "text_conditioner." + native,
                    "base_model.model.text_conditioner." + native,
                ],
            )
        else:
            add(
                target,
                ["lora_unet_" + original.replace(".", "_")]
                + [
                    prefix + name
                    for prefix in (
                        "diffusion_model.",
                        "transformer.",
                        "base_model.model.transformer.",
                    )
                    for name in (original, native)
                ],
            )
    expected_original = {target for target in modules if not target.startswith("qwen3_encoder.")}
    if original_targets != expected_original or excluded != ["text_conditioner.embed"]:
        raise ValueError("The complete original checkpoint Linear target set differs from native.")
    for target in modules:
        if target.startswith("qwen3_encoder."):
            native = target.removeprefix("qwen3_encoder.")
            add(
                target,
                [
                    "lora_te_" + native.replace(".", "_"),
                    "qwen3_encoder." + native,
                    "base_model.model.qwen3_encoder." + native,
                ]
                + [
                    prefix + wrapper + native
                    for prefix in ("text_encoder.", "base_model.model.text_encoder.")
                    for wrapper in ("", "model.")
                ],
            )
    if not all(groups.values()) or len(modules) != 711:
        raise ValueError(
            "The pinned original Anima profile must cover all 711 native Linear targets."
        )
    rows = [
        {"aliases": sorted(names), "shape": modules[target], "target": target}
        for target, names in sorted(groups.items())
    ]
    lines = [
        "// Generated by scripts/generate-anima-lora-targets.py. Do not edit by hand.",
        "// Original Anima Base 1.0; InvokeAI 9e1540962bcca7f8fa668d7d8e02cf79d75fda3b.",
        (
            "// Native Diffusers 0.40.0 / Transformers 5.5.4 meta Linear modules "
            "and Anima key converter."
        ),
        "// Architecture/format qualification does not certify model lineage or image quality.",
        f"// Reference checkpoint header gzip SHA-256: {hashlib.sha256(header_bytes).hexdigest()}",
        "export const ANIMA_LORA_TARGET_PROFILE: readonly {",
        "  aliases: readonly string[]",
        "  shape: readonly [number, number]",
        "  target: string",
        "}[] = [",
    ]
    for row in rows:
        lines.extend(["  {", "    aliases: ["])
        lines.extend(f"      '{name}'," for name in cast(list[str], row["aliases"]))
        shape = cast(list[int], row["shape"])
        lines.extend(
            [
                "    ],",
                f"    shape: [{shape[0]}, {shape[1]}],",
                f"    target: '{row['target']}',",
                "  },",
            ]
        )
    lines.extend(
        [
            "]",
            f"// {len(rows)} native Linear targets; {len(aliases)} recognized aliases.",
            "",
        ]
    )
    # Prettier keeps two-element shapes inline while aliases stay multiline.
    # Render that representation directly so regeneration needs no formatter.
    json_lines = ["["]
    for index, row in enumerate(rows):
        names = cast(list[str], row["aliases"])
        shape = cast(list[int], row["shape"])
        json_lines.extend(["  {", '    "aliases": ['])
        json_lines.extend(
            "      " + json.dumps(name) + ("," if item < len(names) - 1 else "")
            for item, name in enumerate(names)
        )
        json_lines.extend(
            [
                "    ],",
                f'    "shape": [{shape[0]}, {shape[1]}],',
                '    "target": ' + json.dumps(row["target"]),
                "  }" + ("," if index < len(rows) - 1 else ""),
            ]
        )
    json_lines.extend(["]", ""])
    return "\n".join(lines), "\n".join(json_lines)


def atomic_write(destination: Path, value: str) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=destination.parent, delete=False
    ) as output:
        temporary = Path(output.name)
        try:
            output.write(value)
            output.flush()
            os.replace(temporary, destination)
        finally:
            temporary.unlink(missing_ok=True)


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-ts", type=Path, default=root / "src/main/models/anima-lora-target-profile.ts"
    )
    parser.add_argument(
        "--output-json",
        type=Path,
        default=root / "worker-python/src/imagegen_worker/resources/anima_lora_targets.json",
    )
    arguments = parser.parse_args()
    rendered_ts, rendered_json = generate()
    # Both outputs share one completely validated row collection; each replacement
    # is atomic and never exposes a truncated generated profile to its consumer.
    atomic_write(cast(Path, arguments.output_ts), rendered_ts)
    atomic_write(cast(Path, arguments.output_json), rendered_json)


if __name__ == "__main__":
    main()
