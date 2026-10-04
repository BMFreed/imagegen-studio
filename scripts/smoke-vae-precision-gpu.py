"""Actual pinned Illustrious VAE precision through JSON parsing and CUDA inference.

Use a self-contained checkpoint and verified offline architecture config. This
development probe observes actual native VAE/UNet/CLIP calls; it does not replace
models, certify image quality or prove release runtime installation.
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import os
from pathlib import Path
from typing import Any, cast

from PIL import Image

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
    pixels: dict[str, bytes] = {}
    records: list[dict[str, object]] = []
    cases = (
        ("legacy", None, False),
        ("auto", "Auto", False),
        ("fp32", "FP32", False),
        ("fp16", "FP16", False),
        ("fp32-replay", "FP32", False),
        ("img-auto", "Auto", True),
        ("img-fp32", "FP32", True),
        ("img-fp16", "FP16", True),
        ("img-fp32-replay", "FP32", True),
    )
    for name, precision, opaque in cases:
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
        job: dict[str, object] = {
            "schemaVersion": 1,
            "checkpoint": {
                "path": str(checkpoint),
                "sha256": checkpoint_sha256,
                "predictionType": arguments.prediction_type,
            },
            "loras": [],
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
        }
        if precision is not None:
            job["vaePrecision"] = precision
        request = {
            "type": "generate-illustrious-img2img" if opaque else "generate-illustrious-txt2img",
            "protocolVersion": "1",
            "requestId": name,
            "job": job,
        }
        (stage / "request.json").write_text(json.dumps(request, indent=2))
        observed: list[dict[str, object]] = []

        def observe(
            module: Any, args: Any, observations: list[dict[str, object]] = observed
        ) -> None:
            module_name = type(module).__module__
            class_name = type(module).__name__
            if (
                module_name.startswith("diffusers.models.autoencoders.vae")
                and class_name in ("Encoder", "Decoder")
            ) or class_name in (
                "UNet2DConditionModel",
                "CLIPTextModel",
                "CLIPTextModelWithProjection",
            ):
                observations.append(
                    {
                        "module": class_name,
                        "parameterDtypes": sorted({str(p.dtype) for p in module.parameters()}),
                        "inputDtype": str(args[0].dtype)
                        if args and torch.is_tensor(args[0])
                        else None,
                    }
                )

        # Public observation hook only: no replacement model or modified inputs/outputs.
        handle = torch.nn.modules.module.register_module_forward_pre_hook(observe)
        progress: list[dict[str, object]] = []
        try:
            done = process_inference_request(
                request, config_dir=config, runtime=runtime, on_progress=progress.append
            )
        finally:
            handle.remove()
        refused_finite = (
            precision == "FP16"
            and done["type"] == "error"
            and isinstance(done.get("error"), dict)
            and cast(dict[str, object], done["error"]).get("code") == "GENERATION_WORKER_FAILED"
            and "non-finite" in str(cast(dict[str, object], done["error"]).get("message"))
            and not (stage / "result.png").exists()
        )
        if done["type"] != "generation-done" and not refused_finite:
            raise AssertionError(f"Production precision request failed unexpectedly: {done}")
        expected = "torch.float16" if precision == "FP16" else "torch.float32"
        vae_calls = [r for r in observed if r["module"] in ("Encoder", "Decoder")]
        if not vae_calls or not any(
            r["module"] == ("Encoder" if opaque else "Decoder") for r in vae_calls
        ):
            raise AssertionError("Actual VAE phase was not observed.")
        if any(
            r["parameterDtypes"] != [expected] or r["inputDtype"] != expected for r in vae_calls
        ):
            raise AssertionError(f"Actual VAE did not use {expected}: {vae_calls}")
        other_calls = [r for r in observed if r["module"] not in ("Encoder", "Decoder")]
        if not other_calls or any(r["parameterDtypes"] != ["torch.float16"] for r in other_calls):
            raise AssertionError(f"VAE precision changed another model dtype: {other_calls}")
        pixel_hash = None
        if done["type"] == "generation-done":
            with Image.open(stage / "result.png") as published:
                if (
                    published.size != (128, 128)
                    or published.info.get("icc_profile") != SRGB_ICC_PROFILE
                ):
                    raise AssertionError("Published size/profile changed.")
                pixels[name] = published.convert("RGB").tobytes()
                pixel_hash = hashlib.sha256(pixels[name]).hexdigest()
            if not progress or progress[-1]["step"] != progress[-1]["totalSteps"]:
                raise AssertionError("Denoising progress did not reach the actual schedule.")
        records.append(
            {
                "name": name,
                "precision": precision,
                "opaque": opaque,
                "finiteRefusal": refused_finite,
                "pixelSha256": pixel_hash,
                "done": done,
                "observed": observed,
                "progress": progress,
            }
        )
        print(
            f"PASS production GPU precision {name}; callbacks={len(progress)}; "
            f"finiteRefusal={refused_finite}",
            flush=True,
        )
        gc.collect()
        torch.cuda.empty_cache()
    checks = {
        "legacyEqualsAuto": pixels["legacy"] == pixels["auto"],
        "autoEqualsFP32": pixels["auto"] == pixels["fp32"],
        "txtReplayEqual": pixels["fp32"] == pixels["fp32-replay"],
        "imgAutoEqualsFP32": pixels["img-auto"] == pixels["img-fp32"],
        "imgReplayEqual": pixels["img-fp32"] == pixels["img-fp32-replay"],
        "fp16ChangesPixelsOrRefusesNonfinite": "fp16" not in pixels
        or pixels["fp16"] != pixels["fp32"],
        "imgFP16ChangesPixelsOrRefusesNonfinite": "img-fp16" not in pixels
        or pixels["img-fp16"] != pixels["img-fp32"],
    }
    report = {
        "workerVersion": INFERENCE_WORKER_VERSION,
        "ready": inference_ready_message(),
        "checkpointSha256": checkpoint_sha256,
        "scriptSha256": file_digest(Path(__file__)),
        "cases": records,
        "checks": checks,
        "scope": (
            "Pinned local CUDA, one actual checkpoint, 128x128, four steps, supplied prediction; "
            "not general quality or VRAM capacity qualification."
        ),
    }
    (output / "report.json").write_text(json.dumps(report, indent=2))
    if not all(checks.values()):
        raise AssertionError(f"Actual GPU precision controls failed: {checks}")
    print(
        "PASS actual VAE dtypes, neutral policy, manual precision and replay controls", flush=True
    )


if __name__ == "__main__":
    main()
