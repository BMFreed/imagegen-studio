"""Real pinned Diffusers denoising through the worker adapter, without model downloads."""

from __future__ import annotations

import importlib.metadata
from typing import Any

import pytest

from imagegen_worker.inference import SdxlConditioning, run_sdxl_pipeline


def test_actual_sdxl_cfg_rescale_changes_noise_and_keeps_zero_and_cfg_one_neutral() -> None:
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
            pipeline = diffusers.StableDiffusionXLPipeline(
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

            def denoise(rescale: float | None, cfg: float = 5) -> tuple[Any, bytes]:
                pipeline.scheduler = diffusers.DPMSolverMultistepScheduler(
                    beta_start=0.00085, beta_end=0.012, beta_schedule="scaled_linear"
                )
                noises: list[Any] = []
                actual_step = pipeline.scheduler.step

                def observe_step(model_output: Any, *args: Any, **kwargs: Any) -> Any:
                    noises.append(model_output.detach().clone())
                    return actual_step(model_output, *args, **kwargs)

                pipeline.scheduler.step = observe_step
                kwargs: dict[str, Any] = {} if rescale is None else {"cfg_rescale": rescale}
                result = run_sdxl_pipeline(
                    pipeline,
                    conditioning,
                    width=16,
                    height=16,
                    steps=2,
                    cfg_scale=cfg,
                    generator=torch.Generator(device="cpu").manual_seed(42),
                    torch=torch,
                    **kwargs,
                )
                assert len(noises) == 2
                assert all(torch.isfinite(noise).all().item() for noise in noises)
                assert len(unet._forward_pre_hooks) == 0
                image = result.images[0]
                assert image.size == (16, 16)
                return torch.stack(noises), image.tobytes()

            legacy_noise, legacy_image = denoise(None)
            zero_noise, zero_image = denoise(0)
            rescaled_noise, rescaled_image = denoise(0.7)
            assert torch.equal(legacy_noise, zero_noise)
            assert legacy_image == zero_image
            assert not torch.allclose(zero_noise, rescaled_noise)
            assert zero_image != rescaled_image
            assert rescaled_noise[0].std().item() < zero_noise[0].std().item()
            partial_noise, _ = denoise(0.3)
            assert torch.allclose(
                partial_noise[0],
                zero_noise[0] + (0.3 / 0.7) * (rescaled_noise[0] - zero_noise[0]),
                rtol=1e-5,
                atol=1e-6,
            )
            cfg_one_noise, cfg_one_image = denoise(0, cfg=1)
            cfg_one_rescaled_noise, cfg_one_rescaled_image = denoise(0.7, cfg=1)
            assert torch.equal(cfg_one_noise, cfg_one_rescaled_noise)
            assert cfg_one_image == cfg_one_rescaled_image
    finally:
        torch.set_num_threads(previous_threads)
