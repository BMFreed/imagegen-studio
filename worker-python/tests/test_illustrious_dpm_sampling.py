"""Production-selected DPM loops versus fresh pinned native pipelines.

The trained-weight campaign is separate. These real tiny UNet/VAE cases expose
worker callback history loss and Brownian-entropy drift after finite setup.
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from types import ModuleType, SimpleNamespace
from typing import Any, cast

import pytest

from imagegen_worker.inference import MLRuntime, run_sdxl_pipeline, select_inference_scheduler
from imagegen_worker.protocol import IllustriousNoiseProfile
from imagegen_worker.sdxl_outpaint import run_sdxl_outpaint_pipeline
from test_illustrious_noise_profile import independent_alphas
from test_inference_boundary import illustrious_command

# Reuse the pinned independent test oracle rather than duplicating its source extraction.
from test_sdxl_outpaint import _mask, _upstream_guidance  # pyright: ignore[reportPrivateUsage]
from test_sdxl_outpaint import native as native_fixture

native = native_fixture
_SCHEDULERS = ("dpmpp_2m", "dpmpp_2m_k", "dpmpp_sde", "dpmpp_sde_k")
_CASES = ("txt", "img-neighbor", "img-sensitive", "out-neighbor", "out-sensitive")


def _reference_scheduler(
    native: Any,
    name: str,
    *,
    lower_policy: bool = False,
    prediction: str = "epsilon",
    rescale: bool = False,
) -> Any:
    """Independent constructor values; never call the production selector."""
    options: dict[str, Any] = {
        "num_train_timesteps": 1000,
        "beta_start": 0.00085,
        "beta_end": 0.012,
        "beta_schedule": "scaled_linear",
        "steps_offset": 1,
        "timestep_spacing": "leading",
        "prediction_type": prediction,
        "use_karras_sigmas": name.endswith("_k"),
    }
    if name.startswith("dpmpp_sde"):
        assert not rescale, "Native SDE has no zero-SNR transform."
        return native.diffusers.DPMSolverSDEScheduler(
            **options, noise_sampler_seed=0x9E3779B9 if lower_policy else 0
        )
    return native.diffusers.DPMSolverMultistepScheduler(
        **options,
        algorithm_type="dpmsolver++",
        solver_order=1 if lower_policy else 2,
        rescale_betas_zero_snr=rescale,
    )


def _new_pipeline(native: Any, pipeline_type: Any, scheduler: Any) -> Any:
    """Reuse native model objects; a separate pipeline owns each scheduler/loop."""
    pipeline = pipeline_type(
        vae=native.pipeline.vae,
        unet=native.pipeline.unet,
        text_encoder=None,
        text_encoder_2=None,
        tokenizer=None,
        tokenizer_2=None,
        scheduler=scheduler,
        force_zeros_for_empty_prompt=False,
        add_watermarker=False,
    )
    pipeline.set_progress_bar_config(disable=True)
    return pipeline


def _reference_image_class(native: Any, state: Any) -> Any:
    """Native loop with independently authored image preparation contracts."""
    torch = native.torch
    base = native.diffusers.StableDiffusionXLImg2ImgPipeline

    class ReferenceImagePipeline(base):
        def get_timesteps(
            self, steps: int, strength: float, device: Any, denoising_start: Any = None
        ) -> tuple[Any, int]:
            assert denoising_start is None
            logical = self.scheduler.timesteps[:: self.scheduler.order].tolist()
            cutoff = round(1000 * strength)
            excluded = len([value for value in logical if value >= cutoff])
            begin = excluded * self.scheduler.order
            self.scheduler.set_begin_index(begin)
            state.timesteps = self.scheduler.timesteps[begin:].clone()
            return state.timesteps, len(logical) - excluded

        def prepare_latents(
            self,
            image: Any,
            timestep: Any,
            batch_size: int,
            num_images_per_prompt: int,
            dtype: Any,
            device: Any,
            generator: Any = None,
            add_noise: bool = True,
        ) -> Any:
            assert batch_size == num_images_per_prompt == 1 and add_noise
            # Seed0 is this test's fixed posterior domain, independent of initial
            # diffusion noise; the public native VAE preparation is kept real.
            state.original = base.prepare_latents(
                self,
                image,
                timestep,
                batch_size,
                num_images_per_prompt,
                dtype,
                device,
                torch.Generator(device="cpu").manual_seed(0),
                add_noise=False,
            )
            state.noise = torch.randn(
                state.original.shape, generator=generator, device="cpu", dtype=dtype
            ).to(device)
            return self.scheduler.add_noise(state.original, state.noise, timestep)

    return ReferenceImagePipeline


def _observe_native_call(
    native: Any, callback: Any, *, timesteps: list[Any] | None = None
) -> tuple[Any, list[Any], list[Any]]:
    predictions: list[Any] = []
    decoded: list[Any] = []

    def observe_unet(_module: Any, args: Any, _kwargs: Any) -> None:
        predictions.append(args[0].detach().clone())
        if timesteps is not None:
            timesteps.append(args[1].detach().clone())

    def observe_decode(_module: Any, args: Any) -> None:
        decoded.append(args[0].detach().clone())

    handles = [
        native.pipeline.unet.register_forward_pre_hook(observe_unet, with_kwargs=True),
        native.pipeline.vae.post_quant_conv.register_forward_pre_hook(observe_decode),
    ]
    try:
        result = callback()
    finally:
        for handle in handles:
            handle.remove()
    assert len(decoded) == 1
    return result.images[0], predictions, decoded


def _reference_run(
    native: Any,
    name: str,
    mode: str,
    strength: float | None,
    *,
    lower_policy: bool = False,
    prediction: str = "epsilon",
    rescale: bool = False,
    cfg_scale: float = 5,
) -> tuple[Any, list[Any], list[Any], list[tuple[int, int]]]:
    """Fresh native denoising; no worker loop, callback or selection in the oracle."""
    torch = native.torch
    state = SimpleNamespace(original=None, noise=None, timesteps=None)
    scheduler = _reference_scheduler(
        native, name, lower_policy=lower_policy, prediction=prediction, rescale=rescale
    )
    pipeline_type = (
        native.diffusers.StableDiffusionXLPipeline
        if mode == "txt"
        else _reference_image_class(native, state)
    )
    pipeline = _new_pipeline(native, pipeline_type, scheduler)
    conditioning = native.conditioning
    events: list[tuple[int, int]] = []
    guidance = _upstream_guidance(torch)() if mode == "out" else None
    keep = torch.frombuffer(bytearray(_mask().tobytes()), dtype=torch.uint8)
    generate_mask = 1 - keep.reshape(1, 1, 8, 8).float() / 255

    def reference_callback(
        current: Any, index: int, _timestep: Any, payload: dict[str, Any]
    ) -> dict[str, Any]:
        timesteps = current.scheduler.timesteps if mode == "txt" else state.timesteps
        events.append((index + 1, len(timesteps)))
        if guidance is not None:
            if index + 1 == len(timesteps):
                payload["latents"] = torch.where(
                    generate_mask > 0, payload["latents"], state.original
                )
            else:
                # Execute the pinned external PRE_STEP mask body with the fresh
                # scheduler's already-advanced state, including SDE midpoints.
                guidance.mask = generate_mask
                guidance.mask_latents = state.original
                guidance.noise = state.noise
                guidance.scheduler = current.scheduler
                guidance.is_gradient_mask = True
                payload["latents"] = guidance.apply_mask(
                    payload["latents"], timesteps[index + 1]
                )
        return payload

    mode_options: dict[str, Any] = (
        {"width": 64, "height": 64}
        if mode == "txt"
        else {"image": native.source.copy(), "strength": strength}
    )

    def call() -> Any:
        return pipeline(
            prompt_embeds=conditioning.positive,
            negative_prompt_embeds=conditioning.negative,
            pooled_prompt_embeds=conditioning.positive_pooled,
            negative_pooled_prompt_embeds=conditioning.negative_pooled,
            **mode_options,
            original_size=(1024, 1024),
            target_size=(1024, 1024),
            negative_original_size=(1024, 1024),
            negative_target_size=(1024, 1024),
            crops_coords_top_left=(0, 0),
            negative_crops_coords_top_left=(0, 0),
            num_inference_steps=4,
            num_images_per_prompt=1,
            guidance_scale=cfg_scale,
            guidance_rescale=0,
            generator=torch.Generator(device="cpu").manual_seed(0),
            callback_on_step_end=reference_callback,
            callback_on_step_end_tensor_inputs=["latents"],
        )

    image, predictions, decoded = _observe_native_call(native, call)
    return image, predictions, decoded, events


@pytest.mark.parametrize("name", _SCHEDULERS)
@pytest.mark.parametrize("case", _CASES)
def test_production_selected_dpm_loop_matches_independent_native_pixels_and_history(
    native: Any, tmp_path: Path, name: str, case: str
) -> None:
    """Real selector -> native pipeline -> actual worker callback -> decoded pixels."""
    torch = native.torch
    mode = case.split("-")[0]
    neighbor = case.endswith("neighbor")
    strength: float | None = None
    if mode != "txt":
        strength = (0.05 if name.startswith("dpmpp_sde") else 0.5) if neighbor else 0.75
    # Equal conditioning lengths isolate samplers from attention-padding policy.
    native.conditioning = replace(native.conditioning, negative_length=4)
    source_bytes = native.source.tobytes()
    expected, expected_predictions, expected_decoded, expected_events = _reference_run(
        native, name, mode, strength
    )
    lower, _predictions, lower_decoded, _events = _reference_run(
        native, name, mode, strength, lower_policy=True
    )
    assert torch.equal(expected_decoded[0], lower_decoded[0]) == neighbor
    if neighbor:
        assert expected.tobytes() == lower.tobytes()

    command = replace(
        illustrious_command(tmp_path),
        scheduler=cast(Any, name),
        steps=4,
        seed=0,
        prediction_type="epsilon",
        noise_profile=IllustriousNoiseProfile(False, "leading"),
    )
    pipeline = (
        _new_pipeline(
            native, native.diffusers.StableDiffusionXLPipeline, _reference_scheduler(native, name)
        )
        if mode == "txt"
        else native.pipeline
    )
    pipeline.scheduler = select_inference_scheduler(
        command, pipeline, MLRuntime(torch, native.diffusers, ModuleType("unused_compel"))
    )
    events: list[tuple[int, int]] = []

    def report_progress(step: int, total: int) -> None:
        events.append((step, total))

    options: dict[str, Any] = {
        "width": 64,
        "height": 64,
        "steps": 4,
        "cfg_scale": 5,
        "generator": torch.Generator(device="cpu").manual_seed(0),
        "torch": torch,
        "on_progress": report_progress,
    }
    if mode != "txt":
        options.update(image=native.source, denoising_strength=strength)

    def call() -> Any:
        if mode == "out":
            return run_sdxl_outpaint_pipeline(
                pipeline, native.conditioning, keep_mask=_mask(), **options
            )
        return run_sdxl_pipeline(pipeline, native.conditioning, **options)

    actual, predictions, decoded = _observe_native_call(native, call)
    assert torch.isfinite(decoded[0]).all()
    assert torch.equal(decoded[0], expected_decoded[0])
    assert actual.tobytes() == expected.tobytes()
    assert len(predictions) == len(expected_predictions)
    assert all(torch.equal(a, b) for a, b in zip(predictions, expected_predictions, strict=True))
    if name.startswith("dpmpp_sde"):
        total = 7 if mode == "txt" else 1 if neighbor else 5
    else:
        total = 4 if mode == "txt" else 2 if neighbor else 3
    assert events == expected_events == [(index + 1, total) for index in range(total)]
    assert native.source.tobytes() == source_bytes
    assert native.pipeline._igs_outpaint_state is None


@pytest.mark.parametrize("name", ("dpmpp_2m", "dpmpp_2m_k"))
def test_vpred_dpm_txt_matches_native_grid_unet_inputs_and_pixels(
    native: Any, tmp_path: Path, name: str
) -> None:
    """Real V/true-ZTSNR selector and loop; EPS interpretation alone must change pixels.

    Boundary: actual worker selector -> native 2M pipeline -> worker callback ->
    decoded pixels. The independent oracle constructs a separate native scheduler
    and loop. The wrong-interpretation control keeps the same true-ZTSNR/leading
    grid and changes only prediction_type. Existing EPS Normal TXT is the neighbor
    for an actual-selector mutation that forces epsilon only in the 2M branch.
    Tiny 64px model objects qualify numerics, not trained-checkpoint image quality.
    """
    torch = native.torch
    native.conditioning = replace(native.conditioning, negative_length=4)
    source_bytes = native.source.tobytes()
    expected, expected_predictions, expected_decoded, expected_events = _reference_run(
        native, name, "txt", None, prediction="v_prediction", rescale=True, cfg_scale=4
    )
    wrong, _wrong_predictions, wrong_decoded, _wrong_events = _reference_run(
        native, name, "txt", None, prediction="epsilon", rescale=True, cfg_scale=4
    )
    assert torch.isfinite(expected_decoded[0]).all()
    assert torch.isfinite(wrong_decoded[0]).all()
    assert not torch.equal(expected_decoded[0], wrong_decoded[0])
    assert expected.tobytes() != wrong.tobytes()

    reference = _reference_scheduler(native, name, prediction="v_prediction", rescale=True)
    wrong_reference = _reference_scheduler(native, name, prediction="epsilon", rescale=True)
    reference.set_timesteps(4, device="cpu")
    wrong_reference.set_timesteps(4, device="cpu")
    assert torch.equal(reference.sigmas, wrong_reference.sigmas)
    assert torch.equal(reference.timesteps, wrong_reference.timesteps)
    if name == "dpmpp_2m":
        assert reference.timesteps.tolist() == [801, 601, 401, 201]

    command = replace(
        illustrious_command(tmp_path),
        scheduler=cast(Any, name),
        steps=4,
        seed=0,
        prediction_type="v_prediction",
        noise_profile=IllustriousNoiseProfile(True, "leading"),
    )
    # A native EPS/false-ZTSNR loader scheduler cannot override this exact request.
    pipeline = _new_pipeline(
        native, native.diffusers.StableDiffusionXLPipeline, _reference_scheduler(native, name)
    )
    selected = select_inference_scheduler(
        command, pipeline, MLRuntime(torch, native.diffusers, ModuleType("unused_compel"))
    )
    pipeline.scheduler = selected
    selected.set_timesteps(4, device="cpu")
    torch.testing.assert_close(
        selected.alphas_cumprod, independent_alphas(torch, True), rtol=1e-5, atol=1e-7
    )
    assert selected.alphas_cumprod[-1].item() == 2**-24
    assert torch.isfinite(selected.sigmas).all()
    assert torch.equal(selected.sigmas, reference.sigmas)
    assert torch.equal(selected.timesteps, reference.timesteps)
    events: list[tuple[int, int]] = []

    def call() -> Any:
        return run_sdxl_pipeline(
            pipeline,
            native.conditioning,
            width=64,
            height=64,
            steps=4,
            cfg_scale=4,
            generator=torch.Generator(device="cpu").manual_seed(0),
            torch=torch,
            on_progress=lambda step, total: events.append((step, total)),
        )

    actual, predictions, decoded = _observe_native_call(native, call)
    assert torch.isfinite(decoded[0]).all()
    assert torch.equal(decoded[0], expected_decoded[0])
    assert actual.tobytes() == expected.tobytes()
    assert len(predictions) == len(expected_predictions) == 4
    assert all(torch.equal(a, b) for a, b in zip(predictions, expected_predictions, strict=True))
    assert events == expected_events == [(1, 4), (2, 4), (3, 4), (4, 4)]
    assert native.source.tobytes() == source_bytes
    assert native.pipeline._igs_outpaint_state is None


@pytest.mark.parametrize("mode", ("img", "out"))
@pytest.mark.parametrize(
    "name,strength,full_timesteps,active_timesteps,neighbor",
    [
        pytest.param(
            "dpmpp_2m", 0.5, (801, 601, 401, 201), (401, 201), True,
            id="normal-neighbor",
        ),
        pytest.param(
            "dpmpp_2m", 0.75, (801, 601, 401, 201), (601, 401, 201), False,
            id="normal-history",
        ),
        pytest.param(
            "dpmpp_2m_k", 0.9, (999, 994, 892, 0), (892, 0), True,
            id="karras-neighbor",
        ),
        pytest.param(
            "dpmpp_2m_k", 0.995, (999, 994, 892, 0), (994, 892, 0), False,
            id="karras-history",
        ),
    ],
)
def test_vpred_dpm_image_matches_native_grid_history_and_mask(
    native: Any,
    tmp_path: Path,
    name: str,
    strength: float,
    full_timesteps: tuple[int, ...],
    active_timesteps: tuple[int, ...],
    neighbor: bool,
    mode: str,
) -> None:
    """Actual V/true-ZTSNR/leading image loop against fresh native reference.

    Boundary: production selector, img2img preparation, native UNet/VAE and
    worker progress/mask callback. The reference constructs its own scheduler
    and image loop; masked cases run the independently pinned Invoke guidance.
    Frozen N4 grids select two first-order updates for neighbors and three
    updates with a second-order middle step for history-sensitive cases. Karras
    uses .9/.995: its legacy .75 strength selects only one update, not history.

    A semantic mutation that clears scheduler.lower_order_nums in the actual
    progress callback must fail history decoded-latent equality and preserve
    both first-order neighbors. A fresh order-1 native reference independently
    demonstrates that distinction before the worker call. These opaque RGB
    native decoder outputs compare as full RGBA, but publishing contribution
    alpha/merged previews and trained-checkpoint quality belong to other tests.
    """
    torch = native.torch
    native.conditioning = replace(native.conditioning, negative_length=4)
    source_bytes = native.source.tobytes()
    source_rgba = native.source.convert("RGBA").tobytes()
    assert native.source.mode == "RGB" and native.source.size == (64, 64)
    assert set(native.source.convert("RGBA").getchannel("A").tobytes()) == {255}
    keep_mask = _mask()
    mask_bytes = keep_mask.tobytes()
    assert set(mask_bytes) == {0, 128, 255}

    expected, expected_predictions, expected_decoded, expected_events = _reference_run(
        native, name, mode, strength, prediction="v_prediction", rescale=True, cfg_scale=4
    )
    lower, lower_predictions, lower_decoded, lower_events = _reference_run(
        native,
        name,
        mode,
        strength,
        lower_policy=True,
        prediction="v_prediction",
        rescale=True,
        cfg_scale=4,
    )
    assert torch.isfinite(expected_decoded[0]).all()
    assert torch.isfinite(lower_decoded[0]).all()
    assert torch.equal(expected_decoded[0], lower_decoded[0]) == neighbor
    assert len(expected_predictions) == len(lower_predictions) == len(active_timesteps)
    if neighbor:
        assert expected.convert("RGBA").tobytes() == lower.convert("RGBA").tobytes()
        assert all(
            torch.equal(a, b)
            for a, b in zip(expected_predictions, lower_predictions, strict=True)
        )
    else:
        # The first two evaluations precede the second-order history update.
        assert all(
            torch.equal(a, b)
            for a, b in zip(expected_predictions[:2], lower_predictions[:2], strict=True)
        )
        assert not torch.equal(expected_predictions[2], lower_predictions[2])

    reference = _reference_scheduler(native, name, prediction="v_prediction", rescale=True)
    reference.set_timesteps(4, device="cpu")
    assert reference.timesteps.tolist() == list(full_timesteps)
    cutoff = round(1000 * strength)
    begin = len([value for value in full_timesteps if value >= cutoff])
    assert full_timesteps[begin:] == active_timesteps

    command = replace(
        illustrious_command(tmp_path),
        scheduler=cast(Any, name),
        steps=4,
        seed=0,
        prediction_type="v_prediction",
        noise_profile=IllustriousNoiseProfile(True, "leading"),
    )
    pipeline = native.pipeline
    # An EPS/false-ZTSNR loader scheduler must not override the exact request.
    pipeline.scheduler = _reference_scheduler(native, name)
    selected = select_inference_scheduler(
        command, pipeline, MLRuntime(torch, native.diffusers, ModuleType("unused_compel"))
    )
    pipeline.scheduler = selected
    selected.set_timesteps(4, device="cpu")
    torch.testing.assert_close(
        selected.alphas_cumprod, independent_alphas(torch, True), rtol=1e-5, atol=1e-7
    )
    assert selected.alphas_cumprod[-1].item() == 2**-24
    assert torch.isfinite(selected.sigmas).all()
    assert torch.equal(selected.sigmas, reference.sigmas)
    assert torch.equal(selected.timesteps, reference.timesteps)
    events: list[tuple[int, int]] = []
    observed_timesteps: list[Any] = []

    def report_progress(step: int, total: int) -> None:
        events.append((step, total))

    options: dict[str, Any] = {
        "width": 64,
        "height": 64,
        "steps": 4,
        "cfg_scale": 4,
        "generator": torch.Generator(device="cpu").manual_seed(0),
        "torch": torch,
        "on_progress": report_progress,
        "image": native.source,
        "denoising_strength": strength,
    }

    def call() -> Any:
        if mode == "out":
            return run_sdxl_outpaint_pipeline(
                pipeline, native.conditioning, keep_mask=keep_mask, **options
            )
        return run_sdxl_pipeline(pipeline, native.conditioning, **options)

    actual, predictions, decoded = _observe_native_call(
        native, call, timesteps=observed_timesteps
    )
    assert torch.isfinite(decoded[0]).all()
    assert torch.equal(decoded[0], expected_decoded[0])
    assert actual.convert("RGBA").tobytes() == expected.convert("RGBA").tobytes()
    assert len(predictions) == len(expected_predictions) == len(active_timesteps)
    assert all(torch.equal(a, b) for a, b in zip(predictions, expected_predictions, strict=True))
    assert [value.item() for value in observed_timesteps] == list(active_timesteps)
    assert selected.begin_index == begin
    assert selected.step_index == len(full_timesteps)
    assert torch.equal(selected.sigmas, reference.sigmas)
    assert torch.equal(selected.timesteps, reference.timesteps)
    total = len(active_timesteps)
    assert events == expected_events == lower_events == [
        (index + 1, total) for index in range(total)
    ]
    assert native.source.tobytes() == source_bytes
    assert native.source.convert("RGBA").tobytes() == source_rgba
    assert keep_mask.tobytes() == mask_bytes
    assert pipeline._igs_outpaint_state is None
