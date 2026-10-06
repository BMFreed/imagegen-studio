"""Trained local LaMa CPU evidence for internal conditioning, without diffusion or publication.

Supply the pinned release asset and external Invoke checkout. This script never
downloads weights or modifies the installed application runtime. Synthetic source
pixels and a constant generated image qualify boundaries, not generation quality.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import io
import json
import os
import subprocess
from pathlib import Path
from typing import Any, cast

import numpy as np
import torch
from PIL import Image

from imagegen_worker.derivatives import SRGB_ICC_PROFILE
from imagegen_worker.lama_infill import load_local_lama
from imagegen_worker.outpaint_conditioning import (
    create_outpaint_contribution,
    prepare_outpaint_conditioning,
)

UPSTREAM_LAMA_SHA256 = "15562f2c69436f02e8934e95bd7de765233e153caa469ca596991ab77baf64cf"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main_context(source: Image.Image) -> dict[str, Any]:
    encoded = io.BytesIO()
    source.save(encoded, format="PNG", icc_profile=SRGB_ICC_PROFILE)
    root = Path(__file__).resolve().parents[1]
    program = (
        "import {freezeAlphaOutpaintConditioning as freeze} "
        "from './src/main/projects/outpaint-conditioning.ts';"
        "import {readFileSync} from 'node:fs';"
        "const x=JSON.parse(readFileSync(0,'utf8'));"
        "const f=freeze({bbox:x.bbox,sourceTargetSha256:x.sha256,"
        "targetPngBytes:Buffer.from(x.png,'hex')});"
        "process.stdout.write(JSON.stringify(f.context));"
    )
    context = json.loads(
        subprocess.check_output(
            [str(root / "node_modules/.bin/tsx"), "-e", program],
            cwd=root,
            input=json.dumps(
                {
                    "bbox": {
                        "x": -32,
                        "y": 16,
                        "width": source.width,
                        "height": source.height,
                    },
                    "sha256": digest(encoded.getvalue()),
                    "png": encoded.getvalue().hex(),
                }
            ),
            text=True,
        )
    )
    if context["keepMask"]["sha256"] != digest(source.getchannel("A").tobytes()):
        raise AssertionError("Main's frozen keep mask differs from the actual RGBA source.")
    return cast(dict[str, Any], context)


def external_lama(source_path: Path, model_path: Path) -> Any:
    source = source_path.read_bytes()
    if digest(source) != UPSTREAM_LAMA_SHA256:
        raise AssertionError("External Invoke LaMa source differs from the pinned oracle.")
    tree = ast.parse(source)
    nodes = [
        node
        for node in tree.body
        if isinstance(node, (ast.ClassDef, ast.FunctionDef)) and node.name in ("norm_img", "LaMA")
    ]

    def effective_device(_model: object) -> torch.device:
        return torch.device("cpu")

    namespace: dict[str, Any] = {
        "np": np,
        "torch": torch,
        "Image": Image,
        "get_effective_device": effective_device,
    }
    module = ast.Module(
        body=[ast.parse("from __future__ import annotations").body[0], *nodes],
        type_ignores=[],
    )
    # Execute only methods from the SHA-verified independent external source.
    exec(  # noqa: S102
        compile(ast.fix_missing_locations(module), str(source_path), "exec"), namespace
    )
    native_jit = cast(Any, torch.jit)
    return namespace["LaMA"](native_jit.load(str(model_path), map_location="cpu").eval())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lama", type=Path, required=True)
    parser.add_argument("--invoke-source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = cast(Path, args.output).resolve()
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    model_path = cast(Path, args.lama).resolve(strict=True)
    source_path = (
        cast(Path, args.invoke_source).resolve(strict=True)
        / "invokeai/backend/image_util/infill_methods/lama.py"
    )
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    torch.set_num_threads(4)
    rows: list[dict[str, Any]] = []
    model: Any = None
    oracle: Any = None
    for name in ("binary", "soft-edge", "uniform-soft"):
        pixels = np.zeros((128, 256, 4), dtype=np.uint8)
        pixels[:, :, 0] = np.arange(256, dtype=np.uint8)
        pixels[:, :, 1] = np.arange(128, dtype=np.uint8)[:, None]
        pixels[:, :, 2] = 97
        pixels[:, :, 3] = 255
        pixels[:, :64, 3] = 0
        if name == "soft-edge":
            pixels[:, 64:80, 3] = 128
            pixels[:, 80:88, 3] = 254
        elif name == "uniform-soft":
            pixels[:, :, 3] = 128
        source = Image.fromarray(pixels)
        source.info["icc_profile"] = SRGB_ICC_PROFILE
        original = source.tobytes()
        context = main_context(source)
        resource = context["infillResource"]
        if model is None:
            model = load_local_lama(
                model_path,
                expected_sha256=resource["sha256"],
                expected_byte_size=resource["byteSize"],
            )
            oracle = external_lama(source_path, model_path)
        infilled = model.infill(source)
        expected = oracle(source)
        if infilled.tobytes() != expected.tobytes() or infilled.mode != "RGB":
            raise AssertionError(
                f"{name}: trained local LaMa differs from the external Invoke wrapper."
            )
        if model.infill(source).tobytes() != infilled.tobytes():
            raise AssertionError(f"{name}: CPU LaMa replay differs.")
        policy = context["policy"]
        conditioning = prepare_outpaint_conditioning(
            source,
            coherence_edge_radius=policy["edgeRadius"],
            minimum_denoise=policy["minimumDenoise"],
            output_fade_radius=policy["fadeDistance"],
        )
        contribution = create_outpaint_contribution(
            Image.new("RGB", source.size, (37, 89, 151)), conditioning
        )
        if contribution.mode != "RGBA" or source.tobytes() != original:
            raise AssertionError(f"{name}: contribution topology or original source changed.")
        if name != "uniform-soft":
            alpha = contribution.getchannel("A")
            if alpha.getpixel((0, 64)) != 255 or alpha.getpixel((255, 64)) != 0:
                raise AssertionError(f"{name}: generated core or protected far pixels differ.")
            if not any(0 < value < 255 for value in alpha.tobytes()):
                raise AssertionError(f"{name}: output fade has no intermediate alpha.")
        for label, image in (
            ("source", source),
            ("infilled", infilled),
            ("contribution", contribution),
        ):
            image.save(output / f"{name}-{label}.png", icc_profile=SRGB_ICC_PROFILE)
        rows.append(
            {
                "case": name,
                "context": context,
                "sourcePixelsSha256": digest(original),
                "infilledPixelsSha256": digest(infilled.tobytes()),
                "contributionPixelsSha256": digest(contribution.tobytes()),
                "invokeMatches": True,
                "replayMatches": True,
            }
        )
    report = {
        "boundary": "internal Main snapshot -> trained local CPU LaMa -> conditioning/contribution",
        "diffusionExecuted": False,
        "publicOutpaintActivated": False,
        "invokeLamaSourceSha256": UPSTREAM_LAMA_SHA256,
        "torchVersion": torch.__version__,
        "cases": rows,
    }
    (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"passed": len(rows), "failed": 0, "report": str(output / "report.json")}))


if __name__ == "__main__":
    main()
