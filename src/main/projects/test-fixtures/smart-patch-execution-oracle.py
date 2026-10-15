"""Actual serialized Smart Patch execution with declared small native CPU seams.

Only trained architecture/config discovery and CUDA placement
are replaced. The production parser, resource identity readers, family VAE and
masked denoising, exclusive RGB publisher and actual returned PNG stay real.
This is integration evidence, not trained-family or installed-GPU qualification.
"""

from __future__ import annotations

import base64
import contextlib
import hashlib
import importlib
import json
import sys
from pathlib import Path
from types import MappingProxyType
from typing import Any

source_root = Path(sys.argv[1]).resolve(strict=True)
repository = source_root.parents[1]
sys.path.insert(0, str(source_root))
sys.path.insert(0, str(repository / "worker-python/tests"))

from PIL import Image

from imagegen_worker import anima_worker, inference, smart_patch_denoising
from imagegen_worker.derivatives import SRGB_ICC_PROFILE
from imagegen_worker.inference import MLRuntime
from imagegen_worker.inference_anima import (
    ANIMA_BASE_ARCHITECTURE,
    _AnimaArchitecture,
    load_anima_models,
)
from imagegen_worker.inference_config import verify_pinned_config
from imagegen_worker.inference_main import process_inference_request


def identity(path: Path) -> dict[str, object]:
    content = path.read_bytes()
    return {
        "path": str(path),
        "byteSize": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
    }


def architecture() -> _AnimaArchitecture:
    return _AnimaArchitecture(
        transformer=MappingProxyType(
            {
                **ANIMA_BASE_ARCHITECTURE.transformer,
                "num_attention_heads": 2,
                "attention_head_dim": 32,
                "num_layers": 1,
                "text_embed_dim": 32,
                "adaln_lora_dim": 8,
                "max_size": (1, 16, 16),
            }
        ),
        text_conditioner=MappingProxyType(
            {
                **ANIMA_BASE_ARCHITECTURE.text_conditioner,
                "source_dim": 32,
                "target_dim": 32,
                "model_dim": 32,
                "num_layers": 1,
                "num_attention_heads": 2,
            }
        ),
        qwen3_encoder=MappingProxyType(
            {
                **ANIMA_BASE_ARCHITECTURE.qwen3_encoder,
                "hidden_size": 32,
                "intermediate_size": 64,
                "num_hidden_layers": 1,
                "num_attention_heads": 2,
                "num_key_value_heads": 1,
                "head_dim": 16,
            }
        ),
        vae=MappingProxyType({"base_dim": 4, "z_dim": 16}),
        companion_identities=None,
    )


def initialize(root: Path, torch: Any, diffusers: Any) -> dict[str, object]:
    import accelerate
    import safetensors.torch
    import transformers
    from test_anima_loader import _fixture
    from test_sdxl_outpaint import native

    root.mkdir(mode=0o700, exist_ok=True)
    config = root / "offline-config"
    config.mkdir(mode=0o700)
    (config / "model_index.json").write_bytes(b'{"scaledNativeArchitecture":true}')
    illustrious = root / "illustrious.safetensors"
    original = native.__wrapped__()
    with contextlib.closing(original):
        models = next(original)
        safetensors.torch.save_file(models.pipeline.unet.state_dict(), str(illustrious))
    anima = root / "anima"
    anima.mkdir(mode=0o700)
    bundle, _expected = _fixture(
        (torch, diffusers, transformers, accelerate, architecture()), anima
    )
    return {
        "illustrious": {"checkpoint": identity(illustrious)},
        "anima": {
            "checkpoint": identity(bundle.checkpoint.path),
            "qwen3Encoder": identity(bundle.qwen3_encoder.path),
            "vae": identity(bundle.vae.path),
        },
    }


def execute(envelope: dict[str, Any], torch: Any, diffusers: Any) -> dict[str, object]:
    import safetensors.torch
    from test_sdxl_lora import native as clip_native
    from test_sdxl_outpaint import native

    request = envelope["request"]
    calls: list[str] = []
    generators: list[Any] = []
    handles: list[Any] = []

    def record(label: str) -> Any:
        def observed(_model: Any, _args: Any) -> None:
            calls.append(label)

        return observed

    def scaled_pipeline(cls: Any, file: str, **kwargs: Any) -> Any:
        # The trusted test seam replaces architecture/config discovery only.
        # The exact file has already passed the real before-load hash and is
        # loaded into actual native modules; the real loader checks it again.
        assert kwargs["local_files_only"] is True
        assert kwargs["torch_dtype"] == torch.float16
        calls.append("scaled-single-file-constructor")
        generator = native.__wrapped__()
        generators.append(generator)
        original = next(generator)
        clip_generator = clip_native.__wrapped__(Path(envelope["configRoot"]))
        generators.append(clip_generator)
        _torch, clips = next(clip_generator)
        unet = original.pipeline.unet
        unet.load_state_dict(safetensors.torch.load_file(file), strict=True)
        pipeline = cls(
            vae=original.pipeline.vae,
            unet=unet,
            text_encoder=clips.text_encoder,
            text_encoder_2=clips.text_encoder_2,
            tokenizer=clips.tokenizer,
            tokenizer_2=clips.tokenizer_2,
            scheduler=original.pipeline.scheduler,
            force_zeros_for_empty_prompt=False,
            add_watermarker=False,
        )
        original_to = pipeline.to

        def cpu_placement(device: str, *args: Any, **options: Any) -> Any:
            assert device == "cuda"
            calls.append("declared-cuda-to-cpu-placement")
            return original_to("cpu", *args, **options)

        pipeline.to = cpu_placement
        handles.extend(
            (
                pipeline.vae.encoder.register_forward_pre_hook(record("vae-encode")),
                pipeline.vae.decoder.register_forward_pre_hook(record("vae-decode")),
                unet.register_forward_pre_hook(record("denoise")),
            )
        )
        return pipeline

    def scaled_anima(bundle: Any, *, device: str, dtype: Any) -> Any:
        assert device == "cuda" and dtype == torch.bfloat16
        calls.append("declared-scaled-anima-cpu-placement")
        models = load_anima_models(
            bundle, device="cpu", dtype=torch.float32, _architecture=architecture()
        )
        handles.extend(
            (
                models.vae.encoder.register_forward_pre_hook(record("vae-encode")),
                models.vae.decoder.register_forward_pre_hook(record("vae-decode")),
                models.transformer.register_forward_pre_hook(record("denoise")),
                models.qwen3_encoder.register_forward_pre_hook(record("qwen3-encode")),
            )
        )
        return models

    # Both native pipeline classes inherit this descriptor. Dynamically created
    # masked classes still execute their production methods and ordinary guards.
    diffusers.StableDiffusionXLPipeline.from_single_file = classmethod(scaled_pipeline)
    diffusers.StableDiffusionXLImg2ImgPipeline.from_single_file = classmethod(scaled_pipeline)
    config = Path(envelope["configRoot"]) / "offline-config"
    pinned = {
        "model_index.json": hashlib.sha256((config / "model_index.json").read_bytes()).hexdigest()
    }

    def scaled_config(_path: str) -> Path:
        calls.append("declared-scaled-config")
        return verify_pinned_config(str(config), pinned_files=pinned)

    inference.verify_pinned_config = scaled_config
    anima_worker.load_anima_models = scaled_anima
    torch.cuda.is_bf16_supported = lambda **_kwargs: True
    progress: list[dict[str, object]] = []
    response: dict[str, object]
    try:
        with contextlib.redirect_stdout(sys.stderr):
            response = process_inference_request(
                request,
                config_dir=config,
                runtime=MLRuntime(torch, diffusers, importlib.import_module("compel")),
                on_progress=progress.append,
            )
    finally:
        for handle in handles:
            handle.remove()
        for generator in generators:
            generator.close()
    output = response.get("output")
    decoded = None
    if isinstance(output, dict):
        output_path = Path(request["output"]["pngPath"])
        corruption = envelope.get("corrupt")
        if corruption is not None:
            with Image.open(output_path) as image:
                image.load()
                damaged = image.convert("RGBA") if corruption == "rgba" else image.copy()
            profile = b"incorrect profile" if corruption == "icc" else SRGB_ICC_PROFILE
            damaged.save(output_path, "PNG", icc_profile=profile)
            changed = output_path.read_bytes()
            output["byteSize"] = len(changed)
            output["sha256"] = hashlib.sha256(changed).hexdigest()
        with Image.open(output_path) as image:
            image.load()
            profile = image.info.get("icc_profile")
            decoded = {
                "mode": image.mode,
                "width": image.width,
                "height": image.height,
                "iccSha256": hashlib.sha256(profile).hexdigest() if profile else None,
                "rgbBase64": base64.b64encode(image.convert("RGB").tobytes()).decode("ascii"),
            }
    return {
        "response": response,
        "calls": calls,
        "progress": progress,
        "decoded": decoded,
        "paths": {
            "inference": str(Path(inference.__file__).resolve(strict=True)),
            "denoising": str(Path(smart_patch_denoising.__file__).resolve(strict=True)),
        },
    }


def main() -> None:
    envelope = json.loads(sys.stdin.read())
    if envelope.get("action") == "prepare":
        from imagegen_worker.protocol import process_request

        with contextlib.redirect_stdout(sys.stderr):
            response = process_request(envelope["request"])
        print(json.dumps({"response": response}))
        return
    import diffusers
    import torch

    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    with contextlib.redirect_stdout(sys.stderr):
        result = (
            initialize(Path(envelope["root"]), torch, diffusers)
            if envelope.get("action") == "initialize"
            else execute(envelope, torch, diffusers)
        )
    print(json.dumps(result))


if __name__ == "__main__":
    main()
