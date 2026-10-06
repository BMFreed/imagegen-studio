"""Local trained Anima masked denoising, without public outpaint dispatch.

Uses actual Main alpha/policy capture, TS flow/attention compilers, verified local
CPU LaMa and native CUDA BF16 Anima models. Internal RGBA evidence is written
directly; no queue, public worker command, publisher or installed runtime changes.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import io
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, cast

from PIL import Image

from imagegen_worker.anima_flow_sampling import generate_anima_flow_sampling
from imagegen_worker.anima_outpaint import generate_anima_outpaint
from imagegen_worker.anima_worker import supports_anima_compute
from imagegen_worker.derivatives import SRGB_ICC_PROFILE
from imagegen_worker.inference import qualify_ml_runtime
from imagegen_worker.inference_anima import AnimaModelBundle, AnimaModelFile, load_anima_models
from imagegen_worker.lama_infill import load_local_lama
from imagegen_worker.outpaint_conditioning import (
    create_outpaint_contribution,
    prepare_outpaint_conditioning,
)

ROOT = Path(__file__).resolve().parents[1]
WEIGHTED_POSITIVE = "a quiet river valley, (trees:1.5), soft daylight"
WEIGHTED_NEGATIVE = "(blur:1.5), low quality"
PLAIN_POSITIVE = "a quiet river valley, trees, soft daylight"
PLAIN_NEGATIVE = "blur, low quality"


def file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(8 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def main_typescript(program: str, data: dict[str, Any]) -> dict[str, Any]:
    result = subprocess.check_output(
        [str(ROOT / "node_modules/.bin/tsx"), "-e", program],
        cwd=ROOT,
        input=json.dumps(data),
        text=True,
    )
    return cast(dict[str, Any], json.loads(result))


def main_snapshot(source: Image.Image) -> dict[str, Any]:
    encoded = io.BytesIO()
    source.save(encoded, "PNG", icc_profile=SRGB_ICC_PROFILE)
    context = main_typescript(
        "import {freezeAlphaOutpaintConditioning as freeze} "
        "from './src/main/projects/outpaint-conditioning.ts';"
        "import {readFileSync} from 'node:fs';"
        "const x=JSON.parse(readFileSync(0,'utf8'));"
        "process.stdout.write(JSON.stringify(freeze({bbox:x.bbox,"
        "sourceTargetSha256:x.sha256,targetPngBytes:Buffer.from(x.png,'hex')}).context));",
        {
            "bbox": {"x": -32, "y": 16, "width": source.width, "height": source.height},
            "sha256": hashlib.sha256(encoded.getvalue()).hexdigest(),
            "png": encoded.getvalue().hex(),
        },
    )
    if (
        context["keepMask"]["sha256"]
        != hashlib.sha256(source.getchannel("A").tobytes()).hexdigest()
    ):
        raise AssertionError("Main frozen alpha identity differs from the source pixels.")
    return context


def compiled_inputs(
    width: int,
    height: int,
    *,
    scheduler: str,
    seed: int,
    strength: float,
    positive: str,
    negative: str,
) -> dict[str, Any]:
    return main_typescript(
        "import {compileAnimaFlowSamplingPlan as flow} "
        "from './src/shared/projects/anima-flow-sampling-plan.ts';"
        "import {compileAnimaPromptWeighting as prompt} "
        "from './src/shared/projects/anima-prompt-weighting.ts';"
        "import {readFileSync} from 'node:fs';"
        "const x=JSON.parse(readFileSync(0,'utf8'));"
        "process.stdout.write(JSON.stringify({plan:flow(x.sampling),"
        "positive:prompt(x.positive),negative:prompt(x.negative)}));",
        {
            "sampling": {
                "scheduler": scheduler,
                "mode": "img2img",
                "width": width,
                "height": height,
                "steps": 4,
                "seed": seed,
                "guidanceScale": 4,
                "strength": strength,
            },
            "positive": positive,
            "negative": negative,
        },
    )


def model_file(args: argparse.Namespace, role: str) -> AnimaModelFile:
    path = cast(Path, getattr(args, role)).resolve(strict=True)
    sha256 = cast(str, getattr(args, f"{role}_sha256"))
    byte_size = cast(int, getattr(args, f"{role}_byte_size"))
    if path.stat().st_size != byte_size or file_digest(path) != sha256:
        raise AssertionError(f"{role}: supplied qualified file identity differs.")
    return AnimaModelFile(path=path, sha256=sha256, byte_size=byte_size)


def save_image(image: Image.Image, path: Path) -> None:
    image.save(path, "PNG", icc_profile=SRGB_ICC_PROFILE)
    path.chmod(0o600)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    for role in ("checkpoint", "encoder", "vae"):
        parser.add_argument(f"--{role}", type=Path, required=True)
        parser.add_argument(f"--{role}-sha256", required=True)
        parser.add_argument(f"--{role}-byte-size", type=int, required=True)
    parser.add_argument("--lama", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    bundle = AnimaModelBundle(
        checkpoint=model_file(args, "checkpoint"),
        qwen3_encoder=model_file(args, "encoder"),
        vae=model_file(args, "vae"),
    )
    output = cast(Path, args.output).resolve()
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_HOME"] = str(output / "offline-hf")
    runtime = qualify_ml_runtime()
    if not supports_anima_compute(runtime):
        raise AssertionError("Trained Anima smoke requires native CUDA BF16 compute.")
    torch = cast(Any, runtime.torch)
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
    infilled_original = infilled.tobytes()
    masks = prepare_outpaint_conditioning(
        source,
        coherence_edge_radius=policy["edgeRadius"],
        minimum_denoise=policy["minimumDenoise"],
        output_fade_radius=policy["fadeDistance"],
    )
    save_image(source, output / "source.png")
    save_image(infilled, output / "infilled.png")
    models = load_anima_models(bundle, device="cuda", dtype=torch.bfloat16)
    records: list[dict[str, Any]] = []
    outputs: dict[str, bytes] = {}
    latent_hashes: dict[str, str] = {}

    def execute(
        name: str,
        keep: Image.Image | None,
        *,
        strength: float = 0.75,
        scheduler: str = "euler",
        seed: int = 42,
        positive: str = WEIGHTED_POSITIVE,
        negative: str = WEIGHTED_NEGATIVE,
        report_progress: bool = True,
    ) -> bytes:
        captured = compiled_inputs(
            source.width,
            source.height,
            scheduler=scheduler,
            seed=seed,
            strength=strength,
            positive=positive,
            negative=negative,
        )
        plan = captured["plan"]
        progress: list[tuple[int, int]] = []

        def on_progress(step: int, total: int) -> None:
            progress.append((step, total))

        keep_original = None if keep is None else keep.tobytes()
        options: dict[str, Any] = {
            "source_image": infilled,
            "progress": on_progress if report_progress else None,
        }
        if keep is None:
            result = generate_anima_flow_sampling(
                plan, captured["positive"], captured["negative"], models, **options
            )
        else:
            result = generate_anima_outpaint(
                plan, captured["positive"], captured["negative"], models, keep_mask=keep, **options
            )
        image = result.image
        expected_shape = (1, 16, 1, source.height // 8, source.width // 8)
        if (
            image.mode != "RGB"
            or image.size != source.size
            or image.info.get("icc_profile") != SRGB_ICC_PROFILE
            or tuple(result.latents.shape) != expected_shape
            or result.latents.dtype != torch.bfloat16
            or not bool(torch.isfinite(result.latents).all().item())
            or result.total_steps != plan["totalSteps"]
        ):
            raise AssertionError(f"{name}: native output differs from captured topology.")
        expected_progress = [
            (index, result.total_steps) for index in range(1, result.total_steps + 1)
        ]
        if progress != (expected_progress if report_progress else []):
            raise AssertionError(f"{name}: progress differs from actual selected evaluations.")
        contribution = create_outpaint_contribution(image, masks)
        if (
            source.tobytes() != original
            or infilled.tobytes() != infilled_original
            or (keep is not None and keep.tobytes() != keep_original)
            or contribution.getchannel("A").getpixel((0, 64)) != 0
            or contribution.getchannel("A").getpixel((255, 64)) != 255
        ):
            raise AssertionError(f"{name}: immutable inputs or contribution support differ.")
        save_image(contribution, output / f"{name}.png")
        pixels = image.tobytes()
        latent_hashes[name] = hashlib.sha256(
            result.latents.float().cpu().numpy().tobytes()
        ).hexdigest()
        records.append(
            {
                "case": name,
                "sampling": plan,
                "positive": captured["positive"],
                "negative": captured["negative"],
                "keepPixelsSha256": None
                if keep_original is None
                else hashlib.sha256(keep_original).hexdigest(),
                "progressEnabled": report_progress,
                "progress": progress,
                "rgbPixelsSha256": hashlib.sha256(pixels).hexdigest(),
                "latentFloat32Sha256": latent_hashes[name],
                "contributionPixelsSha256": hashlib.sha256(contribution.tobytes()).hexdigest(),
            }
        )
        print(
            f"PASS trained internal Anima outpaint {name}; evaluations={result.total_steps}",
            flush=True,
        )
        return pixels

    outputs["mixed"] = execute("mixed", masks.latent_keep_mask)
    outputs["replay"] = execute(
        "replay-without-progress", masks.latent_keep_mask, report_progress=False
    )
    outputs["changed-seed"] = execute("changed-seed", masks.latent_keep_mask, seed=43)
    outputs["ordinary"] = execute("ordinary", None)
    outputs["all-black"] = execute("all-black", Image.new("L", masks.latent_keep_mask.size, 0))
    outputs["zero"] = execute("zero", masks.latent_keep_mask, strength=0)
    outputs["all-white"] = execute("all-white", Image.new("L", masks.latent_keep_mask.size, 255))
    outputs["unweighted-positive"] = execute(
        "unweighted-positive", masks.latent_keep_mask, positive=PLAIN_POSITIVE
    )
    outputs["unweighted-negative"] = execute(
        "unweighted-negative", masks.latent_keep_mask, negative=PLAIN_NEGATIVE
    )
    if (
        outputs["mixed"] != outputs["replay"]
        or outputs["ordinary"] != outputs["all-black"]
        or outputs["zero"] != outputs["all-white"]
        or latent_hashes["mixed"] != latent_hashes["replay-without-progress"]
        or latent_hashes["ordinary"] != latent_hashes["all-black"]
        or latent_hashes["zero"] != latent_hashes["all-white"]
    ):
        raise AssertionError(
            "Replay, ordinary-neighbor or fully-protected native latents/VAE pixels differ."
        )
    for control in ("changed-seed", "ordinary", "unweighted-positive", "unweighted-negative"):
        if outputs["mixed"] == outputs[control]:
            raise AssertionError(
                f"{control}: trained decoded-pixel ablation did not change the result."
            )
    for scheduler in ("heun", "dpmpp_2m", "dpmpp_2m_sde", "er_sde", "lcm"):
        execute(scheduler, masks.latent_keep_mask, scheduler=scheduler)
    execute("clipped-quarter", masks.latent_keep_mask, strength=0.25)
    execute("full-strength", masks.latent_keep_mask, strength=1)
    for file in (bundle.checkpoint, bundle.qwen3_encoder, bundle.vae):
        if file.path.stat().st_size != file.byte_size or file_digest(file.path) != file.sha256:
            raise AssertionError("Anima resource changed during native execution.")
    report = {
        "boundary": (
            "internal Main mask/policy -> trained CPU LaMa -> native trained CUDA BF16 "
            "Anima masked loop -> direct RGBA contribution"
        ),
        "publicOutpaintDispatched": False,
        "publicPublisherUsed": False,
        "installedWorkerQualified": False,
        "resources": {
            name: {"path": str(file.path), "sha256": file.sha256, "byteSize": file.byte_size}
            for name, file in (
                ("checkpoint", bundle.checkpoint),
                ("encoder", bundle.qwen3_encoder),
                ("vae", bundle.vae),
            )
        },
        "runtime": {
            "python": sys.version,
            "packages": {
                name: importlib.metadata.version(name)
                for name in (
                    "torch",
                    "diffusers",
                    "transformers",
                    "torchvision",
                    "tokenizers",
                    "accelerate",
                    "safetensors",
                    "numpy",
                    "opencv-python-headless",
                    "Pillow",
                )
            },
            "cuda": torch.version.cuda,
            "gpu": torch.cuda.get_device_name(),
            "dtype": "bfloat16",
        },
        "sourceIdentities": {
            "inputPixelsSha256": hashlib.sha256(original).hexdigest(),
            "infilledPixelsSha256": hashlib.sha256(infilled_original).hexdigest(),
            "latentKeepPixelsSha256": hashlib.sha256(masks.latent_keep_mask.tobytes()).hexdigest(),
            "implementationFiles": {
                path: file_digest(ROOT / path)
                for path in (
                    "scripts/smoke-anima-outpaint-gpu.py",
                    "worker-python/src/imagegen_worker/anima_outpaint.py",
                    "worker-python/src/imagegen_worker/anima_euler.py",
                    "worker-python/src/imagegen_worker/anima_sampling.py",
                    "worker-python/src/imagegen_worker/anima_flow_sampling.py",
                    "worker-python/src/imagegen_worker/inference_anima.py",
                    "worker-python/src/imagegen_worker/anima_conditioning.py",
                    "worker-python/src/imagegen_worker/anima_tokenizers.py",
                    "worker-python/src/imagegen_worker/outpaint_conditioning.py",
                    "worker-python/src/imagegen_worker/lama_infill.py",
                    "src/main/projects/outpaint-conditioning.ts",
                    "src/shared/projects/anima-flow-sampling-plan.ts",
                    "src/shared/projects/anima-sampling-plan.ts",
                    "src/shared/projects/anima-euler-plan.ts",
                    "src/shared/projects/anima-prompt-weighting.ts",
                )
            },
            "tokenizerFiles": {
                str(
                    path.relative_to(ROOT / "worker-python/src/imagegen_worker/assets/anima")
                ): file_digest(path)
                for path in sorted(
                    (ROOT / "worker-python/src/imagegen_worker/assets/anima").rglob("*")
                )
                if path.is_file()
            },
        },
        "limits": [
            "Development source runtime; no installed-worker qualification.",
            "One original Anima checkpoint and pinned Qwen3/Wan companions.",
            "256x128, four requested steps, guidance 4, native CUDA BF16.",
            "No LoRA, embeddings, queue, acceptance or persistence.",
            "Flow LCM execution is checked; distilled-LCM image quality is not promised.",
        ],
        "frozenConditioning": frozen,
        "comparisons": {
            "replayWithoutProgressEqual": True,
            "allBlackEqualsOrdinary": True,
            "allWhiteEqualsZeroVae": True,
            "replayWithoutProgressLatentsEqual": True,
            "allBlackEqualsOrdinaryLatents": True,
            "allWhiteEqualsZeroLatents": True,
            "mixedChangesOrdinary": True,
            "changedSeedChangesPixels": True,
            "positiveWeightChangesPixels": True,
            "negativeWeightChangesPixels": True,
        },
        "cases": records,
        "maxCudaAllocatedBytes": torch.cuda.max_memory_allocated(),
    }
    report_path = output / "report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    report_path.chmod(0o600)


if __name__ == "__main__":
    main()
