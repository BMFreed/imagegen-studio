"""Private selected-Smart Illustrious regions over the existing native owners.

InvokeAI 4875d96531ca6712b288f6e660fcbb34143408c1 joins regional conditioning
after the mode/source graft (frontend generation/core/canvas/compileCanvasGraph.ts,
called by workbench/widgets/canvas/invoke/prepareCanvasInvocation.ts).
app/invocations/sd/denoise_latents.py normalizes and nearest-resizes regional
alpha independently of the denoise mask; regional_prompt_data.py supplies the
subsequent max-pool attention pyramid. This adapter retains those mechanisms.

The complete private input binds the original Smart command, selected settings,
owned world masks and processing grid before any model/resource callback. It
does not add a public worker command, capability, queue row or provenance field.
Source/KEEP decoding and exclusive RGB publication remain Smart owners; dual
CLIP, conditioning, attention, scheduler and VAE remain regional owners.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, cast

from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.illustrious_regional_attention import Everywhere
from imagegen_worker.illustrious_regional_attention_adapter import TransformerBinding
from imagegen_worker.illustrious_regional_denoising import (
    _DenoisingProfile,  # pyright: ignore[reportPrivateUsage]
    run_current_canvas_regional_denoising,
)
from imagegen_worker.illustrious_regional_geometry import (
    smart_patch_world_coverage_to_processing,
)
from imagegen_worker.illustrious_regional_output import (
    _rgb_image,  # pyright: ignore[reportPrivateUsage]
)
from imagegen_worker.illustrious_regional_recipe import (
    _coverage,  # pyright: ignore[reportPrivateUsage]
    _identity,  # pyright: ignore[reportPrivateUsage]
    _integer,  # pyright: ignore[reportPrivateUsage]
    _Profile,  # pyright: ignore[reportPrivateUsage]
    _recipe_inputs,  # pyright: ignore[reportPrivateUsage]
    _record,  # pyright: ignore[reportPrivateUsage]
    _rect,  # pyright: ignore[reportPrivateUsage]
)
from imagegen_worker.illustrious_regional_worker import qualify_bindings
from imagegen_worker.inference import DenoisingProgressSink, MLRuntime
from imagegen_worker.protocol import (
    ExecuteSmartPatchCommand,
    IllustriousInferenceParameters,
    IllustriousNoiseProfile,
    parse_request,
)
from imagegen_worker.smart_patch_denoising import (
    SmartPatchDenoisingInput,
    _capture_inputs,  # pyright: ignore[reportPrivateUsage]
)

_TensorProfile = Literal["cpu-float32-v1", "cuda-float16-v1"]
_MODE_BY_PROFILE = {
    f"invoke-illustrious-smart-regional-{mode}-v1": mode
    for mode in ("txt2img", "img2img", "inpaint", "outpaint")
}
_SMART_FIELDS = {"layerId", "internalResolution", "smartMask", "modelSha256", "sampling"}


@dataclass(frozen=True)
class CapturedIllustriousSmartPatchRegionalInput:
    """No mutable caller recipe or alpha survives the complete-input capture."""

    command: ExecuteSmartPatchCommand
    policy: IllustriousInferenceParameters
    recipe_json: str
    world_alpha: tuple[bytes, ...]
    layer_id: str
    execution_profile: str
    processing_size: tuple[int, int]


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise DerivativeError("INVALID_REQUEST", message)


def _number(value: object, minimum: float, maximum: float) -> float:
    _require(
        type(value) in (int, float)
        and math.isfinite(cast(float, value))
        and minimum <= cast(float, value) <= maximum,
        "Illustrious Smart sampling requires a bounded finite numeric value.",
    )
    return float(cast(float, value))


def _policy(policy: IllustriousInferenceParameters) -> None:
    _require(
        type(policy) is IllustriousInferenceParameters
        and policy.prediction_type == "epsilon"
        and policy.scheduler == "euler"
        and policy.cfg_rescale == 0
        and type(policy.cfg_rescale) in (int, float)
        and 1 < _number(policy.cfg_scale, 1, 30) <= 30
        and policy.vae is None
        and policy.vae_precision == "Auto"
        and type(policy.loras) is tuple
        and not policy.loras
        and type(policy.positive_embeddings) is tuple
        and not policy.positive_embeddings
        and type(policy.negative_embeddings) is tuple
        and not policy.negative_embeddings
        and type(policy.noise_profile) is IllustriousNoiseProfile
        and policy.noise_profile
        == IllustriousNoiseProfile(rescale_betas_zero_snr=False, timestep_spacing="leading"),
        "Private Illustrious Smart regions require Euler/Normal epsilon, CFG (1,30], "
        "zero rescale, embedded Auto VAE and no LoRA or TI.",
    )


def _world_recipe(captured: CapturedIllustriousSmartPatchRegionalInput) -> dict[str, Any]:
    recipe = cast(dict[str, Any], json.loads(captured.recipe_json))
    for region, alpha in zip(recipe["regions"], captured.world_alpha, strict=True):
        region["coverage"]["alpha"] = alpha
    return recipe


def _numerical_recipe(recipe: dict[str, Any], processing_size: tuple[int, int]) -> dict[str, Any]:
    """Adapt geometry into the core ABI, retaining the actual Smart kind/source.

    The original world metadata remains in the immutable capture. Core coverage
    describes the derived processing plane only; its full-frame intersection is
    a bound on already-clipped pixels, never a new authoring mask.
    """
    bbox = _rect(recipe["bbox"])
    _require(
        abs(bbox.x) <= 2_147_483_647
        and abs(bbox.y) <= 2_147_483_647
        and bbox.width <= 2048
        and bbox.height <= 2048
        and bbox.width * bbox.height <= 4_000_000,
        "Illustrious Smart world dimensions exceed their existing bounds.",
    )
    width, height = processing_size
    processing_bbox = {"x": 0, "y": 0, "width": width, "height": height}
    regions: list[dict[str, Any]] = []
    for region in recipe["regions"]:
        coverage = _coverage(region["coverage"], bbox, _integer(region["maskRevision"]))
        alpha = smart_patch_world_coverage_to_processing(
            alpha=coverage.alpha, bbox=cast(Any, bbox.mapping()), processing_size=processing_size
        )
        has_intersection = coverage.intersection is not None
        regions.append(
            {
                **region,
                "coverage": {
                    "alpha": alpha,
                    "bounds": processing_bbox.copy(),
                    "intersection": processing_bbox.copy() if has_intersection else None,
                    "kind": ("covered" if any(alpha) else "intersecting-empty")
                    if has_intersection
                    else coverage.kind,
                },
                "embeddings": {"positive": [], "negative": []},
            }
        )
    return {
        **{key: value for key, value in recipe.items() if key not in _SMART_FIELDS},
        "bbox": processing_bbox,
        "regions": regions,
        "globalEmbeddings": {"positive": [], "negative": []},
    }


def capture_illustrious_smart_patch_regional_input(
    value: object,
) -> CapturedIllustriousSmartPatchRegionalInput:
    """Validate and own the complete private Main handoff before native work."""
    data = _record(value, {"schemaVersion", "profile", "recipe", "execution"})
    _require(
        type(data["schemaVersion"]) is int
        and data["schemaVersion"] == 1
        and type(data["profile"]) is str
        and data["profile"] in _MODE_BY_PROFILE,
        "Illustrious Smart regions require an explicit supported profile/version.",
    )
    recipe = _record(
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
        | _SMART_FIELDS,
    )
    owned: set[str] = set()
    _identity(recipe["documentId"], owned)
    _identity(recipe["documentRevision"])
    layer_id = _identity(recipe["layerId"], owned)
    smart_mask = _record(recipe["smartMask"], {"maskId", "maskRevision"})
    _identity(smart_mask["maskId"], owned)
    _integer(smart_mask["maskRevision"])
    resolution = _record(recipe["internalResolution"], {"width", "height"})
    width, height = (_integer(resolution[key], 64, 512) for key in ("width", "height"))
    _require(width % 8 == 0 and height % 8 == 0, "Smart processing sides must divide by eight.")
    regions = recipe["regions"]
    _require(
        type(regions) is list and len(regions) <= 3, "Smart regions admit at most three owners."
    )
    alpha_planes: list[bytes] = []
    metadata_regions: list[dict[str, Any]] = []
    for entry in regions:
        region = _record(
            entry,
            {"coverage", "maskId", "maskRevision", "negative", "positive", "regionId"},
            frozenset({"authoredPrompts", "referenceImages"}),
        )
        _identity(region["regionId"], owned)
        _identity(region["maskId"], owned)
        _integer(region["maskRevision"])
        coverage = _record(region["coverage"], {"alpha", "bounds", "intersection", "kind"})
        _require(type(coverage["alpha"]) is bytes, "Smart world alpha must be immutable bytes.")
        alpha_planes.append(cast(bytes, coverage["alpha"]))
        metadata_regions.append({**region, "coverage": {**coverage, "alpha": None}})
    try:
        recipe_json = json.dumps(
            {**recipe, "regions": metadata_regions},
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        )
        execution_json = json.dumps(
            data["execution"],
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        )
        _require(
            len(execution_json.encode("utf-8")) + 1 <= 64 * 1024,
            "The original private Smart command exceeds 64 KiB.",
        )
        recipe_json.encode("utf-8", errors="strict")
    except (TypeError, ValueError, UnicodeError) as error:
        raise DerivativeError(
            "INVALID_REQUEST", "Smart regional metadata is not valid JSON/UTF-8."
        ) from error
    parsed = parse_request(json.loads(execution_json))
    _require(type(parsed) is ExecuteSmartPatchCommand, "The original Smart command is required.")
    command = cast(ExecuteSmartPatchCommand, parsed)
    _require(
        command.family == "illustrious"
        and type(command.inference) is IllustriousInferenceParameters
        and command.mode == _MODE_BY_PROFILE[data["profile"]]
        and (command.width, command.height) == (width, height),
        "Smart regional command family, mode or processing size differs from its recipe.",
    )
    policy = cast(IllustriousInferenceParameters, command.inference)
    _policy(policy)
    detached = cast(dict[str, Any], json.loads(recipe_json))
    item = _record(detached["item"], {"iteration", "promptPairIndex", "prompts", "seed"})
    _require(
        _integer(item["iteration"]) == _integer(item["promptPairIndex"]) == 0,
        "Private Illustrious Smart regions require one static concrete item.",
    )
    sampling = _record(
        detached["sampling"], {"scheduler", "steps", "cfgScale", "denoisingStrength"}
    )
    strength = _number(sampling["denoisingStrength"], 0, 1)
    _require(
        detached["modelSha256"] == policy.checkpoint_sha256
        and sampling["scheduler"] == "euler"
        and _integer(sampling["steps"], 1, 200) == policy.steps
        and _number(sampling["cfgScale"], 1, 30) == policy.cfg_scale
        and command.denoising_strength == (None if command.mode == "txt2img" else strength),
        "Smart regional model, concrete sampling or effective strength differs from its command.",
    )
    captured = CapturedIllustriousSmartPatchRegionalInput(
        command=command,
        policy=policy,
        recipe_json=recipe_json,
        world_alpha=tuple(alpha_planes),
        layer_id=layer_id,
        execution_profile=data["profile"],
        processing_size=(width, height),
    )
    _recipe_inputs(
        _numerical_recipe(_world_recipe(captured), captured.processing_size),
        policy,
        "ordinary-canvas-invoke-dualclip-exact-ti-shared-readonly-cpu-v1",
        "cfg-negative-first",
        Everywhere(),
        Everywhere(),
        layer_id,
        layer_id,
        smart_patch_source_id=layer_id,
    )
    return captured


def _require_captured_command(
    captured: object, command: ExecuteSmartPatchCommand
) -> CapturedIllustriousSmartPatchRegionalInput:
    """A captured complete input can never attach itself to another Smart job."""
    _require(
        type(captured) is CapturedIllustriousSmartPatchRegionalInput,
        "Illustrious Smart regions require their captured complete input.",
    )
    owned = cast(CapturedIllustriousSmartPatchRegionalInput, captured)
    _require(
        owned.command is command
        and type(command) is ExecuteSmartPatchCommand
        and command.family == "illustrious"
        and owned.policy is command.inference
        and owned.execution_profile in _MODE_BY_PROFILE
        and command.mode == _MODE_BY_PROFILE[owned.execution_profile]
        and (command.width, command.height) == owned.processing_size,
        "Illustrious Smart regions do not own this original command.",
    )
    _policy(owned.policy)
    return owned


def run_prepared_illustrious_smart_patch_regional(
    captured: CapturedIllustriousSmartPatchRegionalInput,
    pipeline: Any,
    inputs: SmartPatchDenoisingInput,
    *,
    runtime: MLRuntime,
    profile: _TensorProfile,
    bindings: tuple[TransformerBinding, ...] | None = None,
    progress: DenoisingProgressSink | None = None,
) -> Any:
    """Use the original regional loop and separately captured Smart source/KEEP.

    The caller supplies already prepared native components and capture hooks,
    under exclusive ownership. The native tiny CPU lane is a qualification seam;
    the existing exact-file CUDA loader remains the execution entry point.
    """
    owned = _require_captured_command(captured, captured.command)
    _require(profile in ("cpu-float32-v1", "cuda-float16-v1"), "Unsupported Smart tensor profile.")
    _require(progress is None or callable(progress), "Smart regional progress must be callable.")
    prepared = _capture_inputs(inputs)
    _require(
        prepared.mode == owned.command.mode
        and (prepared.width, prepared.height) == owned.processing_size,
        "Prepared Smart source/KEEP differs from the original command mode or grid.",
    )
    cuda = profile == "cuda-float16-v1"
    encoding_profile = cast(
        _Profile,
        "ordinary-canvas-invoke-dualclip-exact-ti-shared-readonly-"
        + ("cuda-fp16-v1" if cuda else "cpu-v1"),
    )
    masked = prepared.mode in ("inpaint", "outpaint")
    image_mode = prepared.mode != "txt2img"
    mode = "outpaint" if masked else "img2img" if image_mode else "txt2img"
    denoising_profile = cast(
        _DenoisingProfile,
        f"ordinary-canvas-euler-{mode}-"
        + ("cuda-vae-v1" if cuda else "cpu-v2" if not image_mode else "cpu-v1"),
    )
    result = run_current_canvas_regional_denoising(
        _numerical_recipe(_world_recipe(owned), owned.processing_size),
        pipeline=pipeline,
        runtime=runtime,
        parameters=owned.policy,
        profile=encoding_profile,
        denoising_profile=denoising_profile,
        global_negative_coverage=Everywhere(),
        global_positive_coverage=Everywhere(),
        negative_pooled_source_id=owned.layer_id,
        positive_pooled_source_id=owned.layer_id,
        bindings=qualify_bindings(pipeline, runtime) if bindings is None else bindings,
        layout="cfg-negative-first",
        on_progress=progress,
        image=prepared.model_source,
        denoising_strength=owned.command.denoising_strength,
        keep_mask=prepared.latent_keep_mask if masked else None,
        _smart_patch_source_id=owned.layer_id,
    )
    image = _rgb_image(
        result,
        torch=runtime.torch,
        width=prepared.width,
        height=prepared.height,
        tensor_profile=profile,
        vae_context=(pipeline, owned.policy) if cuda else None,
    )
    result.images = [image]
    return result


def execute_illustrious_smart_patch_regional(
    value: object,
    *,
    config_dir: Path,
    runtime: MLRuntime,
    on_progress: DenoisingProgressSink | None = None,
) -> dict[str, object]:
    """Reuse the original verified exact-file Smart loader and RGB publisher."""
    captured = capture_illustrious_smart_patch_regional_input(value)
    from imagegen_worker.smart_patch_execution import execute_smart_patch

    _require(
        on_progress is None or callable(on_progress), "Smart regional progress must be callable."
    )
    torch = cast(Any, runtime.torch)
    with torch.no_grad():
        return execute_smart_patch(
            captured.command,
            config_dir=config_dir,
            runtime=runtime,
            on_progress=on_progress,
            _illustrious_regional=captured,
        )
