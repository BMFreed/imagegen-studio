"""Explicit local GPU evidence; this does not install or qualify a release runtime.

Run with an environment containing the exact pinned inference extra and our worker package.
All three requests use production parsing, qualification, model loading and PNG publication.
The checkpoint and content-pinned config are supplied explicitly; no files are downloaded.
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import os
from pathlib import Path
from typing import cast

from PIL import Image, ImageChops, ImageStat

from imagegen_worker.derivatives import PINNED_SRGB_ICC_SHA256, SRGB_ICC_PROFILE
from imagegen_worker.inference import (
    INFERENCE_WORKER_VERSION,
    generate_illustrious_txt2img,
    qualify_ml_runtime,
)
from imagegen_worker.inference_config import verify_pinned_config
from imagegen_worker.inference_main import inference_ready_message
from imagegen_worker.protocol import GenerateIllustriousTxt2ImgCommand, parse_request


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
    checkpoint_sha256 = file_digest(checkpoint)
    records: list[dict[str, object]] = []
    pixels: list[Image.Image] = []
    for name, rescale in (("legacy-default", None), ("explicit-zero", 0), ("nonneutral", 0.7)):
        stage = output / name
        stage.mkdir(mode=0o700)
        target = stage / "target.png"
        Image.new("RGBA", (128, 128)).save(target, icc_profile=SRGB_ICC_PROFILE)
        target.chmod(0o600)
        sampling: dict[str, object] = {
            "steps": 2,
            "cfgScale": 7,
            "seed": 42,
            "scheduler": "dpmpp_2m_k",
        }
        if rescale is not None:
            sampling["cfgRescale"] = rescale
        request: dict[str, object] = {
            "type": "generate-illustrious-txt2img",
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
                "sampling": sampling,
                "output": {"stagingRoot": str(stage), "pngPath": str(stage / "result.png")},
            },
        }
        (stage / "request.json").write_text(json.dumps(request, indent=2))
        command = parse_request(request)
        if not isinstance(command, GenerateIllustriousTxt2ImgCommand):
            raise AssertionError("Production parser did not produce a generation command.")
        done = generate_illustrious_txt2img(command, config_dir=config, runtime=runtime)
        with Image.open(stage / "result.png") as image:
            if (
                hashlib.sha256(image.info.get("icc_profile", b"")).hexdigest()
                != PINNED_SRGB_ICC_SHA256
            ):
                raise AssertionError("Published output lost the pinned sRGB profile.")
            decoded = image.convert("RGB")
            pixels.append(decoded)
            records.append(
                {
                    "name": name,
                    "cfgRescale": command.cfg_rescale,
                    "pixelSha256": hashlib.sha256(decoded.tobytes()).hexdigest(),
                    "pngSha256": file_digest(stage / "result.png"),
                    "done": done,
                }
            )
        print(f"PASS production GPU request {name}", flush=True)
        gc.collect()
    neutral_equal = pixels[0].tobytes() == pixels[1].tobytes()
    changed = ImageChops.difference(pixels[1], pixels[2])
    nonneutral_changes = changed.getbbox() is not None
    report = {
        "workerVersion": INFERENCE_WORKER_VERSION,
        "capabilities": inference_ready_message()["capabilities"],
        "checkpointSha256": checkpoint_sha256,
        "predictionType": arguments.prediction_type,
        "neutralPixelsEqual": neutral_equal,
        "nonneutralPixelsChanged": nonneutral_changes,
        "meanAbsoluteChannelDifference": ImageStat.Stat(changed).mean,
        "requests": records,
        "boundary": (
            "Local pinned development ML environment; 128x128, 2 steps; "
            "no release installer or general checkpoint qualification claim."
        ),
    }
    (output / "report.json").write_text(json.dumps(report, indent=2))
    if not neutral_equal or not nonneutral_changes:
        raise AssertionError("CFG Rescale failed the neutral/nonneutral GPU pixel controls.")
    print("PASS neutral equality and actual nonneutral GPU pixel change", flush=True)


if __name__ == "__main__":
    main()
