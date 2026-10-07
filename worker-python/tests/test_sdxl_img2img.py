"""Actual pinned VAE, scheduler and UNet behavior through the img2img adapter."""

from __future__ import annotations

import importlib.metadata
from typing import Any

import pytest
from PIL import Image

from imagegen_worker import inference
from imagegen_worker.inference import SdxlConditioning, run_sdxl_pipeline


def test_actual_img2img_source_strength_replay_and_effective_six_scheduler_progress() -> None:
    torch = pytest.importorskip("torch")
    diffusers = pytest.importorskip("diffusers")
    assert importlib.metadata.version("diffusers") == "0.40.0"
    previous_threads = torch.get_num_threads()
    torch.set_num_threads(1)
    try:
        with torch.random.fork_rng(devices=[]):
            torch.manual_seed(7)
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
            pipeline = inference.img2img_pipeline_class(diffusers, torch)(
                vae=vae,
                text_encoder=None,
                text_encoder_2=None,
                tokenizer=None,
                tokenizer_2=None,
                unet=unet,
                scheduler=diffusers.DPMSolverMultistepScheduler(),
                force_zeros_for_empty_prompt=False,
                add_watermarker=False,
            )
            pipeline.set_progress_bar_config(disable=True)
            negative = torch.randn(1, 4, 32)
            negative[:, 2:] = 0
            conditioning = SdxlConditioning(
                positive=torch.randn(1, 4, 32),
                negative=negative,
                positive_pooled=torch.randn(1, 16),
                negative_pooled=torch.randn(1, 16),
                positive_length=4,
                negative_length=2,
            )
            source = Image.new("RGB", (16, 16), (20, 100, 180))
            observed: dict[str, list[Any]] = {"vae": [], "noise": [], "steps": []}

            def record_vae(_module: Any, args: tuple[Any, ...]) -> None:
                observed["vae"].append(args[0].detach().clone())

            vae_handle = vae.encoder.register_forward_pre_hook(record_vae)

            def generate(
                strength: float,
                scheduler: str = "dpmpp_2m",
                *,
                image: Image.Image = source,
                seed: int = 42,
                rescale: float = 0,
            ) -> tuple[bytes, list[tuple[int, int]], Any]:
                beta = {"beta_start": 0.00085, "beta_end": 0.012, "beta_schedule": "scaled_linear"}
                if scheduler == "euler":
                    pipeline.scheduler = diffusers.EulerDiscreteScheduler(**beta)
                elif scheduler == "euler_a":
                    pipeline.scheduler = diffusers.EulerAncestralDiscreteScheduler(**beta)
                elif scheduler.startswith("dpmpp_sde"):
                    pipeline.scheduler = diffusers.DPMSolverSDEScheduler(
                        **beta, use_karras_sigmas=scheduler.endswith("_k"), noise_sampler_seed=seed
                    )
                else:
                    pipeline.scheduler = diffusers.DPMSolverMultistepScheduler(
                        **beta, use_karras_sigmas=scheduler.endswith("_k")
                    )
                actual_noise = pipeline.scheduler.add_noise
                actual_step = pipeline.scheduler.step
                observed["noise"] = []
                observed["steps"] = []

                def record_noise(latents: Any, noise: Any, timestep: Any) -> Any:
                    observed["noise"].append((latents.clone(), noise.clone(), timestep.clone()))
                    return actual_noise(latents, noise, timestep)

                def record_step(noise: Any, *args: Any, **kwargs: Any) -> Any:
                    observed["steps"].append(noise.clone())
                    return actual_step(noise, *args, **kwargs)

                pipeline.scheduler.add_noise = record_noise
                pipeline.scheduler.step = record_step
                progress: list[tuple[int, int]] = []
                result = run_sdxl_pipeline(
                    pipeline,
                    conditioning,
                    width=16,
                    height=16,
                    steps=4,
                    cfg_scale=5,
                    generator=torch.Generator(device="cpu").manual_seed(seed),
                    torch=torch,
                    cfg_rescale=rescale,
                    image=image,
                    denoising_strength=strength,
                    on_progress=lambda step, total: progress.append((step, total)),
                )
                assert result.images[0].size == (16, 16)
                assert len(unet._forward_pre_hooks) == 0
                assert all(torch.isfinite(noise).all().item() for noise in observed["steps"])
                return result.images[0].tobytes(), progress, observed["noise"][:]

            zero, progress, noised = generate(0)
            assert not progress and not noised and not observed["steps"]
            assert observed["vae"] and observed["vae"][-1].shape == (1, 3, 16, 16)
            replay_zero, _, _ = generate(0)
            assert zero == replay_zero
            changed_source, _, _ = generate(0, image=Image.new("RGB", (16, 16), (200, 30, 90)))
            assert zero != changed_source
            tiny, progress, noised = generate(0.0001)
            assert zero == tiny and not progress and not noised

            for scheduler in (
                "dpmpp_2m",
                "dpmpp_2m_k",
                "euler",
                "euler_a",
                "dpmpp_sde",
                "dpmpp_sde_k",
            ):
                outputs: dict[float, bytes] = {}
                for strength in (0.0, 0.2, 0.75, 1.0):
                    pixels, progress, noised = generate(strength, scheduler)
                    full = pipeline.scheduler.timesteps
                    start = int((full[:: pipeline.scheduler.order] >= round(1000 * strength)).sum())
                    expected = full[start * pipeline.scheduler.order :]
                    assert len(observed["steps"]) == len(expected)
                    assert progress == [(step + 1, len(expected)) for step in range(len(expected))]
                    if len(expected):
                        assert len(noised) == 1 and torch.equal(noised[0][2], expected[:1])
                        expected_noise = torch.randn(
                            noised[0][1].shape,
                            generator=torch.Generator(device="cpu").manual_seed(42),
                        )
                        assert torch.equal(noised[0][1], expected_noise)
                    else:
                        assert not noised
                    outputs[strength] = pixels
                assert outputs[0] != outputs[0.75] != outputs[1]

            original, progress, _ = generate(0.75)
            replay, replay_progress, _ = generate(0.75)
            assert original == replay and progress == replay_progress
            changed_seed, _, _ = generate(0.75, seed=43)
            assert original != changed_seed
            rescaled, _, _ = generate(0.75, rescale=0.7)
            assert original != rescaled
            native = diffusers.StableDiffusionXLImg2ImgPipeline(
                vae=vae,
                text_encoder=None,
                text_encoder_2=None,
                tokenizer=None,
                tokenizer_2=None,
                unet=unet,
                scheduler=diffusers.DPMSolverMultistepScheduler(
                    beta_start=0.00085,
                    beta_end=0.012,
                    beta_schedule="scaled_linear",
                    use_karras_sigmas=True,
                ),
                force_zeros_for_empty_prompt=False,
                add_watermarker=False,
            )
            native.scheduler.set_timesteps(4)
            native_timesteps, _ = native.get_timesteps(4, 0.2, "cpu")
            assert len(native_timesteps) == 0
            pipeline.scheduler = diffusers.DPMSolverMultistepScheduler(
                beta_start=0.00085,
                beta_end=0.012,
                beta_schedule="scaled_linear",
                use_karras_sigmas=True,
            )
            pipeline.scheduler.set_timesteps(4)
            selected, _ = pipeline.get_timesteps(4, 0.2, "cpu")
            assert selected.tolist() == [146, 0]
            _, small_progress, _ = generate(0.0006, "dpmpp_2m_k")
            assert small_progress == [(1, 1)]
            vae_handle.remove()
    finally:
        torch.set_num_threads(previous_threads)


def test_pinned_six_scheduler_cuts_at_actual_training_threshold_for_steps_boundaries() -> None:
    torch = pytest.importorskip("torch")
    diffusers = pytest.importorskip("diffusers")
    factory = inference.img2img_pipeline_class(diffusers, torch)
    # The production override operates on real initialized schedulers; no weights are needed.
    from types import SimpleNamespace

    for name in ("dpmpp_2m", "dpmpp_2m_k", "euler", "euler_a", "dpmpp_sde", "dpmpp_sde_k"):
        for steps in (1, 2, 7, 200):
            beta = {"beta_start": 0.00085, "beta_end": 0.012, "beta_schedule": "scaled_linear"}
            if name == "euler":
                scheduler = diffusers.EulerDiscreteScheduler(**beta)
            elif name == "euler_a":
                scheduler = diffusers.EulerAncestralDiscreteScheduler(**beta)
            elif name.startswith("dpmpp_sde"):
                scheduler = diffusers.DPMSolverSDEScheduler(
                    **beta, use_karras_sigmas=name.endswith("_k"), noise_sampler_seed=42
                )
            else:
                scheduler = diffusers.DPMSolverMultistepScheduler(
                    **beta, use_karras_sigmas=name.endswith("_k")
                )
            scheduler.set_timesteps(steps, device="cpu")
            full = scheduler.timesteps.clone()
            for strength in (0.0, 0.0001, 0.2, 0.75, 1.0):
                selected, effective = factory.get_timesteps(
                    SimpleNamespace(scheduler=scheduler), steps, strength, "cpu"
                )
                # Independently execute Invoke's threshold algorithm (>= excludes equality).
                logical: list[float] = full[:: scheduler.order].tolist()
                skipped = len(
                    list(filter(lambda timestep: timestep >= round(1000 * strength), logical))
                )
                expected = full[skipped * scheduler.order :]
                assert torch.equal(selected, expected), (name, steps, strength)
                assert effective == len(expected[:: scheduler.order])
                assert len(selected) <= 2 * steps
                if hasattr(scheduler, "begin_index"):
                    assert scheduler.begin_index == skipped * scheduler.order
