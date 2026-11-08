"""Captured deterministic Anima plans and request-owned native scheduler state."""

from __future__ import annotations

import importlib
import importlib.metadata
import math
import struct
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, cast

from PIL import Image

from imagegen_worker.anima_conditioning import AnimaConditioningPair
from imagegen_worker.anima_euler import (
    AnimaEulerPlan,
    AnimaEulerResult,
    AnimaLatentTransform,
    AnimaPredictor,
    AnimaPredictorDenoiser,
    execute_captured_anima_plan,
    predict_anima_flow,
    require_finite_anima_tensor,
    validate_anima_euler_plan,
    validate_anima_number,
)
from imagegen_worker.anima_tokenizers import AnimaTokenizers
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.inference_anima import LoadedAnimaModels
from imagegen_worker.protocol import GenerationLora

PLAN_VERSION = "anima-deterministic-denoising-v1"
_FIELDS = {
    "version",
    "scheduler",
    "mode",
    "width",
    "height",
    "steps",
    "seed",
    "guidanceScale",
    "strength",
    "posteriorSeed",
    "startStep",
    "totalSteps",
    "sigmas",
    "beginIndex",
    "timesteps",
    "initialSigma",
}


@dataclass(frozen=True)
class AnimaSamplingPlan(AnimaEulerPlan):
    scheduler: str
    begin_index: int
    timesteps: tuple[float, ...]
    initial_sigma: float


def _invalid(message: str) -> DerivativeError:
    return DerivativeError("INVALID_REQUEST", message)


def _f32(value: float) -> float:
    return struct.unpack("<f", struct.pack("<f", value))[0]


def canonical_anima_schedule(
    scheduler: str, base: AnimaEulerPlan
) -> tuple[tuple[float, ...], tuple[float, ...], int]:
    """Validate TS policy without optional imports; native arrays are checked again."""
    if scheduler not in ("euler", "heun", "dpmpp_2m", "dpmpp_2m_sde", "er_sde", "lcm"):
        raise _invalid("Anima scheduler is unsupported.")
    if scheduler == "euler":
        return base.sigmas, tuple(sigma * 1000 for sigma in base.sigmas[:-1]), base.start_step
    if scheduler in ("er_sde", "lcm"):
        flow_sigmas = tuple(_f32(sigma) for sigma in base.sigmas)
        return (
            flow_sigmas,
            tuple(_f32(sigma * 1000) for sigma in flow_sigmas[:-1]),
            base.start_step,
        )
    begin = base.start_step * (2 if scheduler == "heun" else 1)
    if base.total_steps == 0:
        return (0.0,), (), begin
    count = base.steps
    if scheduler == "heun":
        # The pinned constructor computes its minimum with NumPy float32 ops.
        linear_min = _f32(1 / 1000)
        minimum = _f32(_f32(3 * linear_min) / _f32(1 + _f32(2 * linear_min)))
        first, last = 1000.0, minimum * 1000
        step = 0.0 if count == 1 else (last - first) / (count - 1)
        sigmas: list[float] = []
        for index in range(count):
            timestep = last if count > 1 and index == count - 1 else first + index * step
            linear = timestep / 1000
            sigmas.append(_f32(3 * linear / (1 + 2 * linear)))
        full_sigmas = [sigmas[0], *(sigma for sigma in sigmas[1:] for _ in range(2)), 0.0]
        full_times = [_f32(sigma * 1000) for sigma in full_sigmas[:-1]]
    else:
        step = (0.001 - 1) / count
        shifted: list[float] = []
        for index in range(count, 0, -1):
            alpha = 0.001 if index == count else 1 + index * step
            linear = 1 - alpha
            shifted.append(3 * linear / (1 + 2 * linear))
        full_sigmas = [*(_f32(sigma) for sigma in shifted), 0.0]
        # The native solver truncates the float64 product before sigma's f32 cast.
        full_times = [float(int(sigma * 1000)) for sigma in shifted]
    return tuple(full_sigmas[begin:]), tuple(full_times[begin:]), begin


def validate_anima_sampling_plan(value: object) -> AnimaSamplingPlan:
    """Capture the exact finite policy before optional imports or model mutation."""
    if type(value) is not dict:
        raise _invalid("Anima requires a versioned deterministic sampling plan.")
    data = dict(cast(dict[str, object], value))
    scheduler = data.get("scheduler")
    if (
        set(data) != _FIELDS
        or data.get("version") != PLAN_VERSION
        or type(scheduler) is not str
        or scheduler not in ("euler", "heun", "dpmpp_2m")
    ):
        raise _invalid("Anima sampling plan fields, version or scheduler are unsupported.")
    base = capture_anima_sampling_base(data)
    return capture_anima_sampling_schedule(data, base)


def capture_anima_sampling_base(data: dict[str, object]) -> AnimaEulerPlan:
    """Share scalar/seed validation after the caller captures its exact envelope."""
    # Reuse the original scalar/seed/strength envelope, not its Euler trajectory.
    steps = data["steps"]
    strength = data["strength"]
    if type(steps) is not int or not 1 <= steps <= 200:
        raise _invalid("Anima sampling steps are invalid.")
    if data["mode"] == "img2img":
        strength = validate_anima_number(strength, 0, 1)
    elif data["mode"] != "txt2img" or strength is not None:
        raise _invalid("Anima sampling mode or strength is invalid.")
    start = 0 if strength is None else math.floor((1 - strength) * steps)
    euler_sigmas = tuple(
        3 * (1 - index / steps) / (1 + 2 * (1 - index / steps)) for index in range(start, steps + 1)
    )
    return validate_anima_euler_plan(
        {
            key: data[key]
            for key in (
                "mode",
                "width",
                "height",
                "steps",
                "seed",
                "guidanceScale",
                "strength",
                "posteriorSeed",
                "startStep",
            )
        }
        | {
            "version": "anima-euler-denoising-v1",
            "scheduler": "euler",
            "totalSteps": steps - start,
            "sigmas": list(euler_sigmas),
        }
    )


def capture_anima_sampling_schedule(
    data: dict[str, object], base: AnimaEulerPlan
) -> AnimaSamplingPlan:
    """Verify immutable schedule fields under the caller's finite version policy."""
    scheduler = cast(str, data["scheduler"])
    sigmas, timesteps, begin = canonical_anima_schedule(scheduler, base)
    initial = (
        0.0 if not timesteps else 1.0 if base.mode == "txt2img" or base.strength == 1 else sigmas[0]
    )
    if (
        type(data["beginIndex"]) is not int
        or data["beginIndex"] != begin
        or type(data["totalSteps"]) is not int
        or data["totalSteps"] != len(timesteps)
        or validate_anima_number(data["initialSigma"], 0, 1) != initial
    ):
        raise _invalid(
            "Anima sampling clipping, evaluation count or initial sigma is inconsistent."
        )
    for key, expected, maximum in (("sigmas", sigmas, 1), ("timesteps", timesteps, 1000)):
        raw = data[key]
        if not isinstance(raw, list) or len(cast(list[object], raw)) != len(expected):
            raise _invalid("Anima sampling schedule length is inconsistent.")
        actual = tuple(validate_anima_number(item, 0, maximum) for item in cast(list[object], raw))
        if actual != expected:
            raise _invalid("Anima requires the canonical selected scheduler schedule.")
    return AnimaSamplingPlan(
        base.mode,
        base.width,
        base.height,
        base.steps,
        base.seed,
        base.guidance_scale,
        base.strength,
        base.posterior_seed,
        base.start_step,
        len(timesteps),
        sigmas,
        scheduler,
        begin,
        timesteps,
        initial,
    )


def create_anima_native_denoiser(
    plan: AnimaSamplingPlan, torch: Any, device: Any, *, step_seed: int | None = None
) -> AnimaPredictorDenoiser:
    if importlib.metadata.version("diffusers") != "0.40.0":
        raise DerivativeError("INFERENCE_UNAVAILABLE", "Pinned Anima scheduler runtime differs.")
    diffusers = cast(Any, importlib.import_module("diffusers"))
    if plan.scheduler == "heun":
        scheduler = diffusers.FlowMatchHeunDiscreteScheduler(num_train_timesteps=1000, shift=3.0)
    elif plan.scheduler in ("dpmpp_2m", "dpmpp_2m_sde"):
        scheduler = diffusers.DPMSolverMultistepScheduler(
            num_train_timesteps=1000,
            prediction_type="flow_prediction",
            use_flow_sigmas=True,
            flow_shift=3.0,
            solver_order=2,
            algorithm_type=(
                "sde-dpmsolver++" if plan.scheduler == "dpmpp_2m_sde" else "dpmsolver++"
            ),
            solver_type="midpoint",
            lower_order_final=True,
            final_sigmas_type="zero",
        )
    elif plan.scheduler == "er_sde":
        er_module = cast(Any, importlib.import_module("imagegen_worker.vendor.er_sde_scheduler"))
        scheduler = er_module.ERSDEScheduler(
            num_train_timesteps=1000,
            prediction_type="flow_prediction",
            use_flow_sigmas=True,
            flow_shift=3.0,
            solver_order=3,
            stochastic=True,
        )
    elif plan.scheduler == "lcm":
        scheduler = diffusers.FlowMatchLCMScheduler(num_train_timesteps=1000, shift=1.0)
    else:
        raise _invalid("Anima native scheduler is unsupported.")
    if plan.scheduler in ("er_sde", "lcm"):
        # Both consume the authored once-shifted grid. ER expects terminal zero;
        # Flow LCM appends it itself. Public setup/begin-index preserve native history.
        full_sigmas = [
            3 * (1 - index / plan.steps) / (1 + 2 * (1 - index / plan.steps))
            for index in range(plan.steps + 1)
        ]
        scheduler.set_timesteps(
            sigmas=full_sigmas if plan.scheduler == "er_sde" else full_sigmas[:-1], device=device
        )
    else:
        scheduler.set_timesteps(num_inference_steps=plan.steps, device=device)
    scheduler.set_begin_index(plan.begin_index)
    actual_times = tuple(scheduler.timesteps[plan.begin_index :].detach().cpu().tolist())
    actual_sigmas = tuple(scheduler.sigmas[plan.begin_index :].detach().cpu().tolist())
    if actual_times != plan.timesteps or actual_sigmas != plan.sigmas:
        raise DerivativeError("INFERENCE_UNAVAILABLE", "Native Anima scheduler arrays differ.")
    generator = torch.Generator(device=device).manual_seed(
        plan.seed if step_seed is None else step_seed
    )

    def denoise(
        transformer: Any,
        latents: Any,
        pair: AnimaConditioningPair,
        dtype: Any,
        progress: Callable[[int, int], None] | None,
        latent_transform: AnimaLatentTransform | None = None,
        *,
        predictor: AnimaPredictor | None = None,
    ) -> Any:
        for index in range(plan.total_steps):
            timestep = scheduler.timesteps[plan.begin_index + index]
            in_first_order = scheduler.state_in_first_order if plan.scheduler == "heun" else True
            sigma = timestep.item() / 1000
            conditional = (
                predict_anima_flow(transformer, latents, pair.positive.embeddings, sigma, torch)
                if predictor is None
                else predictor("positive", latents, sigma)
            )
            if not math.isclose(plan.guidance_scale, 1.0):
                unconditional = (
                    predict_anima_flow(transformer, latents, pair.negative.embeddings, sigma, torch)
                    if predictor is None
                    else predictor("negative", latents, sigma)
                )
                flow = unconditional + plan.guidance_scale * (conditional - unconditional)
            else:
                flow = conditional
            require_finite_anima_tensor(flow, torch, "guided flow")
            updated = scheduler.step(
                model_output=flow,
                timestep=timestep,
                sample=latents,
                generator=generator,
            ).prev_sample
            if tuple(updated.shape) != tuple(latents.shape):
                raise DerivativeError("GENERATION_WORKER_FAILED", "Anima scheduler shape differs.")
            require_finite_anima_tensor(updated, torch, "native scheduler latent")
            latents = updated.to(dtype=dtype)
            require_finite_anima_tensor(latents, torch, "native scheduler cast latent")
            if latent_transform is not None:
                following = plan.sigmas[index + 1]
                completes = plan.scheduler != "heun" or not in_first_order or following == 0
                latents = latent_transform(latents, following, completes)
            if progress is not None:
                progress(index + 1, plan.total_steps)
        return latents

    return denoise


def generate_anima_sampling(
    plan: object,
    positive: object,
    negative: object,
    models: LoadedAnimaModels,
    *,
    source_image: Image.Image | None = None,
    loras: tuple[GenerationLora, ...] = (),
    tokenizers: AnimaTokenizers | None = None,
    progress: Callable[[int, int], None] | None = None,
) -> AnimaEulerResult:
    """Internal deterministic pixels; no command, output path or public admission."""
    captured = validate_anima_sampling_plan(plan)
    return execute_captured_anima_plan(
        captured,
        positive,
        negative,
        models,
        source_image=source_image,
        loras=loras,
        tokenizers=tokenizers,
        progress=progress,
        initial_sigma=captured.initial_sigma,
        denoiser_factory=(
            None
            if captured.scheduler == "euler"
            else lambda torch, device: create_anima_native_denoiser(captured, torch, device)
        ),
    )
