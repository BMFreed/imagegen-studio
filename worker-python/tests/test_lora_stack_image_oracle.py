"""Multiple-LoRA IMG/OUT through actual small native modules and production owners.

Random native weights and procedural adapters prove mechanics, not trained image
quality. Expected low-rank values come from the real independent source oracle;
the actual loader, Compel builder, image runner, scheduler, UNet and VAE stay real.
"""

from __future__ import annotations

import copy
import importlib
import importlib.util
import sys
from dataclasses import replace
from functools import lru_cache
from pathlib import Path
from typing import Any, cast

import pytest

from imagegen_worker.inference import (
    MLRuntime,
    build_sdxl_conditioning,
    img2img_pipeline_class,
    run_sdxl_pipeline,
    select_inference_scheduler,
)
from imagegen_worker.inference_lora import finite_unet_outputs, load_generation_loras
from imagegen_worker.protocol import GenerateIllustriousImg2ImgCommand, IllustriousNoiseProfile
from imagegen_worker.sdxl_outpaint import outpaint_pipeline_class, run_sdxl_outpaint_pipeline
from test_embedding_polarity_image_oracle import image_inputs
from test_lora_stack_oracle import sources
from test_sdxl_lora import _command  # pyright: ignore[reportPrivateUsage]
from test_sdxl_lora import native as native


@lru_cache(maxsize=1)
def image_oracle() -> Any:
    path = Path(__file__).resolve().parents[2] / "scripts/noobai-lora-stack-image-oracle.py"
    spec = importlib.util.spec_from_file_location("igs_native_lora_stack_image_oracle", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def image_pipeline(native: Any, mode: str) -> tuple[Any, MLRuntime]:
    torch, original = native
    diffusers = importlib.import_module("diffusers")
    base = copy.deepcopy(original)
    with torch.random.fork_rng(devices=[]):
        torch.manual_seed(61)
        vae = diffusers.AutoencoderKL(
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
        outpaint_pipeline_class(diffusers, torch)
        if mode == "outpaint"
        else img2img_pipeline_class(diffusers, torch)
    )
    pipeline = cls(**{**base.components, "vae": vae})
    pipeline.set_progress_bar_config(disable=True)
    assert pipeline.vae_scale_factor == 8
    return pipeline, MLRuntime(torch, diffusers, importlib.import_module("compel"))


def command_for(root: Path, objective: str, stack: tuple[Any, ...]) -> Any:
    base = replace(
        _command(root),
        width=64,
        height=64,
        bbox={"x": 0, "y": 0, "width": 64, "height": 64},
        prediction_type=objective,
        scheduler="euler_a" if objective == "epsilon" else "euler",
        steps=3,
        seed=0,
        loras=stack,
        noise_profile=IllustriousNoiseProfile(objective == "v_prediction", "leading"),
    )
    # OUT's runner receives its prepared keep mask directly. Installed probes
    # validate the real OUT wire command and LaMa preparation separately.
    return GenerateIllustriousImg2ImgCommand(**vars(base), denoising_strength=0.5)


def run_native_image(
    command: Any,
    pipeline: Any,
    conditioning: Any,
    expected: Any,
    runtime: Any,
    mode: str,
    monkeypatch: pytest.MonkeyPatch,
) -> dict[str, Any]:
    torch = runtime.torch
    source, keep = image_inputs()
    source_before, keep_before = source.tobytes(), keep.tobytes()
    pipeline.scheduler = select_inference_scheduler(command, pipeline, runtime)
    assert pipeline.scheduler.config.prediction_type == command.prediction_type
    assert pipeline.scheduler.config.rescale_betas_zero_snr is (
        command.prediction_type == "v_prediction"
    )
    pipeline_class = cast(type[Any], type(pipeline))
    original = pipeline_class.__call__
    calls: list[int] = []
    unet_values: list[tuple[Any, Any]] = []
    decoder_values: list[Any] = []
    progress: list[tuple[int, int]] = []
    before_hooks = (
        set(pipeline.unet._forward_pre_hooks),
        set(pipeline.vae.decoder._forward_pre_hooks),
    )

    def call(self: Any, **kwargs: Any) -> Any:
        assert self is pipeline and "width" not in kwargs and "height" not in kwargs
        assert kwargs["image"].tobytes() == source_before
        assert kwargs["strength"] == 0.5
        assert kwargs["num_inference_steps"] == 3
        assert self.get_active_adapters() == [
            f"igs_lora_{index}" for index in range(len(command.loras))
        ]
        for argument, field in (
            ("prompt_embeds", "positive"),
            ("negative_prompt_embeds", "negative"),
            ("pooled_prompt_embeds", "positive_pooled"),
            ("negative_pooled_prompt_embeds", "negative_pooled"),
        ):
            assert torch.equal(kwargs[argument], getattr(expected, field)), argument
        calls.append(1)
        return original(self, **kwargs)

    def unet(_module: Any, _args: Any, kwargs: Any) -> None:
        hidden = kwargs["encoder_hidden_states"]
        pooled = kwargs["added_cond_kwargs"]["text_embeds"]
        assert torch.equal(hidden, torch.cat((expected.negative, expected.positive)))
        assert torch.equal(pooled, torch.cat((expected.negative_pooled, expected.positive_pooled)))
        assert torch.isfinite(hidden).all().item() and torch.isfinite(pooled).all().item()
        unet_values.append((hidden.detach().clone(), pooled.detach().clone()))

    def decoder(_module: Any, args: Any) -> None:
        assert torch.isfinite(args[0]).all().item()
        decoder_values.append(args[0].detach().clone())

    def record_progress(step: int, total: int) -> None:
        progress.append((step, total))

    unet_handle = pipeline.unet.register_forward_pre_hook(unet, with_kwargs=True)
    decoder_handle = pipeline.vae.decoder.register_forward_pre_hook(decoder)
    try:
        with monkeypatch.context() as scoped:
            scoped.setattr(pipeline_class, "__call__", call)
            arguments: dict[str, Any] = dict(
                width=64,
                height=64,
                steps=3,
                cfg_scale=command.cfg_scale,
                cfg_rescale=command.cfg_rescale,
                generator=torch.Generator(device="cpu").manual_seed(command.seed),
                torch=torch,
                image=source,
                denoising_strength=0.5,
                on_progress=record_progress,
            )
            with torch.inference_mode(), finite_unet_outputs(pipeline, torch):
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
    assert len(calls) == len(decoder_values) == 1 and len(unet_values) == 2
    assert progress == [(1, 2), (2, 2)]
    assert pipeline.scheduler.timesteps.tolist() == [667.0, 334.0, 1.0]
    assert source.tobytes() == source_before and keep.tobytes() == keep_before
    assert getattr(pipeline, "_igs_outpaint_state", None) is None
    rgba = result.images[0].convert("RGBA")
    assert rgba.size == (64, 64) and rgba.getchannel("A").getextrema() == (255, 255)
    return {"rgba": rgba.tobytes(), "decoder": decoder_values[0]}


@pytest.mark.parametrize("mode", ["img2img", "outpaint"])
@pytest.mark.parametrize("objective", ["epsilon", "v_prediction"])
def test_multiple_lora_image_order_zero_and_real_weight_swap(
    tmp_path: Path,
    native: Any,
    monkeypatch: pytest.MonkeyPatch,
    objective: str,
    mode: str,
) -> None:
    torch, base = native
    entries = sources(tmp_path, torch, base)
    first, second = entries
    oracle, reference = image_oracle(), image_oracle().stack_reference()
    stacks = {
        "ab": entries,
        "ba": (second, first),
        "b-zero": (first, replace(second, weight=0)),
        "b-disabled": (first,),
    }
    outputs = {}
    resource_snapshots = {entry.path: entry.path.read_bytes() for entry in entries}
    for choice, stack in stacks.items():
        pipeline, runtime = image_pipeline(native, mode)
        targets, baseline = oracle.references_and_baseline(pipeline, entries, torch)
        graph, state = (
            reference.graph_identity(pipeline),
            reference.base_state_digest(pipeline, torch),
        )
        command = command_for(tmp_path, objective, stack)
        with torch.random.fork_rng(devices=[]), torch.no_grad():
            load_generation_loras(pipeline, stack, torch)
            reference.inspect_loaded_stack(pipeline, stack, targets, baseline, torch)
            actual = build_sdxl_conditioning(command, pipeline, runtime)
            expected = oracle.ordinary_conditioning(command, pipeline, runtime)
            oracle.conditioning_reference().assert_conditioning_matches(actual, expected, torch)
            image, keep = image_inputs()
            handoff = oracle.observe_stack_image_handoff(
                command,
                pipeline,
                actual,
                expected,
                runtime,
                targets,
                baseline,
                image=image,
                keep_mask=keep if mode == "outpaint" else None,
            )
            assert handoff["observations"] == 1 and handoff["extraDenoisingSteps"] == 0
            outputs[choice] = run_native_image(
                command, pipeline, actual, expected, runtime, mode, monkeypatch
            )
            if choice == "ab":
                # Exact same post-validation mutation as the protected installed
                # control: ownership remains correct; only resource weights swap.
                pipeline.set_adapters(
                    ["igs_lora_0", "igs_lora_1"], adapter_weights=[second.weight, first.weight]
                )
                with pytest.raises(
                    AssertionError, match="forward differs from independent low-rank algebra"
                ):
                    oracle.observe_stack_image_handoff(
                        command,
                        pipeline,
                        actual,
                        expected,
                        runtime,
                        targets,
                        baseline,
                        image=image,
                        keep_mask=keep if mode == "outpaint" else None,
                    )
                assert getattr(pipeline, "_igs_outpaint_state", None) is None
                wrong = build_sdxl_conditioning(command, pipeline, runtime)
                wrong_expected = oracle.ordinary_conditioning(command, pipeline, runtime)
                mutant = run_native_image(
                    command, pipeline, wrong, wrong_expected, runtime, mode, monkeypatch
                )
                assert not torch.equal(outputs[choice]["decoder"], mutant["decoder"])
                assert outputs[choice]["rgba"] != mutant["rgba"]
        pipeline.unload_lora_weights()
        assert pipeline.get_active_adapters() == [] and pipeline.get_list_adapters() == {}
        assert reference.graph_identity(pipeline) == graph
        assert reference.base_state_digest(pipeline, torch) == state
    # AB/BA numerical equality is not demanded: resource order/weight binding was
    # checked at the actual native call, independent of pixel commutativity.
    assert torch.equal(outputs["b-zero"]["decoder"], outputs["b-disabled"]["decoder"])
    assert outputs["b-zero"]["rgba"] == outputs["b-disabled"]["rgba"]
    assert outputs["ab"]["rgba"] != outputs["b-disabled"]["rgba"]
    assert all(path.read_bytes() == data for path, data in resource_snapshots.items())


@pytest.mark.parametrize("mode", ["img2img", "outpaint"])
@pytest.mark.parametrize("objective", ["epsilon", "v_prediction"])
def test_disabled_second_adapter_image_neighbor_replays_without_swap_branch(
    tmp_path: Path,
    native: Any,
    monkeypatch: pytest.MonkeyPatch,
    objective: str,
    mode: str,
) -> None:
    torch, base = native
    first, _second = sources(tmp_path, torch, base)
    pipeline, runtime = image_pipeline(native, mode)
    command = command_for(tmp_path, objective, (first,))
    load_generation_loras(pipeline, command.loras, torch)
    actual = build_sdxl_conditioning(command, pipeline, runtime)
    expected = image_oracle().ordinary_conditioning(command, pipeline, runtime)
    first_result = run_native_image(command, pipeline, actual, expected, runtime, mode, monkeypatch)
    pipeline.unload_lora_weights()
    load_generation_loras(pipeline, command.loras, torch)
    second_actual = build_sdxl_conditioning(command, pipeline, runtime)
    second_expected = image_oracle().ordinary_conditioning(command, pipeline, runtime)
    second_result = run_native_image(
        command, pipeline, second_actual, second_expected, runtime, mode, monkeypatch
    )
    assert torch.equal(first_result["decoder"], second_result["decoder"])
    assert first_result["rgba"] == second_result["rgba"]
    pipeline.unload_lora_weights()
