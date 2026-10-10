"""Signed embedding image handoff through actual tiny pinned native modules.

The production loader, Compel builder, IMG/OUT adapters, scheduler, native UNet,
VAE and decoder remain real. Seeded random native layers and procedural exact TI
files provide mechanical CPU evidence, not trained weights, LaMa or image quality.
The independent reference loads its own exact vectors and native Compel aliases.
"""

from __future__ import annotations

import importlib.util
import sys
from dataclasses import replace
from functools import lru_cache
from pathlib import Path
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker.inference import (
    build_sdxl_conditioning,
    img2img_pipeline_class,
    run_sdxl_pipeline,
    select_inference_scheduler,
)
from imagegen_worker.protocol import GenerateIllustriousImg2ImgCommand, IllustriousNoiseProfile
from imagegen_worker.sdxl_outpaint import outpaint_pipeline_class, run_sdxl_outpaint_pipeline
from test_embedding_polarity_oracle import assignments
from test_sdxl_embeddings import _command  # pyright: ignore[reportPrivateUsage]
from test_sdxl_embeddings import native as native


@lru_cache(maxsize=1)
def image_oracle() -> Any:
    path = Path(__file__).resolve().parents[2] / "scripts/noobai-embedding-polarity-image-oracle.py"
    spec = importlib.util.spec_from_file_location("igs_native_embedding_image_oracle", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def image_pipeline(native: Any, mode: str) -> Any:
    torch, runtime, make = native
    base = make()
    # The production checkpoint uses legacy CLIP argmax pooling (EOS=2).
    for encoder in (base.text_encoder, base.text_encoder_2):
        encoder.config.eos_token_id = 2
        encoder.text_model.eos_token_id = 2
    with torch.random.fork_rng(devices=[]):
        torch.manual_seed(61)
        vae = runtime.diffusers.AutoencoderKL(
            in_channels=3,
            out_channels=3,
            down_block_types=("DownEncoderBlock2D",) * 4,
            up_block_types=("UpDecoderBlock2D",) * 4,
            block_out_channels=(8, 8, 16, 16),
            layers_per_block=1,
            latent_channels=4,
            norm_num_groups=4,
            sample_size=64,
        )
    cls = (
        outpaint_pipeline_class(runtime.diffusers, torch)
        if mode == "outpaint"
        else img2img_pipeline_class(runtime.diffusers, torch)
    )
    pipeline = cls(**{**base.components, "vae": vae})
    pipeline.set_progress_bar_config(disable=True)
    assert pipeline.vae_scale_factor == 8
    return pipeline


def image_inputs() -> tuple[Image.Image, Image.Image]:
    source = Image.frombytes(
        "RGB",
        (64, 64),
        bytes(
            component
            for y in range(64)
            for x in range(64)
            for component in ((x * 3 + y) % 256, (y * 5 + x) % 256, (x * 2 + y * 3) % 256)
        ),
    )
    keep = Image.frombytes(
        "L",
        (8, 8),
        bytes(255 if x < 3 else 128 if x == 3 else 0 for _y in range(8) for x in range(8)),
    )
    return source, keep


def image_command(command: Any, objective: str) -> Any:
    base = replace(
        command,
        width=64,
        height=64,
        bbox={"x": 0, "y": 0, "width": 64, "height": 64},
        prediction_type=objective,
        scheduler="euler",
        steps=4,
        noise_profile=IllustriousNoiseProfile(objective == "v_prediction", "leading"),
    )
    # This test enters the real prepared IMG/OUT runner boundary. The masked
    # runner receives its mask separately; full OUT wire/LaMa preparation is
    # verified by the installed script, rather than a test-defined command type.
    fields = cast(dict[str, Any], vars(base))
    return GenerateIllustriousImg2ImgCommand(**fields, denoising_strength=0.75)


def ordinary_reference(command: Any, pipeline: Any, runtime: Any) -> Any:
    """No resource refs: direct native Compel, independent of the worker builder."""
    compel, torch = runtime.compel, runtime.torch
    builders = [
        compel.Compel(
            tokenizer=tokenizer,
            text_encoder=encoder,
            returned_embeddings_type=compel.ReturnedEmbeddingsType.PENULTIMATE_HIDDEN_STATES_NON_NORMALIZED,
            truncate_long_prompts=False,
            split_long_text_mode=compel.SplitLongTextMode.SENTENCES,
            requires_pooled=pooled,
        )
        for tokenizer, encoder, pooled in (
            (pipeline.tokenizer, pipeline.text_encoder, False),
            (pipeline.tokenizer_2, pipeline.text_encoder_2, True),
        )
    ]
    values: list[tuple[Any, Any]] = []
    with torch.inference_mode():
        for prompt in (command.positive_prompt, command.negative_prompt):
            clip_l = builders[0](prompt)
            clip_g, pooled = builders[1](prompt)
            values.append((torch.cat((clip_l, clip_g), dim=-1), pooled))
    return (
        image_oracle()
        .reference_oracle()
        .ReferenceConditioning(values[0][0], values[1][0], values[0][1], values[1][1], 77, 77)
    )


def run_native_image(
    command: Any,
    pipeline: Any,
    conditioning: Any,
    native: Any,
    mode: str,
    monkeypatch: pytest.MonkeyPatch,
    *,
    expected: Any = None,
) -> dict[str, Any]:
    """Observe original class call and real UNet forwards, then native decode."""
    torch, runtime, _make = native
    source, keep = image_inputs()
    source_before, keep_before = source.tobytes(), keep.tobytes()
    pipeline.scheduler = select_inference_scheduler(command, pipeline, runtime)
    assert pipeline.scheduler.config.prediction_type == command.prediction_type
    assert pipeline.scheduler.config.rescale_betas_zero_snr is (
        command.prediction_type == "v_prediction"
    )
    pipeline_class = cast(type[Any], type(pipeline))
    original = pipeline_class.__call__
    calls: list[dict[str, Any]] = []
    unet_values: list[tuple[Any, Any]] = []
    decoder_values: list[Any] = []
    progress: list[tuple[int, int]] = []
    before_hooks = (
        set(pipeline.unet._forward_pre_hooks),
        set(pipeline.vae.decoder._forward_pre_hooks),
    )

    def record_call(self: Any, **kwargs: Any) -> Any:
        assert self is pipeline and "width" not in kwargs and "height" not in kwargs
        assert kwargs["image"].mode == "RGB" and kwargs["image"].tobytes() == source_before
        assert kwargs["strength"] == 0.75
        calls.append(kwargs)
        if expected is not None:
            for argument, field in (
                ("prompt_embeds", "positive"),
                ("negative_prompt_embeds", "negative"),
                ("pooled_prompt_embeds", "positive_pooled"),
                ("negative_pooled_prompt_embeds", "negative_pooled"),
            ):
                assert torch.equal(kwargs[argument], getattr(expected, field)), argument
        return original(self, **kwargs)

    def record_unet(_module: Any, _args: Any, kwargs: Any) -> None:
        hidden = kwargs["encoder_hidden_states"]
        pooled = kwargs["added_cond_kwargs"]["text_embeds"]
        assert torch.isfinite(hidden).all().item() and torch.isfinite(pooled).all().item()
        unet_values.append((hidden.detach().clone(), pooled.detach().clone()))
        if expected is not None:
            assert torch.equal(hidden, torch.cat((expected.negative, expected.positive))), (
                "Actual CFG UNet hidden conditioning must be negative then positive"
            )
            assert torch.equal(
                pooled, torch.cat((expected.negative_pooled, expected.positive_pooled))
            ), "Actual CFG UNet pooled conditioning must be negative then positive"

    def record_decoder(_module: Any, args: Any) -> None:
        assert torch.isfinite(args[0]).all().item()
        decoder_values.append(args[0].detach().clone())

    def record_progress(step: int, total: int) -> None:
        progress.append((step, total))

    unet_handle = pipeline.unet.register_forward_pre_hook(record_unet, with_kwargs=True)
    decoder_handle = pipeline.vae.decoder.register_forward_pre_hook(record_decoder)
    try:
        with monkeypatch.context() as scoped:
            scoped.setattr(pipeline_class, "__call__", record_call)
            arguments: dict[str, Any] = dict(
                width=64,
                height=64,
                steps=command.steps,
                cfg_scale=command.cfg_scale,
                cfg_rescale=command.cfg_rescale,
                generator=torch.Generator("cpu").manual_seed(command.seed),
                torch=torch,
                image=source,
                denoising_strength=0.75,
                on_progress=record_progress,
            )
            with torch.inference_mode():
                if mode == "outpaint":
                    result = run_sdxl_outpaint_pipeline(
                        pipeline, conditioning, keep_mask=keep, **arguments
                    )
                else:
                    result = run_sdxl_pipeline(pipeline, conditioning, **arguments)
    finally:
        unet_handle.remove()
        decoder_handle.remove()
    assert pipeline_class.__call__ is original
    assert (
        set(pipeline.unet._forward_pre_hooks),
        set(pipeline.vae.decoder._forward_pre_hooks),
    ) == before_hooks
    assert len(calls) == len(decoder_values) == 1 and len(unet_values) == 3
    assert progress == [(1, 3), (2, 3), (3, 3)]
    assert pipeline.scheduler.timesteps.tolist() == [751.0, 501.0, 251.0, 1.0]
    assert source.tobytes() == source_before and keep.tobytes() == keep_before
    assert getattr(pipeline, "_igs_outpaint_state", None) is None
    rgba = result.images[0].convert("RGBA")
    assert rgba.size == (64, 64) and rgba.getchannel("A").getextrema() == (255, 255)
    return {"rgba": rgba.tobytes(), "decoder": decoder_values[0], "unet": unet_values}


@pytest.mark.parametrize("mode", ["img2img", "outpaint"])
@pytest.mark.parametrize("objective", ["epsilon", "v_prediction"])
def test_signed_embedding_image_direction_and_real_native_sign_swap(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch, objective: str, mode: str
) -> None:
    torch, runtime, _make = native
    commands = {
        label: image_command(command, objective)
        for label, command in assignments(tmp_path, torch).items()
    }
    original_commands = dict(commands)
    resource_snapshots = {
        entry.path: entry.path.read_bytes()
        for command in commands.values()
        for entry in (*command.positive_embeddings, *command.negative_embeddings)
    }
    values, outputs = {}, {}
    reference = image_oracle().reference_oracle()
    for index, (label, command) in enumerate(commands.items()):
        pipeline = image_pipeline(native, mode)
        source, keep = image_inputs()
        with torch.inference_mode():
            actual = build_sdxl_conditioning(command, pipeline, runtime)
            expected = reference.build_reference_conditioning(
                command, pipeline, runtime, namespace=f"igs_reference_image_cpu_{index}"
            )
        reference.assert_conditioning_matches(actual, expected, torch)
        values[label] = actual
        # The production command owns strength; the sentinel never draws noise.
        handoff = image_oracle().observe_image_handoff(
            command,
            pipeline,
            actual,
            expected,
            runtime,
            image=source,
            keep_mask=keep if mode == "outpaint" else None,
        )
        assert handoff["observations"] == 1 and handoff["extraDenoisingSteps"] == 0
        assert handoff["outpaint"] is (mode == "outpaint")
        outputs[label] = run_native_image(
            command, pipeline, actual, native, mode, monkeypatch, expected=expected
        )
        if label == "trained/zero":
            for hidden in (True, False):
                wrong_half = (
                    replace(actual, positive=actual.negative, negative=actual.positive)
                    if hidden
                    else replace(
                        actual,
                        positive_pooled=actual.negative_pooled,
                        negative_pooled=actual.positive_pooled,
                    )
                )
                argument = "prompt_embeds" if hidden else "pooled_prompt_embeds"
                with pytest.raises(AssertionError, match=argument + " is routed incorrectly"):
                    image_oracle().observe_image_handoff(
                        command,
                        pipeline,
                        wrong_half,
                        expected,
                        runtime,
                        image=source,
                        keep_mask=keep if mode == "outpaint" else None,
                    )
            wrong = replace(
                actual,
                positive=actual.negative,
                negative=actual.positive,
                positive_pooled=actual.negative_pooled,
                negative_pooled=actual.positive_pooled,
                positive_length=actual.negative_length,
                negative_length=actual.positive_length,
            )
            wrong_result = run_native_image(command, pipeline, wrong, native, mode, monkeypatch)
            assert not torch.equal(outputs[label]["decoder"], wrong_result["decoder"]), (
                "Actual native decoded latents must distinguish signed conditioning exchange"
            )
            assert outputs[label]["rgba"] != wrong_result["rgba"], (
                "Actual native image bytes must distinguish signed conditioning exchange"
            )
    assert reference.assert_branch_isolation(values, torch) == {
        field: {"oppositeUnchanged": True, "ownResourceChanges": True}
        for field in ("positiveHidden", "negativeHidden", "positivePooled", "negativePooled")
    }
    # Each embedding axis affects a real image while the other resource is held fixed.
    for left, right in (
        ("trained/trained", "trained/zero"),
        ("trained/trained", "zero/trained"),
        ("trained/zero", "zero/zero"),
        ("zero/trained", "zero/zero"),
    ):
        assert not torch.equal(outputs[left]["decoder"], outputs[right]["decoder"]), (left, right)
        assert outputs[left]["rgba"] != outputs[right]["rgba"], (left, right)
    assert commands == original_commands
    assert all(path.read_bytes() == snapshot for path, snapshot in resource_snapshots.items())


@pytest.mark.parametrize("mode", ["img2img", "outpaint"])
@pytest.mark.parametrize("objective", ["epsilon", "v_prediction"])
def test_ordinary_image_neighbor_keeps_direct_native_conditioning_and_replay(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch, objective: str, mode: str
) -> None:
    torch, runtime, _make = native
    command = image_command(_command(tmp_path), objective)
    assert command.positive_embeddings == command.negative_embeddings == ()
    pipeline = image_pipeline(native, mode)
    with torch.inference_mode():
        actual = build_sdxl_conditioning(command, pipeline, runtime)
        expected = ordinary_reference(command, pipeline, runtime)
    image_oracle().reference_oracle().assert_conditioning_matches(actual, expected, torch)
    first = run_native_image(
        command, pipeline, actual, native, mode, monkeypatch, expected=expected
    )
    second = run_native_image(
        command, pipeline, actual, native, mode, monkeypatch, expected=expected
    )
    assert torch.equal(first["decoder"], second["decoder"]) and first["rgba"] == second["rgba"]
