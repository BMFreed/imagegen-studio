"""Local trained Illustrious masked denoising, without public outpaint dispatch.

Loads only supplied, hash-bound weights and the pinned local architecture config.
The existing opaque command is a settings/resource-validation carrier; it is
never queued, dispatched or published. Saves internal RGBA contribution evidence
directly because the current public publisher intentionally remains RGB-only.
"""

from __future__ import annotations

import argparse
import dataclasses
import hashlib
import importlib.metadata
import io
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Literal, cast

from PIL import Image

from imagegen_worker.derivatives import PINNED_SRGB_ICC_SHA256, SRGB_ICC_PROFILE
from imagegen_worker.inference import (
    build_sdxl_conditioning,
    img2img_pipeline_class,
    qualify_ml_runtime,
    run_sdxl_pipeline,
    select_inference_scheduler,
    validate_generation_assets,
)
from imagegen_worker.inference_config import verify_pinned_config
from imagegen_worker.inference_vae import configure_vae_precision, finite_vae_outputs
from imagegen_worker.lama_infill import load_local_lama
from imagegen_worker.outpaint_conditioning import (
    create_outpaint_contribution,
    prepare_outpaint_conditioning,
)
from imagegen_worker.protocol import GenerateIllustriousImg2ImgCommand
from imagegen_worker.sdxl_outpaint import outpaint_pipeline_class, run_sdxl_outpaint_pipeline


def file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(8 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def main_snapshot(source: Image.Image) -> dict[str, Any]:
    encoded = io.BytesIO()
    source.save(encoded, "PNG", icc_profile=SRGB_ICC_PROFILE)
    root = Path(__file__).resolve().parents[1]
    program = (
        "import {freezeAlphaOutpaintConditioning as freeze} "
        "from './src/main/projects/outpaint-conditioning.ts';"
        "import {readFileSync} from 'node:fs';"
        "const x=JSON.parse(readFileSync(0,'utf8'));"
        "process.stdout.write(JSON.stringify(freeze({bbox:x.bbox,"
        "sourceTargetSha256:x.sha256,targetPngBytes:Buffer.from(x.png,'hex')}).context));"
    )
    context = json.loads(
        subprocess.check_output(
            [str(root / "node_modules/.bin/tsx"), "-e", program],
            cwd=root,
            input=json.dumps(
                {
                    "bbox": {"x": -32, "y": 16, "width": source.width, "height": source.height},
                    "sha256": hashlib.sha256(encoded.getvalue()).hexdigest(),
                    "png": encoded.getvalue().hex(),
                }
            ),
            text=True,
        )
    )
    if (
        context["keepMask"]["sha256"]
        != hashlib.sha256(source.getchannel("A").tobytes()).hexdigest()
    ):
        raise AssertionError("Main frozen alpha identity differs from the source pixels.")
    return cast(dict[str, Any], context)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--checkpoint-sha256", required=True)
    parser.add_argument("--prediction-type", choices=("epsilon", "v_prediction"), required=True)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--lama", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    checkpoint = cast(Path, args.checkpoint).resolve(strict=True)
    checkpoint_sha256 = cast(str, args.checkpoint_sha256)
    if file_digest(checkpoint) != checkpoint_sha256:
        raise AssertionError("Checkpoint differs from the supplied qualified identity.")
    config = verify_pinned_config(str(cast(Path, args.config).resolve(strict=True)))
    output = cast(Path, args.output).resolve()
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_HOME"] = str(output / "offline-hf")
    runtime = qualify_ml_runtime()
    torch, diffusers = cast(Any, runtime.torch), cast(Any, runtime.diffusers)
    source = Image.new("RGBA", (256, 128), (80, 120, 170, 255))
    for row in range(source.height):
        for column in range(source.width):
            alpha = 255 if column < 112 else 128 if column < 128 else 0
            source.putpixel((column, row), (40 + column // 2, 40 + row, 170, alpha))
    source.info["icc_profile"] = SRGB_ICC_PROFILE
    original = source.tobytes()
    frozen = main_snapshot(source)
    resource, policy = frozen["infillResource"], frozen["policy"]
    lama = load_local_lama(
        cast(Path, args.lama).resolve(strict=True),
        expected_sha256=resource["sha256"],
        expected_byte_size=resource["byteSize"],
    )
    infilled = lama.infill(source)
    masks = prepare_outpaint_conditioning(
        source,
        coherence_edge_radius=policy["edgeRadius"],
        minimum_denoise=policy["minimumDenoise"],
        output_fade_radius=policy["fadeDistance"],
    )
    source.save(output / "source.png", icc_profile=SRGB_ICC_PROFILE)
    infilled.save(output / "infilled.png", icc_profile=SRGB_ICC_PROFILE)
    target = output / "opaque-conditioning.png"
    infilled.convert("RGBA").save(target, icc_profile=SRGB_ICC_PROFILE)
    target.chmod(0o600)
    command = GenerateIllustriousImg2ImgCommand(
        request_id="internal-outpaint",
        checkpoint_path=checkpoint,
        checkpoint_sha256=checkpoint_sha256,
        prediction_type=cast(Literal["epsilon", "v_prediction"], args.prediction_type),
        target_path=target,
        target_sha256=file_digest(target),
        target_byte_size=target.stat().st_size,
        target_icc_sha256=PINNED_SRGB_ICC_SHA256,
        width=source.width,
        height=source.height,
        bbox={"x": -32, "y": 16, "width": source.width, "height": source.height},
        positive_prompt="a quiet river valley, trees, soft daylight",
        negative_prompt="blur, low quality",
        steps=4,
        cfg_scale=5,
        seed=42,
        scheduler="dpmpp_2m_k",
        staging_root=output,
        output_path=output / "unused-public-output.png",
        denoising_strength=0.75,
        cfg_rescale=0.3,
    )
    validate_generation_assets(command)
    pipeline = outpaint_pipeline_class(diffusers, torch).from_single_file(
        str(checkpoint),
        config=str(config),
        local_files_only=True,
        torch_dtype=torch.float16,
        add_watermarker=False,
    )
    if file_digest(checkpoint) != checkpoint_sha256:
        raise AssertionError("Checkpoint changed during native loading.")
    verify_pinned_config(str(config))
    configure_vae_precision(pipeline, "Auto", torch)
    pipeline = pipeline.to("cuda")
    pipeline.set_progress_bar_config(disable=True)
    with torch.inference_mode():
        conditioning = build_sdxl_conditioning(command, pipeline, runtime)
    native = img2img_pipeline_class(diffusers, torch)(**pipeline.components)
    native.set_progress_bar_config(disable=True)
    records: list[dict[str, Any]] = []
    outputs: dict[str, bytes] = {}

    def execute(
        name: str,
        keep: Image.Image | None,
        strength: float = 0.75,
        scheduler: str = "dpmpp_2m_k",
        seed: int = 42,
    ) -> bytes:
        carrier = dataclasses.replace(command, scheduler=cast(Any, scheduler), seed=seed)
        selected = pipeline if keep is not None else native
        selected.scheduler = select_inference_scheduler(carrier, selected, runtime)
        progress: list[tuple[int, int]] = []

        def report_progress(step: int, total: int) -> None:
            progress.append((step, total))

        options: dict[str, Any] = {
            "width": source.width,
            "height": source.height,
            "steps": command.steps,
            "cfg_scale": command.cfg_scale,
            "cfg_rescale": command.cfg_rescale,
            "generator": torch.Generator(device="cpu").manual_seed(seed),
            "torch": torch,
            "image": infilled,
            "denoising_strength": strength,
            "on_progress": report_progress,
        }
        with finite_vae_outputs(selected, torch):
            if keep is None:
                result = run_sdxl_pipeline(selected, conditioning, **options)
            else:
                result = run_sdxl_outpaint_pipeline(
                    selected, conditioning, keep_mask=keep, **options
                )
        image = result.images[0]
        if image.mode != "RGB" or image.size != source.size:
            raise AssertionError(f"{name}: native output differs from expected RGB topology.")
        contribution = create_outpaint_contribution(image, masks)
        if (
            source.tobytes() != original
            or contribution.getchannel("A").getpixel((0, 64)) != 0
            or contribution.getchannel("A").getpixel((255, 64)) != 255
        ):
            raise AssertionError(f"{name}: source preservation or contribution support differs.")
        if strength and (not progress or progress[-1][0] != progress[-1][1]):
            raise AssertionError(f"{name}: progress did not finish actual selected evaluations.")
        if not strength and progress:
            raise AssertionError(f"{name}: zero strength performed denoising.")
        contribution.save(output / f"{name}.png", icc_profile=SRGB_ICC_PROFILE)
        pixels = image.tobytes()
        records.append(
            {
                "case": name,
                "scheduler": scheduler,
                "seed": seed,
                "strength": strength,
                "progress": progress,
                "rgbPixelsSha256": hashlib.sha256(pixels).hexdigest(),
                "contributionPixelsSha256": hashlib.sha256(contribution.tobytes()).hexdigest(),
            }
        )
        print(f"PASS trained internal outpaint {name}; evaluations={len(progress)}", flush=True)
        return pixels

    outputs["mixed"] = execute("mixed", masks.latent_keep_mask)
    outputs["replay"] = execute("replay", masks.latent_keep_mask)
    outputs["changed-seed"] = execute("changed-seed", masks.latent_keep_mask, seed=43)
    outputs["ordinary"] = execute("ordinary", None)
    outputs["all-black"] = execute("all-black", Image.new("L", masks.latent_keep_mask.size, 0))
    outputs["zero"] = execute("zero", masks.latent_keep_mask, strength=0)
    outputs["all-white"] = execute("all-white", Image.new("L", masks.latent_keep_mask.size, 255))
    if (
        outputs["mixed"] != outputs["replay"]
        or outputs["ordinary"] != outputs["all-black"]
        or outputs["zero"] != outputs["all-white"]
    ):
        raise AssertionError(
            "Replay, ordinary-neighbor or fully-protected native VAE pixels differ."
        )
    if outputs["mixed"] == outputs["changed-seed"] or outputs["mixed"] == outputs["ordinary"]:
        raise AssertionError("Seed or mixed-mask ablation did not change decoded pixels.")
    for scheduler in ("dpmpp_2m", "euler_a", "dpmpp_sde", "dpmpp_sde_k"):
        execute(scheduler, masks.latent_keep_mask, scheduler=scheduler)
    report = {
        "boundary": (
            "internal Main mask/policy -> trained CPU LaMa -> native trained CUDA "
            "Illustrious masked loop -> direct RGBA contribution"
        ),
        "publicOutpaintDispatched": False,
        "publicPublisherUsed": False,
        "checkpointSha256": checkpoint_sha256,
        "checkpointByteSize": checkpoint.stat().st_size,
        "predictionType": args.prediction_type,
        "runtime": {
            "python": sys.version,
            "packages": {
                name: importlib.metadata.version(name)
                for name in ("torch", "diffusers", "transformers", "compel", "Pillow")
            },
            "cuda": torch.version.cuda,
            "gpu": torch.cuda.get_device_name(),
        },
        "sourceIdentities": {
            "inputPixelsSha256": hashlib.sha256(original).hexdigest(),
            "configFiles": {
                str(path.relative_to(config)): file_digest(path)
                for path in sorted(config.rglob("*"))
                if path.is_file()
            },
            "implementationFiles": {
                path: file_digest(Path(__file__).resolve().parents[1] / path)
                for path in (
                    "scripts/smoke-illustrious-outpaint-gpu.py",
                    "worker-python/src/imagegen_worker/sdxl_outpaint.py",
                    "worker-python/src/imagegen_worker/inference.py",
                    "worker-python/src/imagegen_worker/outpaint_conditioning.py",
                    "src/main/projects/outpaint-conditioning.ts",
                )
            },
        },
        "limits": [
            "Development source runtime; no installed-worker qualification.",
            "One epsilon checkpoint; v_prediction covered by CPU numerical tests.",
            "256x128, four requested steps, plain prompts, Auto built-in VAE.",
            "No LoRA, embeddings, external VAE, queue, acceptance or persistence.",
        ],
        "frozenConditioning": frozen,
        "comparisons": {
            "replayEqual": True,
            "allBlackEqualsOrdinary": True,
            "allWhiteEqualsZeroVae": True,
            "mixedChangesOrdinary": True,
            "changedSeedChangesPixels": True,
        },
        "cases": records,
        "maxCudaAllocatedBytes": torch.cuda.max_memory_allocated(),
    }
    (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
