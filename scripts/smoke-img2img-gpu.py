"""Pinned local GPU img2img evidence through production parser, qualification and publication.

No downloads or release installation. Supply a supported self-contained Illustrious
checkpoint and content-pinned architecture config. Source pixels are synthetic.
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import os
from pathlib import Path
from typing import Any, cast

from PIL import Image, ImageChops, ImageStat

from imagegen_worker.derivatives import PINNED_SRGB_ICC_SHA256, SRGB_ICC_PROFILE
from imagegen_worker.inference import INFERENCE_WORKER_VERSION, qualify_ml_runtime
from imagegen_worker.inference_config import verify_pinned_config
from imagegen_worker.inference_main import inference_ready_message, process_inference_request


def file_digest(file: Path) -> str:
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        while chunk := stream.read(8 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--prediction-type", choices=("epsilon", "v_prediction"), required=True)
    arguments = parser.parse_args()
    checkpoint = cast(Path, arguments.checkpoint).resolve(strict=True)
    config = verify_pinned_config(str(cast(Path, arguments.config).resolve(strict=True)))
    output = cast(Path, arguments.output).resolve()
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    runtime = qualify_ml_runtime()
    torch = cast(Any, runtime.torch)
    checkpoint_sha256 = file_digest(checkpoint)
    pixels: dict[str, Image.Image] = {}
    records: list[dict[str, object]] = []
    cases = (
        ("zero", 0.0, 0.0, False),
        ("partial", 0.75, 0.0, False),
        ("replay", 0.75, 0.0, False),
        ("changed-source", 0.75, 0.0, True),
        ("full", 1.0, 0.0, False),
        ("rescale", 0.75, 0.7, False),
    )
    for name, strength, rescale, changed_source in cases:
        stage = output / name
        stage.mkdir(mode=0o700)
        target = stage / "target.png"
        image = Image.new("RGBA", (128, 128))
        cast(Any, image).putdata(
            [
                (
                    (200 - x) if changed_source else (20 + x),
                    (30 + y) if changed_source else 100,
                    90 if changed_source else (180 - y),
                    255,
                )
                for y in range(128)
                for x in range(128)
            ]
        )
        image.save(target, icc_profile=SRGB_ICC_PROFILE)
        target.chmod(0o600)
        request: dict[str, object] = {
            "type": "generate-illustrious-img2img",
            "protocolVersion": "1",
            "requestId": name,
            "job": {
                "schemaVersion": 1,
                "checkpoint": {
                    "path": str(checkpoint),
                    "sha256": checkpoint_sha256,
                    "predictionType": arguments.prediction_type,
                },
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
                "sampling": {
                    "steps": 4,
                    "cfgScale": 7,
                    "seed": 42,
                    "scheduler": "dpmpp_2m_k",
                    "denoisingStrength": strength,
                    "cfgRescale": rescale,
                },
                "output": {"stagingRoot": str(stage), "pngPath": str(stage / "result.png")},
            },
        }
        (stage / "request.json").write_text(json.dumps(request, indent=2))
        progress: list[dict[str, object]] = []
        done = process_inference_request(
            request, config_dir=config, runtime=runtime, on_progress=progress.append
        )
        if done["type"] != "generation-done":
            raise AssertionError(f"Production request failed: {done}")
        with Image.open(stage / "result.png") as published:
            if (
                published.size != (128, 128)
                or published.info.get("icc_profile") != SRGB_ICC_PROFILE
            ):
                raise AssertionError("Published output changed dimensions or pinned sRGB profile.")
            pixels[name] = published.convert("RGB")
            records.append(
                {
                    "name": name,
                    "denoisingStrength": strength,
                    "cfgRescale": rescale,
                    "pixelSha256": hashlib.sha256(pixels[name].tobytes()).hexdigest(),
                    "pngSha256": file_digest(stage / "result.png"),
                    "progress": progress,
                    "done": done,
                }
            )
        if strength == 0 and progress:
            raise AssertionError("Zero strength emitted denoising progress.")
        if strength > 0 and (not progress or progress[-1]["step"] != progress[-1]["totalSteps"]):
            raise AssertionError("Denoising progress did not reach the effective schedule.")
        print(f"PASS production GPU img2img {name}; callbacks={len(progress)}", flush=True)
        gc.collect()
        torch.cuda.empty_cache()

    replay_equal = pixels["partial"].tobytes() == pixels["replay"].tobytes()
    differences = {
        name: ImageChops.difference(pixels["partial"], pixels[name])
        for name in ("zero", "changed-source", "full", "rescale")
    }
    report = {
        "workerVersion": INFERENCE_WORKER_VERSION,
        "capabilities": inference_ready_message()["capabilities"],
        "checkpointSha256": checkpoint_sha256,
        "predictionType": arguments.prediction_type,
        "replayPixelsEqual": replay_equal,
        "changedPixels": {name: diff.getbbox() is not None for name, diff in differences.items()},
        "meanAbsoluteChannelDifference": {
            name: ImageStat.Stat(diff).mean for name, diff in differences.items()
        },
        "requests": records,
        "boundary": (
            "Pinned local development CUDA, synthetic opaque 128x128 source, four steps; "
            "no release installer claim."
        ),
    }
    (output / "report.json").write_text(json.dumps(report, indent=2))
    if not replay_equal or not all(diff.getbbox() is not None for diff in differences.values()):
        raise AssertionError("GPU replay/source/strength/CFG Rescale pixel controls failed.")
    print("PASS replay equality and source/strength/CFG Rescale GPU pixel controls", flush=True)


if __name__ == "__main__":
    main()
