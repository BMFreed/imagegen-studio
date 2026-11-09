"""Owned-file public Smart handoff to the existing signed Anima owner.

InvokeAI 4875d96531ca6712b288f6e660fcbb34143408c1 grafts each image source before
joining Regional Guidance to that same denoiser; TXT needs no source graft
(invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts).
Native Anima background
positive support and image-wide global negatives remain in the qualified private
consumer; this transport does not select the Current Canvas Krea2 profile.

Main's existing Smart processor owns every staged file until consumption and
physical inference/CPU exit. This reader snapshots bounded metadata/raw alpha,
then delegates original resource loading, source/KEEP decoding and exclusive RGB
publication. It never removes inputs or invents another queue or native loop.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, cast

from imagegen_worker import PROTOCOL_VERSION
from imagegen_worker.anima_regional import _rect  # pyright: ignore[reportPrivateUsage]
from imagegen_worker.anima_smart_patch_regional import (
    CapturedAnimaSmartPatchRegionalInput,
    capture_anima_smart_patch_regional_input,
)
from imagegen_worker.anima_worker import supports_anima_compute
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.illustrious_regional_worker import (
    _MAX_BUNDLE_BYTES,  # pyright: ignore[reportPrivateUsage]
    _descriptor,  # pyright: ignore[reportPrivateUsage]
    _json_snapshot,  # pyright: ignore[reportPrivateUsage]
    _object,  # pyright: ignore[reportPrivateUsage]
    _owned_root,  # pyright: ignore[reportPrivateUsage]
    _RawSnapshots,  # pyright: ignore[reportPrivateUsage]
    _snapshot,  # pyright: ignore[reportPrivateUsage]
)
from imagegen_worker.inference_anima import ANIMA_BASE_ARCHITECTURE
from imagegen_worker.protocol import (
    _REQUEST_ID_PATTERN,  # pyright: ignore[reportPrivateUsage]
    AnimaInferenceParameters,
    ExecuteSmartPatchCommand,
    parse_request,
)
from imagegen_worker.smart_patch_execution import (
    _paths,  # pyright: ignore[reportPrivateUsage]
    _resource_entries,  # pyright: ignore[reportPrivateUsage]
    execute_smart_patch,
)
from imagegen_worker.smart_patch_preparation import MAX_PREPARATION_PNG_BYTES

if TYPE_CHECKING:
    from imagegen_worker.inference import DenoisingProgressSink, MLRuntime

ANIMA_SMART_PATCH_REGIONAL_CAPABILITY = "anima-smart-patch-regional-inpaint-v1"
ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_CAPABILITY = "anima-smart-patch-regional-outpaint-v1"
ANIMA_SMART_PATCH_REGIONAL_TXT2IMG_CAPABILITY = "anima-smart-patch-regional-txt2img-v1"
ANIMA_SMART_PATCH_REGIONAL_IMG2IMG_CAPABILITY = "anima-smart-patch-regional-img2img-v1"
PROMPT_INTERPRETATION = "invoke-fragments-v1"


@dataclass(frozen=True, slots=True)
class AnimaSmartPatchRegionalRequest:
    captured: CapturedAnimaSmartPatchRegionalInput
    report_progress: bool = False


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise DerivativeError("INVALID_REQUEST", message)


def parse_anima_smart_patch_regional_request(value: object) -> AnimaSmartPatchRegionalRequest:
    """Own a whole signed Smart input before any model/resource callback.

    The syntax-only inner-command read reserves source/KEEP/output paths before
    alpha hydration. Execution always uses the command returned by complete-input
    capture, together with that exact captured owner; no outer command is supplied.
    """
    envelope = _object(
        value,
        {"type", "protocolVersion", "requestId", "stagingRoot", "bundle"}
        | ({"reportProgress"} if type(value) is dict and "reportProgress" in value else set()),
        "Anima Smart regional request",
    )
    request_id = envelope["requestId"]
    _require(
        type(envelope["type"]) is str
        and envelope["type"] == "execute-anima-smart-patch-regional"
        and type(envelope["protocolVersion"]) is str
        and envelope["protocolVersion"] == PROTOCOL_VERSION
        and type(request_id) is str
        and _REQUEST_ID_PATTERN.fullmatch(request_id) is not None,
        "Anima Smart regional request identity/version is invalid.",
    )
    if "reportProgress" in envelope:
        _require(
            envelope["reportProgress"] is True,
            "Anima Smart regional reportProgress must be true when present.",
        )
    root = _owned_root(envelope["stagingRoot"])
    bundle_descriptor = _descriptor(envelope["bundle"], root, _MAX_BUNDLE_BYTES)
    bundle = _object(
        _json_snapshot(_snapshot(bundle_descriptor)),
        {
            "schemaVersion",
            "profile",
            "promptInterpretation",
            "recipe",
            "compiledPrompts",
            "execution",
        },
        "Anima Smart regional bundle",
    )
    _require(
        type(bundle["promptInterpretation"]) is str
        and bundle["promptInterpretation"] == PROMPT_INTERPRETATION,
        "Public Anima Smart regional input requires its frozen prompt interpretation.",
    )
    syntax = parse_request(bundle["execution"])
    _require(
        type(syntax) is ExecuteSmartPatchCommand,
        "Anima Smart regions require the original Smart execution command.",
    )
    command = cast(ExecuteSmartPatchCommand, syntax)
    _require(
        command.family == "anima"
        and command.mode in ("txt2img", "img2img", "inpaint", "outpaint")
        and type(command.inference) is AnimaInferenceParameters
        and command.request_id == request_id
        and command.staging_root == root,
        "Anima Smart regional command identity/staging differs from its transport.",
    )
    policy = cast(AnimaInferenceParameters, command.inference)
    files = {
        "checkpoint": policy.bundle.checkpoint,
        "qwen3_encoder": policy.bundle.qwen3_encoder,
        "vae": policy.bundle.vae,
    }
    for role, identity in (ANIMA_BASE_ARCHITECTURE.companion_identities or {}).items():
        file = files[role]
        _require(
            (file.sha256, file.byte_size) == identity,
            "Public Anima Smart regions require the exact pinned Qwen3 and VAE companions.",
        )
    resources = _resource_entries(command.inference)
    _paths(command, resources)
    reserved = {bundle_descriptor[0], command.output_path}
    for image in (command.model_source, command.latent_keep_mask):
        if image is not None:
            descriptor = _descriptor(
                {"path": str(image.path), "byteSize": image.byte_size, "sha256": image.sha256},
                root,
                MAX_PREPARATION_PNG_BYTES,
            )
            _require(
                descriptor[0] not in reserved,
                "Anima Smart bundle, source, KEEP and output must be distinct.",
            )
            reserved.add(descriptor[0])
    _require(
        type(bundle["recipe"]) is dict,
        "Anima Smart regional recipe must be an exact object.",
    )
    recipe = cast(dict[str, Any], bundle["recipe"]).copy()
    _x, _y, width, height = _rect(recipe.get("bbox"))
    regions = recipe.get("regions")
    _require(
        type(regions) is list and len(regions) <= 3,
        "Anima Smart regional recipe admits at most three regions.",
    )
    snapshots = _RawSnapshots(root, reserved)
    hydrated: list[dict[str, Any]] = []
    for index, region_value in enumerate(cast(list[object], regions)):
        _require(type(region_value) is dict, "Anima Smart regional stream must be an exact object.")
        region = cast(dict[str, Any], region_value).copy()
        coverage = _object(
            region.get("coverage"), {"alpha", "bounds", "intersection", "kind"}, "World coverage"
        ).copy()
        alpha = _object(coverage["alpha"], {"$alpha8"}, "Smart regional alpha transport")
        raw = _object(alpha["$alpha8"], {"path", "byteSize", "sha256"}, "Smart regional alpha")
        _require(
            raw["path"] == str(root / f"regional-{index}.alpha8"),
            "Anima Smart regional alpha must retain its exact ordered file role.",
        )
        coverage["alpha"] = snapshots.alpha(coverage["alpha"], width * height)
        region["coverage"] = coverage
        hydrated.append(region)
    recipe["regions"] = hydrated
    captured = capture_anima_smart_patch_regional_input({**bundle, "recipe": recipe})
    _require(
        captured.command.request_id == request_id
        and captured.command.staging_root == root
        and captured.command.mode == command.mode
        and captured.execution_profile == bundle["profile"],
        "Captured Anima Smart execution differs from its transport identity.",
    )
    item = cast(dict[str, Any], recipe["item"])
    _require(
        item["iteration"] == 0 and item["promptPairIndex"] == 0,
        "Public Anima Smart regional input requires one static concrete item.",
    )
    return AnimaSmartPatchRegionalRequest(captured, envelope.get("reportProgress") is True)


def execute_anima_smart_patch_regional_request(
    value: object,
    *,
    config_dir: Path,
    runtime: MLRuntime,
    on_progress: DenoisingProgressSink | None = None,
) -> dict[str, object]:
    """Use the existing exact-file CUDA owner and return its original Smart receipt."""
    _require(
        on_progress is None or callable(on_progress),
        "Anima Smart regional progress requires a callable sink.",
    )
    request = parse_anima_smart_patch_regional_request(value)
    _require(
        not request.report_progress or on_progress is not None,
        "Requested Anima Smart regional progress requires an available sink.",
    )
    if not supports_anima_compute(runtime):
        raise DerivativeError("INFERENCE_UNAVAILABLE", "Anima requires native CUDA BF16 compute.")
    torch = cast(Any, runtime.torch)
    with torch.no_grad():
        return execute_smart_patch(
            request.captured.command,
            config_dir=config_dir,
            runtime=runtime,
            on_progress=on_progress if request.report_progress else None,
            _anima_regional=request.captured,
        )
