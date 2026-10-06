"""Internal Anima normal-outpaint masking adapted from pinned InvokeAI sources.

The existing six-method loop owns native solvers, conditioning and seeded noise.
This request-local collaborator only restores the source's protected trajectory.
See the packaged vendor NOTICE and Apache license for upstream attribution.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from PIL import Image

from imagegen_worker.anima_euler import (
    AnimaEulerResult,
    execute_captured_anima_plan,
    require_finite_anima_tensor,
)
from imagegen_worker.anima_flow_sampling import validate_anima_flow_sampling_plan
from imagegen_worker.anima_sampling import create_anima_native_denoiser
from imagegen_worker.anima_tokenizers import AnimaTokenizers
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.inference_anima import LoadedAnimaModels
from imagegen_worker.protocol import GenerationLora


@dataclass(frozen=True)
class _AnimaOutpaintState:
    torch: Any
    original: Any
    noise: Any
    generate_mask: Any

    def merge(self, candidate: Any, following: float, completes: bool) -> Any:
        if (
            not self.torch.is_tensor(candidate)
            or tuple(candidate.shape) != tuple(self.original.shape)
            or candidate.dtype != self.original.dtype
            or candidate.device != self.original.device
        ):
            raise DerivativeError("GENERATION_WORKER_FAILED", "Anima masked latent differs.")
        require_finite_anima_tensor(candidate, self.torch, "masked candidate")
        if not completes:
            return candidate
        # The threshold uses linear time; the protected trajectory uses shifted
        # sigma. Preserve the upstream scalar comparison and multiplication order.
        linear = following / (3.0 - 2.0 * following)
        mask = self.torch.where(self.generate_mask >= linear + 1e-4, 1.0, 0.0).to(
            dtype=self.generate_mask.dtype, device=self.generate_mask.device
        )
        noised_original = self.noise * following + (1.0 - following) * self.original
        merged = candidate * mask + noised_original * (1.0 - mask)
        require_finite_anima_tensor(merged, self.torch, "masked restored latent")
        return merged


def generate_anima_outpaint(
    plan: object,
    positive: object,
    negative: object,
    models: LoadedAnimaModels,
    *,
    source_image: object,
    keep_mask: object,
    loras: tuple[GenerationLora, ...] = (),
    tokenizers: AnimaTokenizers | None = None,
    progress: Callable[[int, int], None] | None = None,
) -> AnimaEulerResult:
    """Return internal RGB pixels; no command, queue, publication or capability."""
    captured = validate_anima_flow_sampling_plan(plan)
    if (
        captured.mode != "img2img"
        or not isinstance(source_image, Image.Image)
        or source_image.mode != "RGB"
        or source_image.size != (captured.width, captured.height)
        or source_image.info.get("icc_profile") not in (None, SRGB_ICC_PROFILE)
        or not isinstance(keep_mask, Image.Image)
        or keep_mask.mode != "L"
        or keep_mask.size != (captured.width // 8, captured.height // 8)
    ):
        raise DerivativeError("INVALID_REQUEST", "Anima outpaint source or keep mask is invalid.")
    source, mask_image = source_image.copy(), keep_mask.copy()

    def make_transform(torch: Any, original: Any, noise: Any) -> Callable[[Any, float, bool], Any]:
        keep = torch.frombuffer(bytearray(mask_image.tobytes()), dtype=torch.uint8)
        keep = keep.reshape(1, 1, 1, captured.height // 8, captured.width // 8).float() / 255
        state = _AnimaOutpaintState(
            torch,
            original.detach().clone(),
            noise.detach().clone(),
            (1.0 - keep).to(device=original.device, dtype=original.dtype),
        )
        return state.merge

    return execute_captured_anima_plan(
        captured,
        positive,
        negative,
        models,
        source_image=source,
        loras=loras,
        tokenizers=tokenizers,
        progress=progress,
        initial_sigma=captured.initial_sigma,
        latent_transform_factory=make_transform,
        denoiser_factory=(
            None
            if captured.scheduler == "euler"
            else lambda torch, device: create_anima_native_denoiser(
                captured, torch, device, step_seed=captured.step_seed
            )
        ),
    )
