"""Owned-file public Smart handoff to the existing signed Illustrious owner.

InvokeAI 4875d96531ca6712b288f6e660fcbb34143408c1 grafts each image source before
joining Regional Guidance to that same denoiser; TXT needs no source graft
(invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts).
Global signed conditioning and separate latent KEEP remain in the existing
private consumer; this transport does not create a second native policy.

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
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.illustrious_regional_recipe import _rect  # pyright: ignore[reportPrivateUsage]
from imagegen_worker.illustrious_regional_worker import (
    _MAX_BUNDLE_BYTES,  # pyright: ignore[reportPrivateUsage]
    _descriptor,  # pyright: ignore[reportPrivateUsage]
    _json_snapshot,  # pyright: ignore[reportPrivateUsage]
    _object,  # pyright: ignore[reportPrivateUsage]
    _owned_root,  # pyright: ignore[reportPrivateUsage]
    _RawSnapshots,  # pyright: ignore[reportPrivateUsage]
    _snapshot,  # pyright: ignore[reportPrivateUsage]
)
from imagegen_worker.illustrious_smart_patch_regional import (
    CapturedIllustriousSmartPatchRegionalInput,
    capture_illustrious_smart_patch_regional_input,
)
from imagegen_worker.protocol import (
    _REQUEST_ID_PATTERN,  # pyright: ignore[reportPrivateUsage]
    ExecuteSmartPatchCommand,
    IllustriousInferenceParameters,
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

ILLUSTRIOUS_SMART_PATCH_REGIONAL_CAPABILITY = "illustrious-smart-patch-regional-inpaint-v1"
ILLUSTRIOUS_SMART_PATCH_REGIONAL_OUTPAINT_CAPABILITY = (
    "illustrious-smart-patch-regional-outpaint-v1"
)
ILLUSTRIOUS_SMART_PATCH_REGIONAL_TXT2IMG_CAPABILITY = "illustrious-smart-patch-regional-txt2img-v1"
ILLUSTRIOUS_SMART_PATCH_REGIONAL_IMG2IMG_CAPABILITY = "illustrious-smart-patch-regional-img2img-v1"


@dataclass(frozen=True, slots=True)
class IllustriousSmartPatchRegionalRequest:
    captured: CapturedIllustriousSmartPatchRegionalInput
    report_progress: bool = False


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise DerivativeError("INVALID_REQUEST", message)


def parse_illustrious_smart_patch_regional_request(
    value: object,
) -> IllustriousSmartPatchRegionalRequest:
    """Own a whole signed Smart input before any model/resource callback.

    The syntax-only inner-command read reserves source/KEEP/output paths before
    alpha hydration. Execution always uses the command returned by complete-input
    capture, together with that exact captured owner; no outer command is supplied.
    """
    envelope = _object(
        value,
        {"type", "protocolVersion", "requestId", "stagingRoot", "bundle"}
        | ({"reportProgress"} if type(value) is dict and "reportProgress" in value else set()),
        "Illustrious Smart regional request",
    )
    request_id = envelope["requestId"]
    _require(
        type(envelope["type"]) is str
        and envelope["type"] == "execute-illustrious-smart-patch-regional"
        and type(envelope["protocolVersion"]) is str
        and envelope["protocolVersion"] == PROTOCOL_VERSION
        and type(request_id) is str
        and _REQUEST_ID_PATTERN.fullmatch(request_id) is not None,
        "Illustrious Smart regional request identity/version is invalid.",
    )
    if "reportProgress" in envelope:
        _require(
            envelope["reportProgress"] is True,
            "Illustrious Smart regional reportProgress must be true when present.",
        )
    root = _owned_root(envelope["stagingRoot"])
    bundle_descriptor = _descriptor(envelope["bundle"], root, _MAX_BUNDLE_BYTES)
    bundle = _object(
        _json_snapshot(_snapshot(bundle_descriptor)),
        {
            "schemaVersion",
            "profile",
            "recipe",
            "execution",
        },
        "Illustrious Smart regional bundle",
    )
    syntax = parse_request(bundle["execution"])
    _require(
        type(syntax) is ExecuteSmartPatchCommand,
        "Illustrious Smart regions require the original Smart execution command.",
    )
    command = cast(ExecuteSmartPatchCommand, syntax)
    _require(
        command.family == "illustrious"
        and command.mode in ("txt2img", "img2img", "inpaint", "outpaint")
        and type(command.inference) is IllustriousInferenceParameters
        and command.request_id == request_id
        and command.staging_root == root,
        "Illustrious Smart regional command identity/staging differs from its transport.",
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
                "Illustrious Smart bundle, source, KEEP and output must be distinct.",
            )
            reserved.add(descriptor[0])
    _require(
        type(bundle["recipe"]) is dict,
        "Illustrious Smart regional recipe must be an exact object.",
    )
    recipe = cast(dict[str, Any], bundle["recipe"]).copy()
    bbox = _rect(recipe.get("bbox"))
    width, height = bbox.width, bbox.height
    _require(
        width <= 2048 and height <= 2048 and width * height <= 4_000_000,
        "Illustrious Smart regional world alpha exceeds its bounded footprint.",
    )
    regions = recipe.get("regions")
    _require(
        type(regions) is list and len(regions) <= 3,
        "Illustrious Smart regional recipe admits at most three regions.",
    )
    snapshots = _RawSnapshots(root, reserved)
    hydrated: list[dict[str, Any]] = []
    for index, region_value in enumerate(cast(list[object], regions)):
        _require(
            type(region_value) is dict, "Illustrious Smart regional stream must be an exact object."
        )
        region = cast(dict[str, Any], region_value).copy()
        coverage = _object(
            region.get("coverage"), {"alpha", "bounds", "intersection", "kind"}, "World coverage"
        ).copy()
        alpha = _object(coverage["alpha"], {"$alpha8"}, "Smart regional alpha transport")
        raw = _object(alpha["$alpha8"], {"path", "byteSize", "sha256"}, "Smart regional alpha")
        _require(
            raw["path"] == str(root / f"regional-{index}.alpha8"),
            "Illustrious Smart regional alpha must retain its exact ordered file role.",
        )
        coverage["alpha"] = snapshots.alpha(coverage["alpha"], width * height)
        region["coverage"] = coverage
        hydrated.append(region)
    recipe["regions"] = hydrated
    captured = capture_illustrious_smart_patch_regional_input({**bundle, "recipe": recipe})
    _require(
        captured.command.request_id == request_id
        and captured.command.staging_root == root
        and captured.command.mode == command.mode
        and captured.execution_profile == bundle["profile"],
        "Captured Illustrious Smart execution differs from its transport identity.",
    )
    item = cast(dict[str, Any], recipe["item"])
    _require(
        item["iteration"] == 0 and item["promptPairIndex"] == 0,
        "Public Illustrious Smart regional input requires one static concrete item.",
    )
    return IllustriousSmartPatchRegionalRequest(captured, envelope.get("reportProgress") is True)


def execute_illustrious_smart_patch_regional_request(
    value: object,
    *,
    config_dir: Path,
    runtime: MLRuntime,
    on_progress: DenoisingProgressSink | None = None,
) -> dict[str, object]:
    """Use the existing exact-file CUDA owner and return its original Smart receipt."""
    _require(
        on_progress is None or callable(on_progress),
        "Illustrious Smart regional progress requires a callable sink.",
    )
    request = parse_illustrious_smart_patch_regional_request(value)
    _require(
        not request.report_progress or on_progress is not None,
        "Requested Illustrious Smart regional progress requires an available sink.",
    )
    torch = cast(Any, runtime.torch)
    with torch.no_grad():
        return execute_smart_patch(
            request.captured.command,
            config_dir=config_dir,
            runtime=runtime,
            on_progress=on_progress if request.report_progress else None,
            _illustrious_regional=request.captured,
        )
