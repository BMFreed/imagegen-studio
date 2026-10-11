"""Concrete dynamic image variants through the actual public worker entry.

The subject is parse_request -> generate_illustrious_img2img/outpaint, including
the fresh generator, prompt normalizer, Compel, image adapters, native denoising,
VAE decode and durable PNG publication. Only the checkpoint constructor, CUDA
placement and external LaMa infill model are substituted. Seeded random native
modules prove mechanics; installed trained image qualification is separate.

Expected prompts are handwritten native Compel literals, never produced by the
worker normalizer. Expected seeds and first noise draws come from a separate
literal table, never command.seed or the subject generator. Four batch subjects
cover each positive/negative pair with seeds 0 and 1. Four seed-0/blurry neighbors
remain valid under both the constant-0 and negative-collapse semantic mutations.
"""

from __future__ import annotations

import copy
import hashlib
from pathlib import Path
from typing import Any, Literal, cast

import pytest
from PIL import Image

from imagegen_worker import inference, inference_config, outpaint_worker_assets
from imagegen_worker.derivatives import SRGB_ICC_PROFILE
from imagegen_worker.inference import MLRuntime
from imagegen_worker.protocol import (
    OUTPAINT_INFILL_BYTE_SIZE,
    OUTPAINT_INFILL_SHA256,
    GenerateIllustriousImg2ImgCommand,
    GenerateIllustriousOutpaintCommand,
    parse_request,
)
from test_embedding_polarity_image_oracle import image_inputs
from test_lora_stack_image_oracle import image_pipeline
from test_sdxl_lora import native as native

Objective = Literal["epsilon", "v_prediction"]
Mode = Literal["img2img", "outpaint"]
SCOPES: tuple[tuple[Objective, Mode], ...] = (
    ("epsilon", "img2img"),
    ("epsilon", "outpaint"),
    ("v_prediction", "img2img"),
    ("v_prediction", "outpaint"),
)
SCOPE_IDS = ("epsilon-img2img", "epsilon-outpaint", "v_prediction-img2img", "v_prediction-outpaint")

# These inputs describe concrete Main batch jobs; expansion belongs to Main,
# and its installed qualification checks the real planner and captured DTOs.
WIRE_PAIRS = (
    (
        "a (red:1.3) ceramic cup on a wooden table, studio photograph",
        "(blurry:0.7), low quality",
    ),
    (
        "a (red:1.3) ceramic cup on a wooden table, studio photograph",
        "(noisy:0.7), low quality",
    ),
    (
        "a (blue:1.3) ceramic cup on a wooden table, studio photograph",
        "(blurry:0.7), low quality",
    ),
    (
        "a (blue:1.3) ceramic cup on a wooden table, studio photograph",
        "(noisy:0.7), low quality",
    ),
)
WIRE_SEEDS = (0, 1, 0, 1, 0, 1, 0, 1)

# Independent oracle: explicit native syntax and per-iteration seed order.
# Do not replace these literals with normalize_compel_prompt or command fields.
NATIVE_PAIRS = (
    (
        "a (red)1.3 ceramic cup on a wooden table, studio photograph",
        "(blurry)0.7, low quality",
    ),
    (
        "a (red)1.3 ceramic cup on a wooden table, studio photograph",
        "(noisy)0.7, low quality",
    ),
    (
        "a (blue)1.3 ceramic cup on a wooden table, studio photograph",
        "(blurry)0.7, low quality",
    ),
    (
        "a (blue)1.3 ceramic cup on a wooden table, studio photograph",
        "(noisy)0.7, low quality",
    ),
)
EXPECTED_SEEDS = (0, 1, 0, 1, 0, 1, 0, 1)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def frozen_image_wire(
    root: Path, objective: Objective, mode: Mode
) -> tuple[dict[str, Any], Path, Image.Image]:
    staging, config = root / "staging", root / "config"
    staging.mkdir(mode=0o700)
    config.mkdir()
    (config / "model_index.json").write_bytes(b"verified tiny CPU checkpoint constructor fixture")
    checkpoint = root / "checkpoint.safetensors"
    checkpoint.write_bytes(b"exact constructor fixture identity; not trained checkpoint bytes")
    prepared, _ = image_inputs()
    source = prepared.convert("RGBA")
    if mode == "outpaint":
        # This is raw target alpha, not an already prepared latent keep mask.
        # Leave room for bilinear reduction, the 16px coherence edge and 16px
        # output fade to retain protected, soft and fully generated pixels.
        alpha = Image.frombytes(
            "L",
            source.size,
            bytes(255 if x < 48 else 128 if x < 56 else 0 for _y in range(64) for x in range(64)),
        )
        source.putalpha(alpha)
    target = staging / "target.png"
    source.save(target, format="PNG", icc_profile=SRGB_ICC_PROFILE)
    target_bytes = target.read_bytes()
    target_metadata = {
        "sha256": digest(target_bytes),
        "byteSize": len(target_bytes),
        "width": 64,
        "height": 64,
        "iccSha256": digest(SRGB_ICC_PROFILE),
    }
    bbox = {"x": -64, "y": 24, "width": 64, "height": 64}
    job: dict[str, Any] = {
        "schemaVersion": 1,
        "checkpoint": {
            "path": str(checkpoint),
            "sha256": digest(checkpoint.read_bytes()),
            "predictionType": objective,
        },
        "target": {"path": str(target), **target_metadata},
        "bbox": bbox,
        "prompts": {"positive": WIRE_PAIRS[0][0], "negative": WIRE_PAIRS[0][1]},
        "sampling": {
            "steps": 3,
            "cfgScale": 5,
            "cfgRescale": 0,
            "seed": 0,
            "scheduler": "euler_a" if objective == "epsilon" else "euler",
            "denoisingStrength": 0.5,
            "noiseProfile": {
                "schemaVersion": 1,
                "baseSchedule": "sdxl-scaled-linear-v1",
                "rescaleBetasZeroSnr": objective == "v_prediction",
                "timestepSpacing": "leading",
            },
        },
        "vaePrecision": "FP32",
        "output": {"stagingRoot": str(staging), "pngPath": str(staging / "output.png")},
    }
    if mode == "outpaint":
        infill = {
            "role": "outpaint-infill",
            "sha256": OUTPAINT_INFILL_SHA256,
            "byteSize": OUTPAINT_INFILL_BYTE_SIZE,
        }
        job["infillResource"] = {**infill, "path": str(root / "managed-lama.pt")}
        job["conditioning"] = {
            "schemaVersion": 1,
            "kind": "alpha-outpaint-conditioning",
            "bbox": copy.deepcopy(bbox),
            "infillResource": infill,
            "sourceTarget": {"format": "png", **target_metadata},
            "keepMask": {
                "format": "alpha8",
                "polarity": "keep",
                "width": 64,
                "height": 64,
                "byteSize": 4096,
                "sha256": digest(source.getchannel("A").tobytes()),
            },
            "policy": {
                "edgeRadius": 16,
                "fadeDistance": 16,
                "infillMethod": "lama",
                "maskBlur": "gaussian-weighted-max",
                "minimumDenoise": 0,
                "outputMode": "contribution",
                "version": 1,
            },
        }
    wire: dict[str, Any] = {
        "type": f"generate-illustrious-{mode}",
        "protocolVersion": "1",
        "requestId": "dynamic-native-image",
        "job": job,
    }
    return wire, config, prepared


def native_literal_conditioning(
    pair: tuple[str, str], pipeline: Any, runtime: MLRuntime
) -> dict[str, Any]:
    """Reference uses public native Compel, independent of all worker prompt code."""
    compel, torch = cast(Any, runtime.compel), cast(Any, runtime.torch)
    arguments: dict[str, Any] = {
        "returned_embeddings_type": (
            compel.ReturnedEmbeddingsType.PENULTIMATE_HIDDEN_STATES_NON_NORMALIZED
        ),
        "truncate_long_prompts": False,
        "split_long_text_mode": compel.SplitLongTextMode.SENTENCES,
    }
    clip1 = compel.Compel(
        tokenizer=pipeline.tokenizer,
        text_encoder=pipeline.text_encoder,
        requires_pooled=False,
        **arguments,
    )
    clip2 = compel.Compel(
        tokenizer=pipeline.tokenizer_2,
        text_encoder=pipeline.text_encoder_2,
        requires_pooled=True,
        **arguments,
    )
    signed: list[tuple[Any, Any]] = []
    with torch.inference_mode():
        for literal in pair:
            first, (second, pooled) = clip1(literal), clip2(literal)
            assert first.shape[1] == second.shape[1] == 77
            signed.append((torch.cat((first, second), dim=-1), pooled))
    return {
        "prompt_embeds": signed[0][0],
        "negative_prompt_embeds": signed[1][0],
        "pooled_prompt_embeds": signed[0][1],
        "negative_pooled_prompt_embeds": signed[1][1],
    }


def execute_and_observe(
    wire: dict[str, Any],
    config: Path,
    prepared: Image.Image,
    native: Any,
    mode: Mode,
    expected_pair: tuple[str, str],
    expected_seed: int,
    monkeypatch: pytest.MonkeyPatch,
) -> dict[str, Any]:
    """Enter the production owner; observing helpers never manufacture its generator."""
    command = parse_request(wire)
    assert isinstance(command, GenerateIllustriousImg2ImgCommand)
    assert isinstance(command, GenerateIllustriousOutpaintCommand) is (mode == "outpaint")
    pipeline, runtime = image_pipeline(native, mode)
    torch, diffusers = cast(Any, runtime.torch), cast(Any, runtime.diffusers)
    expected = native_literal_conditioning(expected_pair, pipeline, runtime)
    fresh = torch.Generator(device="cpu").manual_seed(expected_seed)
    initial_generator_state = fresh.get_state().clone()
    source_snapshot = command.target_path.read_bytes()
    checkpoint_snapshot = command.checkpoint_path.read_bytes()
    image_snapshot = prepared.tobytes()
    pipeline_class = cast(type[Any], type(pipeline))
    native_call = pipeline_class.__call__
    native_to = pipeline.to
    calls: list[int] = []
    initial_noises: list[Any] = []
    unet_values: list[tuple[Any, Any]] = []
    decoder_values: list[Any] = []
    progress: list[tuple[int, int]] = []
    infill_calls: list[int] = []
    hook_sets = (
        set(pipeline.unet._forward_pre_hooks),
        set(pipeline.vae.decoder._forward_pre_hooks),
    )

    def construct(_cls: Any, path: str, **kwargs: Any) -> Any:
        assert path == str(command.checkpoint_path)
        assert kwargs == {
            "config": str(config),
            "local_files_only": True,
            "torch_dtype": torch.float16,
        }
        return pipeline

    def cpu_placement(device: str) -> Any:
        assert device == "cuda"
        return native_to("cpu")

    class PreparedLaMaFixture:
        """External infill collaborator; actual PNG and alpha preparation stay real."""

        def infill(self, source: Image.Image) -> Image.Image:
            assert source.mode == "RGBA" and source.size == (64, 64)
            assert source.convert("RGB").tobytes() == image_snapshot
            assert source.getchannel("A").getextrema() == (0, 255)
            infill_calls.append(1)
            return prepared.copy()

    def local_lama(
        path: Path, *, expected_sha256: str, expected_byte_size: int, device: str
    ) -> PreparedLaMaFixture:
        assert path == command.staging_root.parent / "managed-lama.pt"
        assert (expected_sha256, expected_byte_size, device) == (
            OUTPAINT_INFILL_SHA256,
            OUTPAINT_INFILL_BYTE_SIZE,
            "cpu",
        )
        return PreparedLaMaFixture()

    def call(self: Any, **kwargs: Any) -> Any:
        assert self is pipeline and "width" not in kwargs and "height" not in kwargs
        generator = kwargs["generator"]
        assert isinstance(generator, torch.Generator) and generator.device.type == "cpu"
        assert generator.initial_seed() == expected_seed, "worker generator lost literal seed"
        assert torch.equal(generator.get_state(), initial_generator_state), "generator not fresh"
        assert kwargs["image"].mode == "RGB" and kwargs["image"].tobytes() == image_snapshot
        assert kwargs["strength"] == 0.5 and kwargs["num_inference_steps"] == 3
        for name, value in expected.items():
            assert torch.equal(kwargs[name], value), f"worker lost literal conditioning: {name}"
        assert self.scheduler.config.prediction_type == command.prediction_type
        assert self.scheduler.config.rescale_betas_zero_snr is (
            command.prediction_type == "v_prediction"
        )
        add_noise = self.scheduler.add_noise

        def observe_noise(original_samples: Any, noise: Any, timesteps: Any) -> Any:
            # Recreated independently for every observation, including OUT's
            # reinsertion: neither the VAE posterior nor Euler a may replace it.
            expected_noise = torch.randn(
                noise.shape,
                generator=torch.Generator(device="cpu").manual_seed(expected_seed),
                dtype=noise.dtype,
                device="cpu",
            ).to(noise.device)
            assert torch.equal(noise, expected_noise), "initial image noise lost literal seed"
            assert noise.shape == (1, 4, 8, 8) and torch.isfinite(original_samples).all().item()
            initial_noises.append(noise.detach().clone())
            return add_noise(original_samples, noise, timesteps)

        calls.append(1)
        with monkeypatch.context() as noise_scope:
            noise_scope.setattr(self.scheduler, "add_noise", observe_noise)
            return native_call(self, **kwargs)

    def unet(_module: Any, _args: Any, kwargs: Any) -> None:
        hidden = kwargs["encoder_hidden_states"]
        pooled = kwargs["added_cond_kwargs"]["text_embeds"]
        assert torch.equal(
            hidden, torch.cat((expected["negative_prompt_embeds"], expected["prompt_embeds"]))
        ), "native CFG lost signed weighted pair"
        assert torch.equal(
            pooled,
            torch.cat(
                (expected["negative_pooled_prompt_embeds"], expected["pooled_prompt_embeds"])
            ),
        ), "native CFG lost signed pooled pair"
        unet_values.append((hidden.detach().clone(), pooled.detach().clone()))

    def decoder(_module: Any, args: Any) -> None:
        assert torch.isfinite(args[0]).all().item()
        decoder_values.append(args[0].detach().clone())

    def record_progress(step: int, total: int) -> None:
        progress.append((step, total))

    handles = (
        pipeline.unet.register_forward_pre_hook(unet, with_kwargs=True),
        pipeline.vae.decoder.register_forward_pre_hook(decoder),
    )
    try:
        with monkeypatch.context() as worker_scope:
            worker_scope.setattr(
                inference_config,
                "PINNED_SDXL_FILES",
                {"model_index.json": digest((config / "model_index.json").read_bytes())},
            )
            worker_scope.setattr(
                diffusers.StableDiffusionXLImg2ImgPipeline,
                "from_single_file",
                classmethod(construct),
            )
            worker_scope.setattr(pipeline, "to", cpu_placement)
            worker_scope.setattr(pipeline_class, "__call__", call)
            worker_scope.setattr(outpaint_worker_assets, "load_local_lama", local_lama)
            if isinstance(command, GenerateIllustriousOutpaintCommand):
                result = inference.generate_illustrious_outpaint(
                    command, config_dir=config, runtime=runtime, on_progress=record_progress
                )
            else:
                result = inference.generate_illustrious_img2img(
                    command, config_dir=config, runtime=runtime, on_progress=record_progress
                )
    finally:
        for handle in handles:
            handle.remove()
    assert pipeline_class.__call__ is native_call
    assert (
        set(pipeline.unet._forward_pre_hooks),
        set(pipeline.vae.decoder._forward_pre_hooks),
    ) == hook_sets
    assert getattr(pipeline, "_igs_outpaint_state", None) is None
    assert len(calls) == len(decoder_values) == 1 and len(unet_values) == 2
    assert len(initial_noises) == (2 if mode == "outpaint" else 1)
    assert len(infill_calls) == (1 if mode == "outpaint" else 0)
    assert progress == [(1, 2), (2, 2)]
    assert pipeline.scheduler.timesteps.tolist() == [667.0, 334.0, 1.0]
    assert result["type"] == "generation-done" and result["seed"] == expected_seed
    assert result["requestId"] == wire["requestId"]
    assert result["outputPath"] == str(command.output_path)
    with Image.open(command.output_path) as output:
        assert output.size == (64, 64) and output.info["icc_profile"] == SRGB_ICC_PROFILE
        assert output.mode == ("RGBA" if mode == "outpaint" else "RGB")
        if mode == "outpaint":
            alpha = output.getchannel("A")
            assert alpha.getextrema() == (0, 255)
            assert alpha.getpixel((0, 32)) == 0 and alpha.getpixel((63, 32)) == 255
            assert any(0 < value < 255 for value in alpha.tobytes())
        rgba = output.convert("RGBA").tobytes()
    assert command.target_path.read_bytes() == source_snapshot
    assert command.checkpoint_path.read_bytes() == checkpoint_snapshot
    assert prepared.tobytes() == image_snapshot
    return {
        "rgba": rgba,
        "decoder": decoder_values[0],
        "initialNoise": initial_noises[0],
        "signedHidden": unet_values[0][0],
        "signedPooled": unet_values[0][1],
    }


@pytest.mark.parametrize(("objective", "mode"), SCOPES, ids=SCOPE_IDS)
def test_dynamic_image_batch_preserves_weighted_pair_and_seed(
    tmp_path: Path,
    native: Any,
    monkeypatch: pytest.MonkeyPatch,
    objective: Objective,
    mode: Mode,
) -> None:
    wire, config, prepared = frozen_image_wire(tmp_path, objective, mode)
    torch = native[0]
    outputs: list[dict[str, Any]] = []
    for index, (input_seed, expected_seed) in enumerate(
        zip(WIRE_SEEDS, EXPECTED_SEEDS, strict=True)
    ):
        concrete = copy.deepcopy(wire)
        concrete["requestId"] = f"dynamic-native-{index}"
        concrete["job"]["prompts"] = dict(
            zip(("positive", "negative"), WIRE_PAIRS[index // 2], strict=True)
        )
        concrete["job"]["sampling"]["seed"] = input_seed
        concrete["job"]["output"]["pngPath"] = str(tmp_path / "staging" / f"output-{index}.png")
        outputs.append(
            execute_and_observe(
                concrete,
                config,
                prepared,
                native,
                mode,
                NATIVE_PAIRS[index // 2],
                expected_seed,
                monkeypatch,
            )
        )
    assert len(outputs) == 8
    for zero, one in zip(outputs[::2], outputs[1::2], strict=True):
        assert not torch.equal(zero["initialNoise"], one["initialNoise"])
        assert not torch.equal(zero["decoder"], one["decoder"])
        assert zero["rgba"] != one["rgba"]
    # Same seed: changing one prompt sign reaches actual signed native tensors
    # and the decoder, while the input noise stays identical.
    for baseline, neighbor in ((outputs[0], outputs[2]), (outputs[0], outputs[4])):
        assert torch.equal(baseline["initialNoise"], neighbor["initialNoise"])
        assert not torch.equal(baseline["signedHidden"], neighbor["signedHidden"])
        assert not torch.equal(baseline["decoder"], neighbor["decoder"])


@pytest.mark.parametrize(("objective", "mode"), SCOPES, ids=SCOPE_IDS)
def test_seed_zero_baseline_prompt_neighbor_is_reproducible(
    tmp_path: Path,
    native: Any,
    monkeypatch: pytest.MonkeyPatch,
    objective: Objective,
    mode: Mode,
) -> None:
    wire, config, prepared = frozen_image_wire(tmp_path, objective, mode)
    torch = native[0]
    observed: list[dict[str, Any]] = []
    for iteration in (0, 1):
        concrete = copy.deepcopy(wire)
        concrete["requestId"] = f"seed-zero-baseline-{iteration}"
        concrete["job"]["output"]["pngPath"] = str(tmp_path / "staging" / f"replay-{iteration}.png")
        observed.append(
            execute_and_observe(
                concrete, config, prepared, native, mode, NATIVE_PAIRS[0], 0, monkeypatch
            )
        )
    first, replay = observed
    assert first["rgba"] == replay["rgba"]
    for field in ("initialNoise", "decoder", "signedHidden", "signedPooled"):
        assert torch.equal(first[field], replay[field]), field
