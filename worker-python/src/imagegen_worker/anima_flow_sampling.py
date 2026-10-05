"""Captured six-method Anima flow plans with independent step randomness."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import asdict, dataclass
from typing import cast

from PIL import Image

from imagegen_worker.anima_euler import AnimaEulerResult, execute_captured_anima_plan
from imagegen_worker.anima_sampling import (
    AnimaSamplingPlan,
    capture_anima_sampling_base,
    capture_anima_sampling_schedule,
    create_anima_native_denoiser,
)
from imagegen_worker.anima_tokenizers import AnimaTokenizers
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.inference_anima import LoadedAnimaModels
from imagegen_worker.protocol import GenerationLora

PLAN_VERSION = "anima-flow-denoising-v1"
_FIELDS = {
    "version",
    "scheduler",
    "mode",
    "width",
    "height",
    "steps",
    "seed",
    "stepSeed",
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
_SCHEDULERS = ("euler", "heun", "dpmpp_2m", "dpmpp_2m_sde", "er_sde", "lcm")


@dataclass(frozen=True)
class AnimaFlowSamplingPlan(AnimaSamplingPlan):
    step_seed: int


def validate_anima_flow_sampling_plan(value: object) -> AnimaFlowSamplingPlan:
    """Capture the exact TS envelope before optional imports or model work."""
    if type(value) is not dict:
        raise DerivativeError("INVALID_REQUEST", "Anima requires a versioned flow sampling plan.")
    data = dict(cast(dict[str, object], value))
    if (
        set(data) != _FIELDS
        or data.get("version") != PLAN_VERSION
        or type(data.get("scheduler")) is not str
        or data["scheduler"] not in _SCHEDULERS
        or type(data.get("stepSeed")) is not int
        or type(data.get("seed")) is not int
        or data["stepSeed"] != data["seed"]
    ):
        raise DerivativeError(
            "INVALID_REQUEST", "Anima flow fields, version, scheduler or step seed are invalid."
        )
    base = capture_anima_sampling_base(data)
    captured = capture_anima_sampling_schedule(data, base)
    return AnimaFlowSamplingPlan(**asdict(captured), step_seed=cast(int, data["stepSeed"]))


def generate_anima_flow_sampling(
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
    """Internal flow pixels; no public command, output path or admission."""
    captured = validate_anima_flow_sampling_plan(plan)
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
            else lambda torch, device: create_anima_native_denoiser(
                captured, torch, device, step_seed=captured.step_seed
            )
        ),
    )
