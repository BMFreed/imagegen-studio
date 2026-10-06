"""Internal masked Illustrious execution through the pinned native img2img loop.

The old Invoke AddsMaskGuidance uses a generation mask, opposite to the captured
alpha keep mask. Its pre-step merge runs here at the preceding native callback,
before both model-input scaling and the scheduler's next evaluation. No public
worker capability, publisher or alternate conditioning path is introduced.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, cast

from PIL import Image

from imagegen_worker.compositor import MAX_TARGET_PIXELS, MAX_TARGET_SIDE
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.inference import (
    DenoisingProgressSink,
    SdxlConditioning,
    img2img_pipeline_class,
    run_sdxl_pipeline,
)
from imagegen_worker.protocol import (
    MAX_GENERATION_CFG_RESCALE,
    MAX_GENERATION_CFG_SCALE,
    MAX_GENERATION_STEPS,
)


@dataclass
class _OutpaintState:
    """One call's copied mask, selected schedule, source and single noise draw."""

    torch: Any
    keep_mask: Image.Image
    width: int
    height: int
    timesteps: Any = None
    original: Any = None
    noise: Any = None
    generate_mask: Any = None
    completed: int = 0

    def check_latents(self, value: Any) -> None:
        if (
            not isinstance(value, self.torch.Tensor)
            or tuple(value.shape) != (1, 4, self.height // 8, self.width // 8)
            or not value.is_floating_point()
            or not bool(self.torch.isfinite(value).all().item())
            or (
                self.original is not None
                and (value.dtype != self.original.dtype or value.device != self.original.device)
            )
        ):
            raise DerivativeError("GENERATION_WORKER_FAILED", "Invalid outpaint latent input.")

    def step(
        self, pipeline: Any, index: int, timestep: Any, payload: dict[str, Any]
    ) -> dict[str, Any]:
        if (
            self.original is None
            or self.noise is None
            or self.timesteps is None
            or index != self.completed
            or not 0 <= index < len(self.timesteps)
            or not self.torch.equal(timestep, self.timesteps[index])
            or "latents" not in payload
        ):
            raise DerivativeError("GENERATION_WORKER_FAILED", "Outpaint callback is incomplete.")
        latents = payload["latents"]
        self.check_latents(latents)
        if index + 1 == len(self.timesteps):
            # Restore only fully protected latents; soft coherence pixels remain generated.
            merged = self.torch.where(self.generate_mask > 0, latents, self.original)
        else:
            next_timestep = self.timesteps[index + 1]
            # The actual solver has advanced its state. Its public add_noise selects
            # the next sigma, including the source algorithm's SDE midpoint semantics.
            protected = pipeline.scheduler.add_noise(
                self.original, self.noise, next_timestep.reshape(1)
            )
            self.check_latents(protected)
            threshold = next_timestep.item() / pipeline.scheduler.config.num_train_timesteps
            merged = self.torch.where(self.generate_mask > threshold, latents, protected)
        self.completed += 1
        return {**payload, "latents": merged}


def outpaint_pipeline_class(diffusers: Any, torch: Any) -> Any:
    """Retain native VAE/scheduler behavior while capturing one call's latent inputs."""
    base = img2img_pipeline_class(diffusers, torch)

    class MaskedIllustriousPipeline(base):
        _igs_supports_outpaint = True
        _igs_outpaint_state: _OutpaintState | None = None

        def get_timesteps(
            self,
            num_inference_steps: int,
            strength: float,
            device: Any,
            denoising_start: float | None = None,
        ) -> tuple[Any, int]:
            parent: Any = super()
            timesteps, effective = parent.get_timesteps(
                num_inference_steps, strength, device, denoising_start
            )
            state = self._igs_outpaint_state
            if state is not None:
                if state.timesteps is not None:
                    raise DerivativeError(
                        "GENERATION_WORKER_FAILED", "Outpaint schedule was initialized twice."
                    )
                state.timesteps = timesteps.detach().clone()
            return timesteps, effective

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
            state = self._igs_outpaint_state
            parent: Any = super()
            if state is None:
                return parent.prepare_latents(
                    image,
                    timestep,
                    batch_size,
                    num_images_per_prompt,
                    dtype,
                    device,
                    generator,
                    add_noise,
                )
            if state.original is not None or batch_size != 1 or num_images_per_prompt != 1:
                raise DerivativeError("GENERATION_WORKER_FAILED", "Outpaint requires one image.")
            if add_noise is not True:
                raise DerivativeError(
                    "GENERATION_WORKER_FAILED", "Outpaint requires initial noise."
                )
            # Parent's empty-timestep path encodes with an independent copy of the
            # frozen CPU generator and does not advance the initial noise stream.
            encoded: Any = parent.prepare_latents(
                image,
                timestep[:0],
                batch_size,
                num_images_per_prompt,
                dtype,
                device,
                generator,
                add_noise,
            )
            state.check_latents(encoded)
            state.original = encoded.detach().clone()
            keep = torch.frombuffer(bytearray(state.keep_mask.tobytes()), dtype=torch.uint8)
            keep = (
                keep.reshape(1, 1, state.height // 8, state.width // 8).to(dtype=torch.float32)
                / 255
            )
            # Match the default old pipeline's polarity and floating-point ordering.
            state.generate_mask = (1 - keep).to(device=encoded.device, dtype=encoded.dtype)
            if len(timestep) == 0:
                return encoded
            state.noise = torch.randn(
                encoded.shape, generator=generator, device="cpu", dtype=dtype
            ).to(device)
            state.check_latents(state.noise)
            return self.scheduler.add_noise(encoded, state.noise, timestep)

    return MaskedIllustriousPipeline


def _bounded_number(value: object, minimum: float, maximum: float) -> bool:
    if type(value) not in (int, float):
        return False
    numeric = cast(float, value)
    return math.isfinite(numeric) and minimum <= numeric <= maximum


def run_sdxl_outpaint_pipeline(
    pipeline: Any,
    conditioning: SdxlConditioning,
    *,
    keep_mask: object,
    width: int,
    height: int,
    steps: int,
    cfg_scale: float,
    generator: Any,
    torch: Any,
    image: object,
    denoising_strength: float,
    on_progress: DenoisingProgressSink | None = None,
    cfg_rescale: float = 0.0,
) -> Any:
    """Denoise supplied LaMa RGB with an owned alpha-derived latent keep mask.

    The caller owns checkpoint/resources, finite VAE hooks and final contribution
    alpha. This function owns only one native call and clears all capture state
    after success, failure or cancellation; it never publishes or edits source.
    """
    if (
        type(width) is not int
        or type(height) is not int
        or not 8 <= width <= MAX_TARGET_SIDE
        or not 8 <= height <= MAX_TARGET_SIDE
        or width % 8
        or height % 8
        or width * height > MAX_TARGET_PIXELS
        or not isinstance(image, Image.Image)
        or image.mode != "RGB"
        or image.size != (width, height)
        or not isinstance(keep_mask, Image.Image)
        or keep_mask.mode != "L"
        or keep_mask.size != (width // 8, height // 8)
        or type(steps) is not int
        or not 1 <= steps <= MAX_GENERATION_STEPS
        or not _bounded_number(cfg_scale, 1, MAX_GENERATION_CFG_SCALE)
        or not _bounded_number(cfg_rescale, 0, MAX_GENERATION_CFG_RESCALE)
        or not _bounded_number(denoising_strength, 0, 1)
        or getattr(pipeline, "_igs_supports_outpaint", None) is not True
        or pipeline.vae_scale_factor != 8
        or pipeline.unet.config.in_channels != 4
    ):
        raise DerivativeError("INVALID_REQUEST", "Invalid masked Illustrious input.")
    if getattr(pipeline, "_igs_outpaint_state", None) is not None:
        raise DerivativeError("GENERATION_WORKER_FAILED", "Outpaint call is already active.")
    state = _OutpaintState(torch, keep_mask.copy(), width, height)
    pipeline._igs_outpaint_state = state
    try:
        result = run_sdxl_pipeline(
            pipeline,
            conditioning,
            width=width,
            height=height,
            steps=steps,
            cfg_scale=cfg_scale,
            generator=generator,
            torch=torch,
            on_progress=on_progress,
            cfg_rescale=cfg_rescale,
            image=image.copy(),
            denoising_strength=denoising_strength,
            on_denoising_step=state.step,
        )
        if (
            state.original is None
            or state.timesteps is None
            or state.completed != len(state.timesteps)
        ):
            raise DerivativeError("GENERATION_WORKER_FAILED", "Outpaint schedule did not finish.")
        return result
    finally:
        pipeline._igs_outpaint_state = None
