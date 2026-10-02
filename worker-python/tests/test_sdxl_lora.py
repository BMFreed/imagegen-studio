"""Ordinary safetensors adapters through real pinned CPU SDXL/PEFT modules."""

from __future__ import annotations

import hashlib
import importlib
import importlib.metadata
from dataclasses import replace
from pathlib import Path
from types import ModuleType
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.inference import (
    MLRuntime,
    build_sdxl_conditioning,
    generate_illustrious_txt2img,
    run_sdxl_pipeline,
)
from imagegen_worker.inference_lora import (
    finite_lora_outputs,
    load_generation_loras,
    qualify_lora_state,
    read_lora_snapshot,
)
from imagegen_worker.protocol import GenerateIllustriousTxt2ImgCommand, GenerationLora


@pytest.fixture
def native(tmp_path: Path) -> Any:
    torch = pytest.importorskip("torch")
    diffusers = pytest.importorskip("diffusers")
    transformers = pytest.importorskip("transformers")
    pytest.importorskip("peft")
    assert importlib.metadata.version("peft") == "0.21.2"
    assert importlib.metadata.version("diffusers") == "0.40.0"
    previous = torch.get_num_threads()
    torch.set_num_threads(1)
    with torch.random.fork_rng(devices=[]):
        torch.manual_seed(73)
        unet = diffusers.UNet2DConditionModel(
            sample_size=8,
            in_channels=4,
            out_channels=4,
            layers_per_block=1,
            block_out_channels=(8, 16),
            down_block_types=("DownBlock2D", "CrossAttnDownBlock2D"),
            up_block_types=("CrossAttnUpBlock2D", "UpBlock2D"),
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
        )
        config = transformers.CLIPTextConfig(
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
        clip1 = transformers.CLIPTextModel(config).eval()
        clip2 = transformers.CLIPTextModelWithProjection(config).eval()
        # Real local tokenizer, with no Hub or model download. The empty merge table
        # deliberately makes each byte a token; prompt conditioning remains native.
        byte_level = importlib.import_module("tokenizers.pre_tokenizers").ByteLevel
        chars = sorted(byte_level.alphabet())
        vocab = {
            word: index
            for index, word in enumerate(
                ["<|startoftext|>", "<|endoftext|>"] + chars + [char + "</w>" for char in chars]
            )
        }
        tokenizer = transformers.CLIPTokenizer(
            vocab=vocab,
            merges=[],
            model_max_length=77,
        )
        pipeline = diffusers.StableDiffusionXLPipeline(
            vae=vae,
            text_encoder=clip1,
            text_encoder_2=clip2,
            tokenizer=tokenizer,
            tokenizer_2=tokenizer,
            unet=unet,
            scheduler=diffusers.DPMSolverMultistepScheduler(),
            add_watermarker=False,
        )
        pipeline.set_progress_bar_config(disable=True)
        yield torch, pipeline
    torch.set_num_threads(previous)


def _command(root: Path) -> GenerateIllustriousTxt2ImgCommand:
    return GenerateIllustriousTxt2ImgCommand(
        request_id="lora-native",
        checkpoint_path=root / "checkpoint.safetensors",
        checkpoint_sha256="a" * 64,
        prediction_type="epsilon",
        target_path=root / "target.png",
        target_sha256="a" * 64,
        target_byte_size=1,
        target_icc_sha256="a" * 64,
        width=16,
        height=16,
        bbox={"x": 0, "y": 0, "width": 16, "height": 16},
        positive_prompt="portrait",
        negative_prompt="blur",
        steps=2,
        cfg_scale=5,
        seed=42,
        scheduler="dpmpp_2m",
        staging_root=root,
        output_path=root / "output.png",
    )


def _state(torch: Any, pipeline: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    paths = (
        "unet.conv_in",
        "unet.conv_out",
        "unet.down_blocks.1.attentions.0.transformer_blocks.0.attn1.to_q",
        "text_encoder.text_model.encoder.layers.0.self_attn.q_proj",
        "text_encoder.text_model.encoder.layers.0.mlp.fc1",
        "text_encoder_2.text_model.encoder.layers.0.self_attn.q_proj",
        "text_encoder_2.text_model.encoder.layers.0.mlp.fc2",
    )
    state: dict[str, Any] = {}
    inputs: dict[str, Any] = {}
    for index, path in enumerate(paths):
        component, module_path = path.split(".", 1)
        module = getattr(pipeline, component).get_submodule(module_path)
        stem = {"unet": "lora_unet_", "text_encoder": "lora_te1_", "text_encoder_2": "lora_te2_"}[
            component
        ]
        stem += module_path.replace(".", "_")
        rank = 2
        if module.weight.ndim == 4:
            down = torch.randn(rank, module.in_channels, *module.kernel_size) * 0.1
            up = torch.randn(module.out_channels, rank, 1, 1) * 0.1
            inputs[path] = torch.randn(1, module.in_channels, 8, 8)
        else:
            down = torch.randn(rank, module.in_features) * 0.1
            up = torch.randn(module.out_features, rank) * 0.1
            inputs[path] = torch.randn(1, 3, module.in_features)
        state[stem + ".lora_down.weight"] = down
        state[stem + ".lora_up.weight"] = up
        # Exercise varied alpha plus the documented missing-alpha rank default.
        if index % 2 == 0:
            state[stem + ".alpha"] = torch.tensor(1.0 if index % 3 else 3.0)
    return state, inputs


def _save(path: Path, state: dict[str, Any], weight: float) -> GenerationLora:
    safetensors = pytest.importorskip("safetensors.torch")
    safetensors.save_file(state, str(path))
    data = path.read_bytes()
    return GenerationLora(path, hashlib.sha256(data).hexdigest(), len(data), weight)


def _module(pipeline: Any, path: str) -> Any:
    component, child = path.split(".", 1)
    return getattr(pipeline, component).get_submodule(child)


def test_native_signed_zero_tiny_weights_exact_pair_effects_and_both_clip_conditioning(
    native: Any,
    tmp_path: Path,
) -> None:
    torch, pipeline = native
    state, inputs = _state(torch, pipeline)
    baselines = {path: _module(pipeline, path)(value).detach() for path, value in inputs.items()}
    runtime = MLRuntime(
        torch=cast(ModuleType, torch),
        diffusers=importlib.import_module("diffusers"),
        compel=importlib.import_module("compel"),
    )
    command = _command(tmp_path)
    baseline = build_sdxl_conditioning(command, pipeline, runtime)
    normalized, targets = qualify_lora_state(pipeline, state, torch)
    assert len(targets) == 7 and len(normalized) == 14
    lora = _save(tmp_path / "ordinary.safetensors", state, 0)
    load_generation_loras(pipeline, (lora,), torch)
    for weight in (0.0, 1.0, -0.5, 0.0001, 1e-10):
        pipeline.set_adapters(["igs_lora_0"], adapter_weights=[weight])
        for target in targets:
            path = target.component + "." + target.path
            module = _module(pipeline, path)
            scale = weight * target.alpha / target.rank
            assert module.scaling["igs_lora_0"] == scale
            if target.down.ndim == 4:
                update = torch.nn.functional.conv2d(
                    torch.nn.functional.conv2d(
                        inputs[path], target.down, padding=module.base_layer.padding
                    ),
                    target.up,
                )
            else:
                update = torch.nn.functional.linear(
                    torch.nn.functional.linear(inputs[path], target.down),
                    target.up,
                )
            torch.testing.assert_close(module(inputs[path]), baselines[path] + update * scale)
        conditioned = build_sdxl_conditioning(command, pipeline, runtime)
        if weight == 0:
            assert torch.equal(conditioned.positive, baseline.positive)
            assert torch.equal(conditioned.positive_pooled, baseline.positive_pooled)
        if weight in (1, -0.5):
            assert not torch.equal(conditioned.positive[:, :, :16], baseline.positive[:, :, :16])
            assert not torch.equal(conditioned.positive[:, :, 16:], baseline.positive[:, :, 16:])
            assert not torch.equal(conditioned.positive_pooled, baseline.positive_pooled)


def test_actual_generation_two_adapters_additive_signed_replay_zero_and_fresh_pipeline(
    native: Any,
    tmp_path: Path,
) -> None:
    torch, pipeline = native
    state, inputs = _state(torch, pipeline)
    runtime = MLRuntime(
        torch, importlib.import_module("diffusers"), importlib.import_module("compel")
    )
    command = _command(tmp_path)

    def denoise() -> tuple[Any, bytes]:
        pipeline.scheduler = importlib.import_module("diffusers").DPMSolverMultistepScheduler(
            beta_start=0.00085,
            beta_end=0.012,
            beta_schedule="scaled_linear",
        )
        conditioning = build_sdxl_conditioning(command, pipeline, runtime)
        observed: list[Any] = []
        step = pipeline.scheduler.step

        def record(noise: Any, *args: Any, **kwargs: Any) -> Any:
            observed.append(noise.detach().clone())
            return step(noise, *args, **kwargs)

        pipeline.scheduler.step = record
        with finite_lora_outputs(pipeline, torch):
            result = run_sdxl_pipeline(
                pipeline,
                conditioning,
                width=16,
                height=16,
                steps=2,
                cfg_scale=5,
                generator=torch.Generator(device="cpu").manual_seed(42),
                torch=torch,
            )
        assert len(pipeline.unet._forward_hooks) == len(pipeline.vae.decoder._forward_hooks) == 0
        return torch.stack(observed), result.images[0].tobytes()

    load_generation_loras(pipeline, (), torch)
    baseline_noise, baseline_pixels = denoise()
    first = _save(tmp_path / "first.safetensors", state, -0.5)
    # Different resource paths may have identical bytes. Both ordered weights apply.
    second = _save(tmp_path / "second.safetensors", state, 0.75)
    baseline_module = _module(pipeline, next(iter(inputs)))(next(iter(inputs.values()))).detach()
    _, targets = qualify_lora_state(pipeline, state, torch)
    load_generation_loras(pipeline, (first, second), torch)
    target = targets[0]
    path = target.component + "." + target.path
    module = _module(pipeline, path)
    update = torch.nn.functional.conv2d(
        torch.nn.functional.conv2d(inputs[path], target.down, padding=module.base_layer.padding),
        target.up,
    )
    torch.testing.assert_close(
        module(inputs[path]), baseline_module + update * (0.25 * target.alpha / target.rank)
    )
    actual_noise, actual_pixels = denoise()
    repeat_noise, repeat_pixels = denoise()
    assert torch.equal(actual_noise, repeat_noise) and actual_pixels == repeat_pixels
    assert not torch.equal(actual_noise, baseline_noise) and actual_pixels != baseline_pixels
    pipeline.set_adapters(["igs_lora_0", "igs_lora_1"], adapter_weights=[0, 0])
    zero_noise, zero_pixels = denoise()
    assert torch.equal(zero_noise, baseline_noise) and zero_pixels == baseline_pixels
    pipeline.unload_lora_weights()
    fresh_noise, fresh_pixels = denoise()
    assert torch.equal(fresh_noise, baseline_noise) and fresh_pixels == baseline_pixels


@pytest.mark.parametrize(
    "corruption",
    [
        "empty",
        "unknown",
        "dora",
        "loha",
        "lora_mid",
        "partial",
        "rank",
        "shape",
        "nonfinite",
        "alpha_vector",
        "bad_dtype",
        "wrong_component",
        "mixed_naming",
    ],
)
def test_real_cpu_qualification_refuses_entire_unsupported_adapter(
    native: Any,
    corruption: str,
    tmp_path: Path,
) -> None:
    torch, pipeline = native
    state, _ = _state(torch, pipeline)
    stem = "lora_unet_conv_in"
    if corruption == "empty":
        state.clear()
    elif corruption in {"unknown", "dora", "loha", "lora_mid"}:
        suffix = {
            "unknown": "unexpected",
            "dora": "dora_scale",
            "loha": "hada_w1_a",
            "lora_mid": "lora_mid.weight",
        }[corruption]
        state[stem + "." + suffix] = torch.ones(1)
    elif corruption == "partial":
        state.pop(stem + ".lora_up.weight")
    elif corruption == "rank":
        state[stem + ".lora_up.weight"] = torch.ones(8, 3, 1, 1)
    elif corruption == "shape":
        state[stem + ".lora_down.weight"] = torch.ones(2, 7, 3, 3)
    elif corruption == "nonfinite":
        state[stem + ".lora_down.weight"][0, 0, 0, 0] = float("nan")
    elif corruption == "alpha_vector":
        state[stem + ".alpha"] = torch.ones(1)
    elif corruption == "bad_dtype":
        state[stem + ".lora_up.weight"] = state[stem + ".lora_up.weight"].double()
    elif corruption == "wrong_component":
        state = {
            key.replace("lora_te1_text_model", "lora_unet_text_model"): value
            for key, value in state.items()
        }
    elif corruption == "mixed_naming":
        state["lora_unet_input_blocks_0_0.lora_down.weight"] = torch.ones(2, 4, 3, 3)
        state["lora_unet_input_blocks_0_0.lora_up.weight"] = torch.ones(8, 2, 1, 1)
    lora = _save(tmp_path / "invalid.safetensors", state, 0.7)
    with pytest.raises(DerivativeError) as error:
        load_generation_loras(pipeline, (lora,), torch)
    assert error.value.code == "GENERATION_LORA_UNSUPPORTED"
    assert pipeline.get_list_adapters() == {}


def test_worker_snapshot_size_hash_symlink_header_and_effective_dtype_refusals(
    native: Any,
    tmp_path: Path,
) -> None:
    torch, pipeline = native
    state, _ = _state(torch, pipeline)
    lora = _save(tmp_path / "file.safetensors", state, 1e100)
    for bad in (replace(lora, sha256="a" * 64), replace(lora, byte_size=lora.byte_size + 1)):
        with pytest.raises(DerivativeError) as error:
            read_lora_snapshot(bad)
        assert error.value.code == "GENERATION_INPUT_CHANGED"
    link = tmp_path / "linked.safetensors"
    link.symlink_to(lora.path)
    with pytest.raises(DerivativeError, match="symlink"):
        read_lora_snapshot(replace(lora, path=link))
    with pytest.raises(DerivativeError, match="effective scale"):
        load_generation_loras(pipeline, (lora,), torch)
    bad_header = tmp_path / "bad-header.safetensors"
    data = (32 * 1024 * 1024 + 1).to_bytes(8, "little")
    bad_header.write_bytes(data)
    with pytest.raises(DerivativeError, match="header"):
        read_lora_snapshot(
            GenerationLora(bad_header, hashlib.sha256(data).hexdigest(), len(data), 0)
        )


def test_finite_output_guard_fails_before_nan_pixels_and_always_removes_hooks(native: Any) -> None:
    torch, pipeline = native
    with pytest.raises(DerivativeError, match="non-finite"), finite_lora_outputs(pipeline, torch):
        pipeline.vae.decoder(torch.full((1, 4, 8, 8), float("nan")))
    assert len(pipeline.unet._forward_hooks) == len(pipeline.vae.decoder._forward_hooks) == 0


@pytest.mark.parametrize(
    "path,source_dtype",
    [
        ("text_encoder.text_model.encoder.layers.0.self_attn.q_proj", "float32"),
        ("text_encoder.text_model.encoder.layers.0.mlp.fc1", "float16"),
        ("text_encoder_2.text_model.encoder.layers.0.self_attn.q_proj", "bfloat16"),
        ("text_encoder_2.text_projection", "float32"),
        ("unet.down_blocks.1.resnets.0.conv_shortcut", "float32"),
    ],
)
def test_native_single_component_subset_projection_and_conv1x1(
    native: Any,
    tmp_path: Path,
    path: str,
    source_dtype: str,
) -> None:
    torch, pipeline = native
    module = _module(pipeline, path)
    dtype = getattr(torch, source_dtype)
    rank = 3
    if module.weight.ndim == 4:
        down = (torch.randn(rank, module.in_channels, *module.kernel_size) * 0.1).to(dtype)
        up = (torch.randn(module.out_channels, rank, 1, 1) * 0.1).to(dtype)
        value = torch.randn(1, module.in_channels, 8, 8)
        update = torch.nn.functional.conv2d(
            torch.nn.functional.conv2d(value, down.float(), padding=module.padding),
            up.float(),
        )
    else:
        down = (torch.randn(rank, module.in_features) * 0.1).to(dtype)
        up = (torch.randn(module.out_features, rank) * 0.1).to(dtype)
        value = torch.randn(1, 3, module.in_features)
        update = torch.nn.functional.linear(
            torch.nn.functional.linear(value, down.float()), up.float()
        )
    baseline = module(value).detach()
    component, child = path.split(".", 1)
    prefix = {"unet": "lora_unet_", "text_encoder": "lora_te_", "text_encoder_2": "lora_te2_"}[
        component
    ]
    stem = prefix + child.replace(".", "_")
    alpha = torch.tensor(-1.7)
    state = {stem + ".lora_down.weight": down, stem + ".lora_up.weight": up, stem + ".alpha": alpha}
    lora = _save(tmp_path / "subset.safetensors", state, -0.3)
    load_generation_loras(pipeline, (lora,), torch)
    loaded = _module(pipeline, path)
    scale = lora.weight * float(alpha.item()) / rank
    assert loaded.r["igs_lora_0"] == rank
    assert loaded.scaling["igs_lora_0"] == scale
    torch.testing.assert_close(loaded(value), baseline + update * scale)
    assert set(pipeline.get_list_adapters()) == {component}


def test_native_sgm_conv_alias_and_different_module_ranks_alpha_zero(
    native: Any,
    tmp_path: Path,
) -> None:
    torch, pipeline = native
    conv = pipeline.unet.conv_in
    conv_input = torch.randn(1, conv.in_channels, 8, 8)
    baseline = conv(conv_input).detach()
    state = {
        "lora_unet_input_blocks_0_0.lora_down.weight": torch.randn(3, conv.in_channels, 3, 3) * 0.1,
        "lora_unet_input_blocks_0_0.lora_up.weight": torch.randn(conv.out_channels, 3, 1, 1) * 0.1,
        "lora_unet_input_blocks_0_0.alpha": torch.tensor(0.0),
    }
    # A second actual UNet target with another rank and an omitted alpha.
    other = pipeline.unet.conv_out
    state["lora_unet_conv_out.lora_down.weight"] = torch.randn(2, other.in_channels, 3, 3) * 0.1
    state["lora_unet_conv_out.lora_up.weight"] = torch.randn(other.out_channels, 2, 1, 1) * 0.1
    lora = _save(tmp_path / "sgm.safetensors", state, -0.5)
    load_generation_loras(pipeline, (lora,), torch)
    assert pipeline.unet.conv_in.r["igs_lora_0"] == 3
    assert pipeline.unet.conv_out.r["igs_lora_0"] == 2
    assert pipeline.unet.conv_in.scaling["igs_lora_0"] == 0
    assert pipeline.unet.conv_out.scaling["igs_lora_0"] == -0.5
    assert torch.equal(pipeline.unet.conv_in(conv_input), baseline)


def test_fp16_loading_refuses_tensor_overflow_even_with_enabled_zero_weight(
    native: Any,
    tmp_path: Path,
) -> None:
    torch, pipeline = native
    pipeline.to(dtype=torch.float16)
    # Text-encoder adapters retain the actual half inference dtype.
    state = {
        "lora_te1_text_model_encoder_layers_0_mlp_fc1.lora_down.weight": torch.full((2, 16), 1e30),
        "lora_te1_text_model_encoder_layers_0_mlp_fc1.lora_up.weight": torch.ones(32, 2),
    }
    lora = _save(tmp_path / "overflow.safetensors", state, 0)
    with pytest.raises(DerivativeError, match="overflowed"):
        load_generation_loras(pipeline, (lora,), torch)


def test_worker_refuses_duplicate_header_fields_in_the_exact_frozen_bytes(tmp_path: Path) -> None:
    path = tmp_path / "duplicate.safetensors"
    header = (
        b'{"same":{"dtype":"F32","shape":[1],"data_offsets":[0,4]},'
        b'"same":{"dtype":"F32","shape":[1],"data_offsets":[0,4]}}'
    )
    data = len(header).to_bytes(8, "little") + header + b"\x00\x00\x00\x00"
    path.write_bytes(data)
    lora = GenerationLora(path, hashlib.sha256(data).hexdigest(), len(data), 0)
    with pytest.raises(DerivativeError, match="duplicate"):
        read_lora_snapshot(lora)


def test_pipeline_loads_adapters_before_actual_compel_and_denoising(
    native: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from imagegen_worker import inference

    torch, pipeline = native
    state, _ = _state(torch, pipeline)
    lora = _save(tmp_path / "ordered.safetensors", state, -0.5)
    command = replace(_command(tmp_path), loras=(lora,))
    runtime = MLRuntime(
        torch, importlib.import_module("diffusers"), importlib.import_module("compel")
    )
    before = build_sdxl_conditioning(command, pipeline, runtime)

    def verify_config(_value: str) -> None:
        pass

    def verify_assets(_value: GenerateIllustriousTxt2ImgCommand) -> None:
        pass

    def checkpoint_digest(_value: Path) -> str:
        return command.checkpoint_sha256

    def load_pipeline(*_args: Any, **_kwargs: Any) -> Any:
        return pipeline

    monkeypatch.setattr(inference, "verify_pinned_config", verify_config)
    monkeypatch.setattr(inference, "validate_generation_assets", verify_assets)
    monkeypatch.setattr(inference, "_checkpoint_digest", checkpoint_digest)
    monkeypatch.setattr(
        runtime.diffusers.StableDiffusionXLPipeline,
        "from_single_file",
        load_pipeline,
    )
    original_to = pipeline.to

    def cpu_to(*_args: Any, **_kwargs: Any) -> Any:
        return original_to("cpu")

    monkeypatch.setattr(pipeline, "to", cpu_to)
    observed: list[Any] = []
    build = inference.build_sdxl_conditioning

    def condition(*args: Any) -> Any:
        result = build(*args)
        assert not torch.equal(result.positive, before.positive)
        assert pipeline.get_active_adapters() == ["igs_lora_0"]
        observed.append(result.positive.detach().clone())
        return result

    monkeypatch.setattr(inference, "build_sdxl_conditioning", condition)
    result = generate_illustrious_txt2img(command, config_dir=tmp_path, runtime=runtime)
    assert len(observed) == 1 and result["outputPath"] == str(command.output_path)
    with Image.open(command.output_path) as image:
        assert image.size == (16, 16)
