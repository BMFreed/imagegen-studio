"""Actual pinned Illustrious LoRA parser/loader/generation evidence, without downloads.

Supply a self-contained checkpoint, an ordinary Kohya Illustrious LoRA and the
verified offline architecture config. This is a development GPU probe, not release
runtime installation or general model/adapter quality qualification.
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import os
from pathlib import Path
from typing import Any, cast

from PIL import Image, ImageChops

from imagegen_worker.derivatives import PINNED_SRGB_ICC_SHA256, SRGB_ICC_PROFILE
from imagegen_worker.inference import INFERENCE_WORKER_VERSION, qualify_ml_runtime
from imagegen_worker.inference_config import verify_pinned_config
from imagegen_worker.inference_main import (
    inference_ready_message,
    process_inference_request,
)


def file_digest(file: Path) -> str:
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        while chunk := stream.read(8 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--lora", type=Path, required=True)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--prediction-type", choices=("epsilon", "v_prediction"), required=True)
    arguments = parser.parse_args()
    checkpoint = cast(Path, arguments.checkpoint).resolve(strict=True)
    lora = cast(Path, arguments.lora).resolve(strict=True)
    config = verify_pinned_config(str(cast(Path, arguments.config).resolve(strict=True)))
    output = cast(Path, arguments.output).resolve()
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    runtime = qualify_ml_runtime()
    torch = cast(Any, runtime.torch)
    checkpoint_sha256 = file_digest(checkpoint)
    lora_sha256 = file_digest(lora)
    pixels: dict[str, Image.Image] = {}
    records: list[dict[str, object]] = []
    cases = (
        ("empty", None, False),
        ("zero", 0.0, False),
        ("active", 0.7, False),
        ("replay", 0.7, False),
        ("half", 0.35, False),
        ("negative", -0.5, False),
        ("img-empty", None, True),
        ("img-active", 0.7, True),
    )
    for name, weight, opaque in cases:
        stage = output / name
        stage.mkdir(mode=0o700)
        target = stage / "target.png"
        image = Image.new("RGBA", (128, 128))
        cast(Any, image).putdata(
            [(20 + x, 100, 180 - y, 255 if opaque else 0) for y in range(128) for x in range(128)]
        )
        image.save(target, icc_profile=SRGB_ICC_PROFILE)
        target.chmod(0o600)
        sampling: dict[str, object] = {
            "steps": 4,
            "cfgScale": 7,
            "seed": 42,
            "scheduler": "dpmpp_2m_k",
            "cfgRescale": 0.0,
        }
        if opaque:
            sampling["denoisingStrength"] = 0.75
        request: dict[str, object] = {
            "type": "generate-illustrious-img2img" if opaque else "generate-illustrious-txt2img",
            "protocolVersion": "1",
            "requestId": name,
            "job": {
                "schemaVersion": 1,
                "checkpoint": {
                    "path": str(checkpoint),
                    "sha256": checkpoint_sha256,
                    "predictionType": arguments.prediction_type,
                },
                "loras": []
                if weight is None
                else [
                    {
                        "path": str(lora),
                        "sha256": lora_sha256,
                        "byteSize": lora.stat().st_size,
                        "weight": weight,
                    }
                ],
                "target": {
                    "path": str(target),
                    "sha256": file_digest(target),
                    "byteSize": target.stat().st_size,
                    "width": 128,
                    "height": 128,
                    "iccSha256": PINNED_SRGB_ICC_SHA256,
                },
                "bbox": {"x": -8, "y": 16, "width": 128, "height": 128},
                "prompts": {
                    "positive": "still life, ceramic cup, soft studio lighting",
                    "negative": "blurry, low quality",
                },
                "sampling": sampling,
                "output": {
                    "stagingRoot": str(stage),
                    "pngPath": str(stage / "result.png"),
                },
            },
        }
        (stage / "request.json").write_text(json.dumps(request, indent=2))
        progress: list[dict[str, object]] = []
        done = process_inference_request(
            request,
            config_dir=config,
            runtime=runtime,
            on_progress=progress.append,
        )
        if done["type"] != "generation-done":
            raise AssertionError(f"Production request failed: {done}")
        with Image.open(stage / "result.png") as published:
            if (
                published.size != (128, 128)
                or published.info.get("icc_profile") != SRGB_ICC_PROFILE
            ):
                raise AssertionError("Published output changed size or pinned sRGB profile.")
            pixels[name] = published.convert("RGB")
        if not progress or progress[-1]["step"] != progress[-1]["totalSteps"]:
            raise AssertionError("Production denoising progress did not reach the actual schedule.")
        records.append(
            {
                "name": name,
                "weight": weight,
                "opaque": opaque,
                "pixelSha256": hashlib.sha256(pixels[name].tobytes()).hexdigest(),
                "pngSha256": file_digest(stage / "result.png"),
                "progress": progress,
                "done": done,
            }
        )
        print(f"PASS production GPU LoRA {name}; callbacks={len(progress)}", flush=True)
        gc.collect()
        torch.cuda.empty_cache()
    checks = {
        "zeroEqualsEmpty": pixels["zero"].tobytes() == pixels["empty"].tobytes(),
        "replayEqual": pixels["active"].tobytes() == pixels["replay"].tobytes(),
        "adapterChangesPixels": ImageChops.difference(pixels["active"], pixels["empty"]).getbbox()
        is not None,
        "weightChangesPixels": ImageChops.difference(pixels["active"], pixels["half"]).getbbox()
        is not None,
        "negativeChangesPixels": ImageChops.difference(
            pixels["negative"], pixels["active"]
        ).getbbox()
        is not None,
        "imgAdapterChangesPixels": ImageChops.difference(
            pixels["img-active"], pixels["img-empty"]
        ).getbbox()
        is not None,
    }
    report = {
        "workerVersion": INFERENCE_WORKER_VERSION,
        "ready": inference_ready_message(),
        "checkpointSha256": checkpoint_sha256,
        "loraSha256": lora_sha256,
        "cases": records,
        "checks": checks,
        "scope": "Pinned local development CUDA, one actual LoRA/checkpoint, 128x128, four steps.",
    }
    (output / "report.json").write_text(json.dumps(report, indent=2))
    if not all(checks.values()):
        raise AssertionError(f"Actual GPU LoRA controls failed: {checks}")
    print("PASS actual GPU adapter/weight/zero/replay/img2img pixel controls", flush=True)


if __name__ == "__main__":
    main()
