"""Original Anima's actual worker handoff, with request-owned native models."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

from imagegen_worker.anima_conditioning import COMPILED_PROMPT_VERSION, CompiledAnimaPrompt
from imagegen_worker.anima_flow_sampling import (
    PLAN_VERSION,
    AnimaFlowSamplingPlan,
    generate_anima_flow_sampling,
)
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.generation_artifacts import (
    publish_generation_image,
    validate_generation_target,
)
from imagegen_worker.inference_anima import load_anima_models
from imagegen_worker.protocol import (
    GenerateAnimaImg2ImgCommand,
    GenerateAnimaOutpaintCommand,
    GenerateAnimaTxt2ImgCommand,
)

if TYPE_CHECKING:
    from imagegen_worker.inference import DenoisingProgressSink, MLRuntime


def anima_prompt_payload(prompt: CompiledAnimaPrompt) -> dict[str, object]:
    return {
        "version": COMPILED_PROMPT_VERSION,
        "cleanedText": prompt.cleaned_text,
        "spans": [
            {"start": span.start, "end": span.end, "weight": span.weight} for span in prompt.spans
        ],
    }


def anima_sampling_payload(plan: AnimaFlowSamplingPlan) -> dict[str, object]:
    """Fresh canonical native policy shared by normal and prepared execution."""
    return {
        "version": PLAN_VERSION,
        "scheduler": plan.scheduler,
        "mode": plan.mode,
        "width": plan.width,
        "height": plan.height,
        "steps": plan.steps,
        "seed": plan.seed,
        "stepSeed": plan.step_seed,
        "guidanceScale": plan.guidance_scale,
        "strength": plan.strength,
        "posteriorSeed": plan.posterior_seed,
        "startStep": plan.start_step,
        "totalSteps": plan.total_steps,
        "sigmas": list(plan.sigmas),
        "beginIndex": plan.begin_index,
        "timesteps": list(plan.timesteps),
        "initialSigma": plan.initial_sigma,
    }


def supports_anima_compute(runtime: MLRuntime) -> bool:
    """A failed optional BF16 probe withholds Anima without removing Illustrious."""
    try:
        return bool(cast(Any, runtime.torch).cuda.is_bf16_supported(including_emulation=False))
    except Exception:
        return False


def generate_anima(
    command: GenerateAnimaTxt2ImgCommand,
    *,
    runtime: MLRuntime,
    on_progress: DenoisingProgressSink | None = None,
) -> dict[str, object]:
    """Execute exact captured input and publish only finite, complete provisional pixels.

    Loaded models are local to this request. No process model/scheduler cache is
    retained after success or failure; the serial owner collects returned frames.
    """
    alpha_conditioning = None
    if isinstance(command, GenerateAnimaOutpaintCommand):
        from imagegen_worker.outpaint_worker_assets import prepare_worker_outpaint

        alpha_conditioning, source = prepare_worker_outpaint(command)
    else:
        source = validate_generation_target(
            staging_root=command.staging_root,
            target_path=command.target_path,
            output_path=command.output_path,
            target_sha256=command.target_sha256,
            target_byte_size=command.target_byte_size,
            width=command.width,
            height=command.height,
            img2img=isinstance(command, GenerateAnimaImg2ImgCommand),
        )
    torch = cast(Any, runtime.torch)
    if not supports_anima_compute(runtime):
        raise DerivativeError("INFERENCE_UNAVAILABLE", "Anima requires native CUDA BF16 compute.")
    models = load_anima_models(command.bundle, device="cuda", dtype=torch.bfloat16)
    plan = command.sampling
    # The parser captured immutable native-policy values. Build a fresh canonical
    # helper envelope; Python never interprets the authored attention syntax.
    sampling = anima_sampling_payload(plan)
    if alpha_conditioning is not None:
        from imagegen_worker.anima_outpaint import generate_anima_outpaint

        result = generate_anima_outpaint(
            sampling,
            anima_prompt_payload(command.positive_prompt),
            anima_prompt_payload(command.negative_prompt),
            models,
            source_image=source,
            keep_mask=alpha_conditioning.latent_keep_mask,
            loras=command.loras,
            progress=on_progress,
        )
    else:
        result = generate_anima_flow_sampling(
            sampling,
            anima_prompt_payload(command.positive_prompt),
            anima_prompt_payload(command.negative_prompt),
            models,
            source_image=source,
            loras=command.loras,
            progress=on_progress,
        )
    if result.total_steps != plan.total_steps:
        raise DerivativeError("GENERATION_WORKER_FAILED", "Anima execution count differs.")
    output_image = result.image
    if alpha_conditioning is not None:
        from imagegen_worker.outpaint_conditioning import create_outpaint_contribution

        output_image = create_outpaint_contribution(output_image, alpha_conditioning)
    return publish_generation_image(
        output_image,
        staging_root=command.staging_root,
        output_path=command.output_path,
        width=command.width,
        height=command.height,
        request_id=command.request_id,
        seed=plan.seed,
        output_mode="RGBA" if alpha_conditioning is not None else "RGB",
    )
