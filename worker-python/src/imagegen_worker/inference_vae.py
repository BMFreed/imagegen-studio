"""Pinned SDXL VAE compute precision and finite outputs, without a custom ML loop."""

from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager
from typing import Any, Literal

from imagegen_worker.derivatives import DerivativeError


def configure_vae_precision(
    pipeline: Any, precision: Literal["Auto", "FP16", "FP32"], torch: Any
) -> None:
    """Keep native Auto; control both native encode and decode through public config.

    This pipeline loads in FP16. Pinned Diffusers fully upcasts the VAE only during
    encoding/decoding when force_upcast is true and restores FP16 afterwards.
    Initially casting the VAE to FP32 would leave native FP16 inputs mismatched.
    UNet, CLIP, conditioning, scheduler and generator are intentionally untouched.
    """
    if precision == "Auto":
        return
    if precision not in ("FP16", "FP32"):
        raise DerivativeError("INVALID_REQUEST", "VAE precision is unsupported.")
    pipeline.vae.register_to_config(force_upcast=precision == "FP32")
    if precision == "FP16":
        pipeline.vae.to(dtype=torch.float16)


@contextmanager
def finite_vae_outputs(pipeline: Any, torch: Any) -> Generator[None]:
    """Reject non-finite VAE tensors before native postprocessing hides NaN pixels.

    encode/decode are public VAE methods rather than its forward entry point.
    Hooks on the actual encoder, quantization convolutions and decoder observe
    their tensor outputs while retaining native posterior sampling and decode.
    """

    def check(_module: Any, _args: Any, output: Any) -> None:
        if not bool(torch.isfinite(output).all().item()):
            raise DerivativeError(
                "GENERATION_WORKER_FAILED", "VAE inference produced non-finite values."
            )

    handles: list[Any] = []
    try:
        for module in (
            pipeline.vae.encoder,
            pipeline.vae.quant_conv,
            pipeline.vae.post_quant_conv,
            pipeline.vae.decoder,
        ):
            if module is not None:
                handles.append(module.register_forward_hook(check))
        yield
    finally:
        for handle in handles:
            handle.remove()
