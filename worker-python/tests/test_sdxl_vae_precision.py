"""VAE precision through actual pinned SDXL modules and the worker entry point."""

from __future__ import annotations

import hashlib
import importlib
import importlib.metadata
from collections.abc import Callable, Generator
from pathlib import Path
from typing import Any, Literal, cast

import pytest
from PIL import Image

from imagegen_worker import inference, inference_config
from imagegen_worker.derivatives import SRGB_ICC_PROFILE
from imagegen_worker.inference import MLRuntime, SdxlConditioning, run_sdxl_pipeline
from imagegen_worker.inference_main import process_inference_request
from imagegen_worker.inference_vae import configure_vae_precision, finite_vae_outputs
from imagegen_worker.protocol import GenerateIllustriousTxt2ImgCommand, parse_request

Precision = Literal["Auto", "FP16", "FP32"]


@pytest.fixture
def native() -> Generator[tuple[Any, Any, Callable[[bool, bool], Any]]]:
    torch = pytest.importorskip("torch")
    diffusers = pytest.importorskip("diffusers")
    transformers = pytest.importorskip("transformers")
    assert importlib.metadata.version("diffusers") == "0.40.0"
    previous_threads = torch.get_num_threads()
    torch.set_num_threads(1)

    def make_pipeline(opaque: bool, force_upcast: bool) -> Any:
        with torch.random.fork_rng(devices=[]):
            torch.manual_seed(7)
            unet = diffusers.UNet2DConditionModel(
                sample_size=8,
                in_channels=4,
                out_channels=4,
                layers_per_block=1,
                block_out_channels=(8, 16),
                down_block_types=("DownBlock2D", "CrossAttnDownBlock2D"),
                up_block_types=("UpBlock2D", "CrossAttnUpBlock2D"),
                cross_attention_dim=32,
                attention_head_dim=(2, 4),
                addition_embed_type="text_time",
                addition_time_embed_dim=4,
                projection_class_embeddings_input_dim=40,
                norm_num_groups=4,
            )
            vae = diffusers.AutoencoderKL(
                in_channels=3,
                out_channels=3,
                down_block_types=("DownEncoderBlock2D", "DownEncoderBlock2D"),
                up_block_types=("UpDecoderBlock2D", "UpDecoderBlock2D"),
                block_out_channels=(8, 16),
                layers_per_block=1,
                latent_channels=4,
                norm_num_groups=4,
                sample_size=16,
                force_upcast=force_upcast,
            )
            clip_config = transformers.CLIPTextConfig(
                vocab_size=514,
                hidden_size=16,
                intermediate_size=32,
                num_hidden_layers=2,
                num_attention_heads=4,
                max_position_embeddings=77,
                projection_dim=16,
                bos_token_id=0,
                eos_token_id=1,
                pad_token_id=1,
            )
            clip1 = transformers.CLIPTextModel(clip_config).eval()
            clip2 = transformers.CLIPTextModelWithProjection(clip_config).eval()
            byte_level = importlib.import_module("tokenizers.pre_tokenizers").ByteLevel
            characters = sorted(byte_level.alphabet())
            tokenizer = transformers.CLIPTokenizer(
                vocab={
                    word: index
                    for index, word in enumerate(
                        ["<|startoftext|>", "<|endoftext|>"]
                        + characters
                        + [character + "</w>" for character in characters]
                    )
                },
                merges=[],
                model_max_length=77,
            )
            pipeline_class = (
                inference.img2img_pipeline_class(diffusers, torch)
                if opaque
                else diffusers.StableDiffusionXLPipeline
            )
            pipeline = pipeline_class(
                vae=vae,
                text_encoder=clip1,
                text_encoder_2=clip2,
                tokenizer=tokenizer,
                tokenizer_2=tokenizer,
                unet=unet,
                scheduler=diffusers.DPMSolverMultistepScheduler(
                    beta_start=0.00085,
                    beta_end=0.012,
                    beta_schedule="scaled_linear",
                    use_karras_sigmas=True,
                ),
                force_zeros_for_empty_prompt=False,
                add_watermarker=False,
            ).to(dtype=torch.float16)
            pipeline.set_progress_bar_config(disable=True)
            return pipeline

    try:
        yield torch, diffusers, make_pipeline
    finally:
        torch.set_num_threads(previous_threads)


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _request(root: Path, opaque: bool) -> dict[str, Any]:
    root.mkdir(mode=0o700)
    checkpoint = root / "checkpoint.safetensors"
    checkpoint.write_bytes(b"exact managed checkpoint identity; native tiny loader is injected")
    target = root / "target.png"
    Image.new("RGBA", (16, 16), (20, 100, 180, 255 if opaque else 0)).save(
        target, icc_profile=SRGB_ICC_PROFILE
    )
    sampling: dict[str, object] = {
        "steps": 4,
        "cfgScale": 5,
        "seed": 42,
        "scheduler": "dpmpp_2m_k",
        "cfgRescale": 0,
    }
    if opaque:
        sampling["denoisingStrength"] = 0.75
    return {
        "type": "generate-illustrious-img2img" if opaque else "generate-illustrious-txt2img",
        "protocolVersion": "1",
        "requestId": "precision-native",
        "job": {
            "schemaVersion": 1,
            "checkpoint": {
                "path": str(checkpoint),
                "sha256": _digest(checkpoint.read_bytes()),
                "predictionType": "epsilon",
            },
            "target": {
                "path": str(target),
                "sha256": _digest(target.read_bytes()),
                "byteSize": target.stat().st_size,
                "width": 16,
                "height": 16,
                "iccSha256": _digest(SRGB_ICC_PROFILE),
            },
            "bbox": {"x": -8, "y": 16, "width": 16, "height": 16},
            "prompts": {"positive": "portrait", "negative": "blur"},
            "sampling": sampling,
            "output": {"stagingRoot": str(root), "pngPath": str(root / "output.png")},
        },
    }


def _conditioning(torch: Any) -> SdxlConditioning:
    with torch.random.fork_rng(devices=[]):
        torch.manual_seed(7)
        return SdxlConditioning(
            positive=torch.randn(1, 4, 32, dtype=torch.float16),
            negative=torch.randn(1, 4, 32, dtype=torch.float16),
            positive_pooled=torch.randn(1, 16, dtype=torch.float16),
            negative_pooled=torch.randn(1, 16, dtype=torch.float16),
            positive_length=4,
            negative_length=4,
        )


def _run(pipeline: Any, torch: Any, opaque: bool) -> bytes:
    with finite_vae_outputs(pipeline, torch):
        result = run_sdxl_pipeline(
            pipeline,
            _conditioning(torch),
            width=16,
            height=16,
            steps=4,
            cfg_scale=5,
            generator=torch.Generator(device="cpu").manual_seed(42),
            torch=torch,
            image=Image.new("RGB", (16, 16), (20, 100, 180)) if opaque else None,
            denoising_strength=0.75 if opaque else None,
        )
    assert result.images[0].size == (16, 16)
    return cast(bytes, result.images[0].tobytes())


def _modules(pipeline: Any) -> tuple[Any, ...]:
    return (
        pipeline.vae.encoder,
        pipeline.vae.quant_conv,
        pipeline.vae.post_quant_conv,
        pipeline.vae.decoder,
    )


@pytest.mark.parametrize("opaque", [False, True])
@pytest.mark.parametrize("precision", [None, "Auto", "FP16", "FP32"])
def test_protocol_precision_is_optional_auto_and_exactly_frozen(
    tmp_path: Path, opaque: bool, precision: Precision | None
) -> None:
    request = _request(tmp_path / "stage", opaque)
    if precision is not None:
        request["job"]["vaePrecision"] = precision
    command = parse_request(request)
    assert isinstance(command, GenerateIllustriousTxt2ImgCommand)
    assert command.vae_precision == (precision or "Auto")
    request["job"]["vaePrecision"] = "FP32" if precision != "FP32" else "FP16"
    assert command.vae_precision == (precision or "Auto")


@pytest.mark.parametrize("opaque", [False, True])
@pytest.mark.parametrize("invalid", [None, True, 0, [], {}, "auto", "fp16", "BF16"])
def test_protocol_refuses_invalid_precision_before_ml(
    tmp_path: Path, opaque: bool, invalid: object
) -> None:
    request = _request(tmp_path / "stage", opaque)
    request["job"]["vaePrecision"] = invalid
    with pytest.raises(inference.DerivativeError, match="VAE precision") as error:
        parse_request(request)
    assert error.value.code == "INVALID_REQUEST"
    assert not (tmp_path / "stage" / "output.png").exists()


@pytest.mark.parametrize("opaque", [False, True])
@pytest.mark.parametrize("auto_force", [False, True])
@pytest.mark.parametrize("precision", ["Auto", "FP16", "FP32"])
def test_actual_precision_controls_encode_and_decode_without_touching_unet_clip_or_auto(
    native: Any, opaque: bool, auto_force: bool, precision: Precision
) -> None:
    torch, _diffusers, make_pipeline = native
    pipeline = make_pipeline(opaque, auto_force)
    untouched = {
        name: {key: tensor.clone() for key, tensor in getattr(pipeline, name).state_dict().items()}
        for name in ("unet", "text_encoder", "text_encoder_2")
    }
    expected_upcast = auto_force if precision == "Auto" else precision == "FP32"
    expected_dtype = torch.float32 if expected_upcast else torch.float16
    observations: list[tuple[str, Any, set[Any]]] = []
    handles: list[Any] = []
    for name in ("encoder", "quant_conv", "post_quant_conv", "decoder"):
        module = getattr(pipeline.vae, name)

        def observe(module: Any, args: Any, *, name: str = name) -> None:
            observations.append((name, args[0].dtype, {p.dtype for p in module.parameters()}))

        handles.append(module.register_forward_pre_hook(observe))
    try:
        configure_vae_precision(pipeline, precision, torch)
        assert pipeline.vae.config.force_upcast is expected_upcast
        pixels = _run(pipeline, torch, opaque)
        assert pixels == _run(pipeline, torch, opaque)
        expected_names = {"post_quant_conv", "decoder"}
        if opaque:
            expected_names.update(("encoder", "quant_conv"))
        assert {name for name, _dtype, _params in observations} == expected_names
        assert all(
            dtype == expected_dtype and params == {expected_dtype}
            for _name, dtype, params in observations
        )
        assert {p.dtype for p in pipeline.vae.parameters()} == {torch.float16}
        for name, before in untouched.items():
            module = getattr(pipeline, name)
            assert {p.dtype for p in module.parameters()} == {torch.float16}
            assert all(
                torch.equal(before[key], tensor) for key, tensor in module.state_dict().items()
            )
    finally:
        for handle in handles:
            handle.remove()
    assert all(
        not module._forward_hooks and not module._forward_pre_hooks for module in _modules(pipeline)
    )


@pytest.mark.parametrize("opaque", [False, True])
def test_fp32_equals_native_safe_auto_fp16_equals_native_half_and_changes_pixels(
    native: Any, opaque: bool
) -> None:
    torch, _diffusers, make_pipeline = native
    outputs: dict[str, bytes] = {}
    for name, precision, force in (
        ("native-safe", "Auto", True),
        ("manual-fp32", "FP32", False),
        ("native-half", "Auto", False),
        ("manual-fp16", "FP16", True),
    ):
        pipeline = make_pipeline(opaque, force)
        configure_vae_precision(pipeline, cast(Precision, precision), torch)
        outputs[name] = _run(pipeline, torch, opaque)
    assert outputs["native-safe"] == outputs["manual-fp32"]
    assert outputs["native-half"] == outputs["manual-fp16"]
    assert outputs["manual-fp32"] != outputs["manual-fp16"]


def _worker(
    native: Any, monkeypatch: pytest.MonkeyPatch, root: Path, opaque: bool
) -> tuple[Any, Any, MLRuntime, Path, dict[str, Any]]:
    torch, diffusers, make_pipeline = native
    pipeline = make_pipeline(opaque, True)
    request = _request(root / "stage", opaque)
    config = root / "config"
    config.mkdir()
    (config / "model_index.json").write_bytes(b"verified tiny CPU loader fixture")
    monkeypatch.setattr(
        inference_config,
        "PINNED_SDXL_FILES",
        {"model_index.json": _digest(b"verified tiny CPU loader fixture")},
    )

    def load(*_args: Any, **kwargs: Any) -> Any:
        assert kwargs["torch_dtype"] == torch.float16
        assert kwargs["local_files_only"] is True
        return pipeline

    monkeypatch.setattr(
        diffusers.StableDiffusionXLImg2ImgPipeline
        if opaque
        else diffusers.StableDiffusionXLPipeline,
        "from_single_file",
        load,
    )
    actual_to = pipeline.to

    def cpu_only(device: str) -> Any:
        assert device == "cuda"
        return actual_to("cpu")

    monkeypatch.setattr(pipeline, "to", cpu_only)
    runtime = MLRuntime(torch, diffusers, importlib.import_module("compel"))
    return torch, pipeline, runtime, config, request


@pytest.mark.parametrize("opaque", [False, True])
@pytest.mark.parametrize("precision", ["Auto", "FP16", "FP32"])
def test_actual_worker_applies_precision_before_native_ml_and_publishes_only_finite_png(
    native: Any,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    opaque: bool,
    precision: Precision,
) -> None:
    torch, pipeline, runtime, config, request = _worker(native, monkeypatch, tmp_path, opaque)
    request["job"]["vaePrecision"] = precision
    observed: list[tuple[Any, set[Any]]] = []

    def record(module: Any, args: Any) -> None:
        observed.append((args[0].dtype, {p.dtype for p in module.parameters()}))

    handles = [module.register_forward_pre_hook(record) for module in _modules(pipeline)]
    try:
        result = process_inference_request(request, config_dir=config, runtime=runtime)
        assert result["type"] == "generation-done", result
        expected = torch.float16 if precision == "FP16" else torch.float32
        assert len(observed) == (4 if opaque else 2)
        assert all(dtype == expected and params == {expected} for dtype, params in observed)
        output = Path(request["job"]["output"]["pngPath"])
        assert result["outputPath"] == str(output)
        with Image.open(output) as image:
            assert image.size == (16, 16) and image.info["icc_profile"] == SRGB_ICC_PROFILE
        assert {p.dtype for p in pipeline.unet.parameters()} == {torch.float16}
        assert {p.dtype for p in pipeline.text_encoder.parameters()} == {torch.float16}
        assert {p.dtype for p in pipeline.text_encoder_2.parameters()} == {torch.float16}
    finally:
        for handle in handles:
            handle.remove()
    assert all(
        not module._forward_hooks and not module._forward_pre_hooks for module in _modules(pipeline)
    )


@pytest.mark.parametrize("module_name", ["encoder", "quant_conv", "post_quant_conv", "decoder"])
@pytest.mark.parametrize("bad_value", [float("nan"), float("inf")], ids=["nan", "inf"])
def test_worker_nonfinite_vae_without_lora_never_publishes_and_removes_hooks(
    native: Any,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    module_name: str,
    bad_value: float,
) -> None:
    opaque = module_name in {"encoder", "quant_conv"}
    torch, pipeline, runtime, config, request = _worker(native, monkeypatch, tmp_path, opaque)
    request["job"]["vaePrecision"] = "FP16"

    def inject(_module: Any, _args: Any, output: Any) -> Any:
        return torch.full_like(output, bad_value)

    handle = getattr(pipeline.vae, module_name).register_forward_hook(inject)
    try:
        result = process_inference_request(request, config_dir=config, runtime=runtime)
        assert result["type"] == "error", result
        assert result["code"] == "GENERATION_WORKER_FAILED"
        assert "VAE inference produced non-finite" in str(result)
        assert not Path(request["job"]["output"]["pngPath"]).exists()
        assert not list((tmp_path / "stage").glob("*.thumb.webp"))
        assert not list((tmp_path / "stage").glob("*.tmp"))
    finally:
        handle.remove()
    assert all(
        not module._forward_hooks and not module._forward_pre_hooks for module in _modules(pipeline)
    )


def test_guard_partial_registration_failure_removes_previously_attached_hooks(
    native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    torch, _diffusers, make_pipeline = native
    pipeline = make_pipeline(True, True)

    def fail(_hook: Any) -> Any:
        raise RuntimeError("native hook registration failed")

    monkeypatch.setattr(pipeline.vae.post_quant_conv, "register_forward_hook", fail)
    with (
        pytest.raises(RuntimeError, match="registration failed"),
        finite_vae_outputs(pipeline, torch),
    ):
        pytest.fail("The incomplete finite guard must not yield.")
    assert all(not module._forward_hooks for module in _modules(pipeline))


@pytest.mark.parametrize("opaque", [False, True])
@pytest.mark.parametrize("precision", ["FP16", "FP32"])
def test_actual_finite_decoder_weights_overflow_only_half_precision_without_black_png(
    native: Any,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    opaque: bool,
    precision: Precision,
) -> None:
    torch, pipeline, runtime, config, request = _worker(native, monkeypatch, tmp_path, opaque)
    with torch.no_grad():
        pipeline.vae.decoder.conv_out.weight.fill_(65504)
    assert torch.isfinite(pipeline.vae.decoder.conv_out.weight).all().item()
    request["job"]["vaePrecision"] = precision
    result = process_inference_request(request, config_dir=config, runtime=runtime)
    output = Path(request["job"]["output"]["pngPath"])
    if precision == "FP16":
        assert result["type"] == "error", result
        assert result["code"] == "GENERATION_WORKER_FAILED"
        assert "VAE inference produced non-finite" in str(result)
        assert not output.exists()
    else:
        assert result["type"] == "generation-done", result
        with Image.open(output) as image:
            assert image.size == (16, 16)
    assert all(
        not module._forward_hooks and not module._forward_pre_hooks for module in _modules(pipeline)
    )


@pytest.mark.parametrize("opaque", [False, True])
@pytest.mark.parametrize("precision", ["FP16", "FP32"])
def test_signed_native_lora_remains_active_with_manual_vae_precision(
    native: Any,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    opaque: bool,
    precision: Precision,
) -> None:
    pytest.importorskip("peft")
    save_file = importlib.import_module("safetensors.torch").save_file
    torch, pipeline, runtime, config, request = _worker(native, monkeypatch, tmp_path, opaque)
    lora = tmp_path / "adapter.safetensors"
    save_file(
        {
            "lora_unet_conv_in.lora_down.weight": torch.full((1, 4, 3, 3), 0.01),
            "lora_unet_conv_in.lora_up.weight": torch.full((8, 1, 1, 1), 0.01),
        },
        str(lora),
    )
    request["job"]["vaePrecision"] = precision
    request["job"]["loras"] = [
        {
            "path": str(lora),
            "sha256": _digest(lora.read_bytes()),
            "byteSize": lora.stat().st_size,
            "weight": -0.5,
        }
    ]
    result = process_inference_request(request, config_dir=config, runtime=runtime)
    assert result["type"] == "generation-done", result
    assert pipeline.get_active_adapters() == ["igs_lora_0"]
    assert pipeline.unet.conv_in.scaling["igs_lora_0"] == -0.5
    with Image.open(Path(request["job"]["output"]["pngPath"])) as image:
        assert image.size == (16, 16) and image.info["icc_profile"] == SRGB_ICC_PROFILE
    assert all(
        not module._forward_hooks and not module._forward_pre_hooks for module in _modules(pipeline)
    )
    assert not pipeline.unet._forward_hooks and not pipeline.unet._forward_pre_hooks
