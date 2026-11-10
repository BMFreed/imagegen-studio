"""Private original-Anima Smart modes with independently owned signed regions.

InvokeAI 4875d96531ca6712b288f6e660fcbb34143408c1 grafts the selected mode's
source/KEEP before adding regional conditioning to that same job denoiser
(frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts).
backend/anima/regional_prompting.py normalizes the clipped world mask and resizes
NEAREST directly to the actual processing image-token grid. KEEP is neither a
regional mask nor an intersection/fade applied to one.

The same Invoke revision's graph.ts/addRegionalGuidance.ts reuse the ordered
LoRA-bearing encoder edges for global and regional conditioning; Anima denoise
holds LayerPatcher through its denoiser. The original Studio LoRA sampling scope
already covers both encoders and denoising. Explicit additive profiles admit
that existing scope without broadening the original no-LoRA profiles.

This complete-input frontend is not a worker command, admission capability,
queue payload or provenance record. Main owns capture/planner/resource lineage;
the existing Smart owner verifies exact files, loads the native CUDA models and
publishes processing RGB. World contribution remains Main's existing owner.
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, cast

from imagegen_worker.anima_euler import AnimaEulerResult, validate_anima_number
from imagegen_worker.anima_regional import (
    _LORA_RNG_OWNER,  # pyright: ignore[reportPrivateUsage]
    _MODEL_OWNERS,  # pyright: ignore[reportPrivateUsage]
    _capture_regional_recipe,  # pyright: ignore[reportPrivateUsage]
    _Input,  # pyright: ignore[reportPrivateUsage]
    _integer,  # pyright: ignore[reportPrivateUsage]
    _model_profile,  # pyright: ignore[reportPrivateUsage]
    _object,  # pyright: ignore[reportPrivateUsage]
    _owned_tokenizers,  # pyright: ignore[reportPrivateUsage]
    _prediction_factory,  # pyright: ignore[reportPrivateUsage]
    _preflight_prompt_weights,  # pyright: ignore[reportPrivateUsage]
    _prepare_mask,  # pyright: ignore[reportPrivateUsage]
    _prepare_negative_mask,  # pyright: ignore[reportPrivateUsage]
    _Profile,  # pyright: ignore[reportPrivateUsage]
    _require,  # pyright: ignore[reportPrivateUsage]
    _reserve,  # pyright: ignore[reportPrivateUsage]
    _uuid,  # pyright: ignore[reportPrivateUsage]
    _vae_cache_scope,  # pyright: ignore[reportPrivateUsage]
)
from imagegen_worker.anima_tokenizers import AnimaTokenizers
from imagegen_worker.anima_worker import anima_prompt_payload, anima_sampling_payload
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.inference_anima import LoadedAnimaModels
from imagegen_worker.protocol import (
    AnimaInferenceParameters,
    ExecuteSmartPatchCommand,
    parse_request,
)
from imagegen_worker.smart_patch_denoising import (
    SmartPatchDenoisingInput,
    _capture_inputs,  # pyright: ignore[reportPrivateUsage]
    run_smart_patch_anima,
)

if TYPE_CHECKING:
    from imagegen_worker.inference import DenoisingProgressSink, MLRuntime

_PROFILE = "invoke-anima-smart-regional-inpaint-v1"
_OUTPAINT_PROFILE = "invoke-anima-smart-regional-outpaint-v1"
_TXT2IMG_PROFILE = "invoke-anima-smart-regional-txt2img-v1"
_IMG2IMG_PROFILE = "invoke-anima-smart-regional-img2img-v1"
_LORA_PROFILE = "invoke-anima-smart-regional-lora-inpaint-v1"
_LORA_OUTPAINT_PROFILE = "invoke-anima-smart-regional-lora-outpaint-v1"
_LORA_TXT2IMG_PROFILE = "invoke-anima-smart-regional-lora-txt2img-v1"
_LORA_IMG2IMG_PROFILE = "invoke-anima-smart-regional-lora-img2img-v1"
_LORA_PROFILES = frozenset(
    {_LORA_PROFILE, _LORA_OUTPAINT_PROFILE, _LORA_TXT2IMG_PROFILE, _LORA_IMG2IMG_PROFILE}
)
_MODE_BY_PROFILE = {
    _PROFILE: "inpaint",
    _OUTPAINT_PROFILE: "outpaint",
    _TXT2IMG_PROFILE: "txt2img",
    _IMG2IMG_PROFILE: "img2img",
    _LORA_PROFILE: "inpaint",
    _LORA_OUTPAINT_PROFILE: "outpaint",
    _LORA_TXT2IMG_PROFILE: "txt2img",
    _LORA_IMG2IMG_PROFILE: "img2img",
}
_RECIPE_FIELDS = frozenset(
    {"layerId", "internalResolution", "smartMask", "modelSha256", "sampling"}
)
_MAX_EXECUTION_BYTES = 64 * 1024


@dataclass(frozen=True)
class CapturedAnimaSmartPatchRegionalInput:
    """Only immutable policy/signed records and owned alpha survive input capture."""

    command: ExecuteSmartPatchCommand
    regional: _Input
    policy: AnimaInferenceParameters
    document_id: str
    document_revision: str
    layer_id: str
    smart_mask_id: str
    smart_mask_revision: int
    processing_size: tuple[int, int]
    execution_profile: str = _PROFILE


def capture_anima_smart_patch_regional_input(value: object) -> CapturedAnimaSmartPatchRegionalInput:
    """Validate the whole Main handoff before model/resource/image callbacks."""
    data = _object(
        value,
        {"schemaVersion", "profile", "recipe", "compiledPrompts", "execution"},
        {"promptInterpretation"},
    )
    if "promptInterpretation" in data:
        _require(
            type(data["promptInterpretation"]) is str
            and data["promptInterpretation"] == "invoke-fragments-v1",
            "INVALID_REQUEST",
            "Anima Smart regional prompt interpretation is unsupported.",
        )
    _require(
        type(data["schemaVersion"]) is int
        and data["schemaVersion"] == 1
        and type(data["profile"]) is str
        and data["profile"] in _MODE_BY_PROFILE,
        "INVALID_REQUEST",
        "Anima Smart regional input requires an explicit supported mode profile.",
    )
    execution_profile = cast(str, data["profile"])
    recipe = _object(
        data["recipe"],
        {
            "kind",
            "family",
            "documentId",
            "documentRevision",
            "bbox",
            "item",
            "globalPrompts",
            "regions",
        }
        | _RECIPE_FIELDS,
    )
    layer_id = _uuid(recipe["layerId"])
    document_id = _uuid(recipe["documentId"])
    document_revision = _uuid(recipe["documentRevision"])
    smart_mask = _object(recipe["smartMask"], {"maskId", "maskRevision"})
    mask_id = _uuid(smart_mask["maskId"])
    mask_revision = _integer(smart_mask["maskRevision"], 0, 2**53 - 1)
    _require(
        len({layer_id, mask_id, document_id}) == 3,
        "INVALID_REQUEST",
        "Smart Patch, mask and document owner IDs collide.",
    )
    resolution = _object(recipe["internalResolution"], {"width", "height"})
    width = _integer(resolution["width"], 64, 512)
    height = _integer(resolution["height"], 64, 512)
    _require(
        width % 8 == 0 and height % 8 == 0,
        "INVALID_REQUEST",
        "Anima Smart processing dimensions must be bounded multiples of eight.",
    )
    model_sha = recipe["modelSha256"]
    _require(
        type(model_sha) is str and re.fullmatch(r"[0-9a-f]{64}", model_sha) is not None,
        "INVALID_REQUEST",
        "Anima Smart regional model identity is invalid.",
    )
    sampling = _object(
        recipe["sampling"], {"animaMethod", "steps", "cfgScale", "denoisingStrength"}
    )
    method = sampling["animaMethod"]
    _require(
        type(method) is str and method in ("euler", "heun"),
        "INVALID_REQUEST",
        "Private Anima Smart regions require Euler or Heun.",
    )
    steps = _integer(sampling["steps"], 1, 200)
    cfg = validate_anima_number(sampling["cfgScale"], 1, 30)
    strength = validate_anima_number(sampling["denoisingStrength"], 0, 1)
    regional = _capture_regional_recipe(
        recipe,
        data["compiledPrompts"],
        negative_profile="invoke-anima-regional-negative-v1",
        recipe_kind="smart-patch-regional-recipe",
        global_source_id=layer_id,
        inherited_source="smart-patch",
        extra_fields=_RECIPE_FIELDS,
        reserved_owner_ids=(document_id, layer_id, mask_id),
    )
    execution = _object(
        data["execution"],
        {
            "type",
            "requestId",
            "protocolVersion",
            "schemaVersion",
            "family",
            "mode",
            "internalResolution",
            "modelSource",
            "latentKeepMask",
            "inference",
            "output",
        },
    )
    # Parse the original request directly; do not synthesize a second policy DTO.
    parsed = parse_request(execution)
    _require(
        type(parsed) is ExecuteSmartPatchCommand,
        "INVALID_REQUEST",
        "Anima Smart regional execution requires the original Smart request.",
    )
    command = cast(ExecuteSmartPatchCommand, parsed)
    _require(
        command.family == "anima"
        and command.mode == _MODE_BY_PROFILE[execution_profile]
        and type(command.inference) is AnimaInferenceParameters
        and (command.width, command.height) == (width, height)
        and command.denoising_strength is None,
        "INVALID_REQUEST",
        "Anima Smart regional execution differs from its family, profile mode or processing size.",
    )
    policy = cast(AnimaInferenceParameters, command.inference)
    plan = policy.sampling
    sampling_mode = "txt2img" if command.mode == "txt2img" else "img2img"
    sampling_strength = None if command.mode == "txt2img" else strength
    _require(
        policy.bundle.checkpoint.sha256 == model_sha
        and (plan.width, plan.height, plan.seed) == (width, height, regional.seed)
        and plan.mode == sampling_mode
        and plan.scheduler == method
        and plan.steps == steps
        and plan.guidance_scale == cfg
        and plan.strength == sampling_strength
        and policy.positive_prompt == regional.prompts[0].compiled
        and policy.negative_prompt == regional.prompts[1].compiled,
        "INVALID_REQUEST",
        "Anima Smart execution model, concrete prompts, seed or sampling differ from its recipe.",
    )
    _require(
        type(policy.loras) is tuple and bool(policy.loras) == (execution_profile in _LORA_PROFILES),
        "GENERATION_PROMPT_UNSUPPORTED",
        "Anima Smart regional LoRAs require the exact nonempty-stack mode profile.",
    )
    # Keep the old private command ceiling, independently of the larger in-memory
    # world alpha planes. No new field enters its JSONL or durable manifest.
    try:
        execution_bytes = (
            len(
                json.dumps(
                    execution, ensure_ascii=False, separators=(",", ":"), allow_nan=False
                ).encode("utf-8")
            )
            + 1
        )
    except (TypeError, ValueError, UnicodeError) as error:
        raise DerivativeError(
            "INVALID_REQUEST", "Anima Smart execution is not valid JSON."
        ) from error
    _require(
        execution_bytes <= _MAX_EXECUTION_BYTES,
        "INVALID_REQUEST",
        "The original private Smart execution request exceeds 64 KiB.",
    )
    return CapturedAnimaSmartPatchRegionalInput(
        command=command,
        regional=regional,
        policy=policy,
        document_id=document_id,
        document_revision=document_revision,
        layer_id=layer_id,
        smart_mask_id=mask_id,
        smart_mask_revision=mask_revision,
        processing_size=(width, height),
        execution_profile=execution_profile,
    )


def _require_captured_command(
    captured: object, command: ExecuteSmartPatchCommand
) -> CapturedAnimaSmartPatchRegionalInput:
    """The private hook cannot attach one captured job to another command."""
    _require(
        type(captured) is CapturedAnimaSmartPatchRegionalInput,
        "INVALID_REQUEST",
        "Anima Smart regional execution requires its owned complete input.",
    )
    owned = cast(CapturedAnimaSmartPatchRegionalInput, captured)
    _require(
        owned.command is command
        and type(command) is ExecuteSmartPatchCommand
        and command.family == "anima"
        and type(owned.execution_profile) is str
        and owned.execution_profile in _MODE_BY_PROFILE
        and command.mode == _MODE_BY_PROFILE[owned.execution_profile]
        and type(command.inference) is AnimaInferenceParameters
        and owned.policy is command.inference
        and type(owned.regional) is _Input
        and len(owned.regional.prompts) >= 2
        and (command.width, command.height) == owned.processing_size,
        "INVALID_REQUEST",
        "Anima Smart regional input does not own this original execution command.",
    )
    policy = owned.policy
    if command.mode != "txt2img":
        validate_anima_number(policy.sampling.strength, 0, 1)
    _require(
        type(policy.loras) is tuple
        and bool(policy.loras) == (owned.execution_profile in _LORA_PROFILES)
        and policy.sampling.mode == ("txt2img" if command.mode == "txt2img" else "img2img")
        and (command.mode != "txt2img" or policy.sampling.strength is None)
        and policy.sampling.scheduler in ("euler", "heun")
        and (policy.sampling.width, policy.sampling.height) == owned.processing_size
        and policy.sampling.seed == owned.regional.seed
        and policy.positive_prompt == cast(Any, owned.regional.prompts)[0].compiled
        and policy.negative_prompt == cast(Any, owned.regional.prompts)[1].compiled,
        "INVALID_REQUEST",
        "Anima Smart regional captured policy or globals changed.",
    )
    return owned


def execute_anima_smart_patch_regional(
    value: object,
    *,
    config_dir: Path,
    runtime: MLRuntime,
    on_progress: DenoisingProgressSink | None = None,
) -> dict[str, object]:
    """Load/publish through the unchanged ordinary CUDA resource/file owners."""
    captured = capture_anima_smart_patch_regional_input(value)
    from imagegen_worker.smart_patch_execution import execute_smart_patch

    return execute_smart_patch(
        captured.command,
        config_dir=config_dir,
        runtime=runtime,
        on_progress=on_progress,
        _anima_regional=captured,
    )


def run_prepared_anima_smart_patch_regional(
    captured: CapturedAnimaSmartPatchRegionalInput,
    models: LoadedAnimaModels,
    inputs: SmartPatchDenoisingInput,
    *,
    runtime: MLRuntime,
    profile: _Profile,
    tokenizers: AnimaTokenizers | None = None,
    progress: DenoisingProgressSink | None = None,
) -> AnimaEulerResult:
    """Borrow one native graph and reuse the original Smart KEEP/solver owner.

    Decoded source/KEEP association belongs to capture_smart_patch_execution;
    they are detached again before the first model/tokenizer/progress callback.
    The complete-input frontend accepts no independent masks, policy or factory.
    """
    _require(
        type(captured) is CapturedAnimaSmartPatchRegionalInput,
        "INVALID_REQUEST",
        "Anima Smart regional execution requires its owned complete input.",
    )
    owned = _require_captured_command(captured, captured.command)
    _require(
        progress is None or callable(progress),
        "INVALID_REQUEST",
        "Anima Smart regional progress requires a callable sink.",
    )
    prepared = _capture_inputs(inputs)
    _require(
        prepared.mode == owned.command.mode
        and (prepared.width, prepared.height) == owned.processing_size,
        "INVALID_REQUEST",
        "Anima Smart prepared source/KEEP differ from the frozen execution mode or size.",
    )
    _require(
        type(models) is LoadedAnimaModels,
        "INFERENCE_UNAVAILABLE",
        "Prepared original Anima models are required.",
    )
    policy = cast(AnimaInferenceParameters, owned.command.inference)
    with _reserve(
        (
            models.transformer,
            models.text_conditioner,
            models.qwen3_encoder,
            models.vae,
            *((_LORA_RNG_OWNER,) if policy.loras else ()),
        ),
        _MODEL_OWNERS,
    ):
        torch, attentions = _model_profile(models, runtime, profile)
        parameter = next(models.transformer.parameters())
        positive_mask = _prepare_mask(
            owned.regional,
            attentions,
            torch,
            parameter.device,
            parameter.dtype,
            processing_size=owned.processing_size,
        )
        negative_mask = (
            _prepare_negative_mask(
                owned.regional,
                attentions,
                torch,
                parameter.device,
                parameter.dtype,
                processing_size=owned.processing_size,
            )
            if not math.isclose(policy.sampling.guidance_scale, 1.0)
            else None
        )
        with _vae_cache_scope(models.vae):
            owned_tokenizers = _owned_tokenizers(tokenizers)
            _preflight_prompt_weights(
                owned.regional,
                owned_tokenizers,
                torch,
                parameter.dtype,
                global_source_id=owned.layer_id,
            )
            factory = (
                None
                if positive_mask is None and negative_mask is None
                else _prediction_factory(
                    owned.regional,
                    models,
                    owned_tokenizers,
                    positive_mask,
                    attentions if policy.loras else None,
                    **cast(Any, {} if negative_mask is None else {"negative_mask": negative_mask}),
                )
            )
            result = run_smart_patch_anima(
                anima_sampling_payload(policy.sampling),
                anima_prompt_payload(policy.positive_prompt),
                anima_prompt_payload(policy.negative_prompt),
                models,
                prepared,
                loras=policy.loras,
                tokenizers=owned_tokenizers,
                progress=progress,
                **cast(Any, {} if factory is None else {"prediction_factory": factory}),
            )
    _require(
        result.total_steps == policy.sampling.total_steps,
        "GENERATION_WORKER_FAILED",
        "Anima Smart regional execution count differs from its original plan.",
    )
    return result
