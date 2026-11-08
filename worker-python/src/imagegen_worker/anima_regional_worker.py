"""Owned-file production transport to the existing original-Anima regional owner.

InvokeAI ae06c1bd36218100f89a48ff5b8855751d06a898 acquires Anima components in
app/invocations/anima/anima_denoise.py before the regional adapter/prediction
scope. Studio reuses its ordinary request parser and production model loader,
plus the established Illustrious no-follow bundle/alpha snapshot transport.
The sole explicit composition adaptation is Krea-2's background global-support
fallback (backend/krea2/regional_prompting.py); Anima's regional permissions and
even/odd positive-only attention scope remain in anima_regional.py.

Main owns staging until consumed completion or physical worker exit. This worker
never removes input files and owns no queue, persistence, or retry mechanism.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, cast

from imagegen_worker import PROTOCOL_VERSION
from imagegen_worker.anima_regional import (
    _capture,  # pyright: ignore[reportPrivateUsage]
    _capture_command,  # pyright: ignore[reportPrivateUsage]
    generate_current_canvas_regional_anima_txt2img,
)
from imagegen_worker.anima_worker import supports_anima_compute
from imagegen_worker.derivatives import DerivativeError, canonical_absolute_path
from imagegen_worker.generation_artifacts import (
    validate_generation_paths,
    validate_generation_target,
)
from imagegen_worker.illustrious_regional_worker import (
    _MAX_BUNDLE_BYTES,  # pyright: ignore[reportPrivateUsage]
    _descriptor,  # pyright: ignore[reportPrivateUsage]
    _hydrate_recipe,  # pyright: ignore[reportPrivateUsage]
    _json_snapshot,  # pyright: ignore[reportPrivateUsage]
    _object,  # pyright: ignore[reportPrivateUsage]
    _owned_root,  # pyright: ignore[reportPrivateUsage]
    _RawSnapshots,  # pyright: ignore[reportPrivateUsage]
    _snapshot,  # pyright: ignore[reportPrivateUsage]
)
from imagegen_worker.inference_anima import ANIMA_BASE_ARCHITECTURE, load_anima_models
from imagegen_worker.protocol import (
    _REQUEST_ID_PATTERN,  # pyright: ignore[reportPrivateUsage]
    MAX_GENERATION_TARGET_BYTES,
    GenerateAnimaTxt2ImgCommand,
    parse_request,
)

if TYPE_CHECKING:
    from imagegen_worker.inference import DenoisingProgressSink, MLRuntime

ANIMA_REGIONAL_CAPABILITY = "anima-regional-txt2img-v1"
COMPOSITION_PROFILE = "invoke-krea2-global-support-v1"
PROMPT_INTERPRETATION = "invoke-fragments-v1"


@dataclass(frozen=True, slots=True)
class AnimaRegionalRequest:
    command: GenerateAnimaTxt2ImgCommand
    recipe: dict[str, Any]
    compiled_prompts: object
    report_progress: bool = False


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise DerivativeError("INVALID_REQUEST", message)


def parse_anima_regional_request(value: object) -> AnimaRegionalRequest:
    """Validate/detach the finite public TXT handoff before loading any model."""
    envelope = _object(
        value,
        {"type", "protocolVersion", "requestId", "stagingRoot", "bundle"}
        | ({"reportProgress"} if type(value) is dict and "reportProgress" in value else set()),
        "Anima regional request",
    )
    if "reportProgress" in envelope:
        _require(
            envelope["reportProgress"] is True,
            "Anima regional reportProgress must be true when present.",
        )
    request_id = envelope["requestId"]
    _require(
        envelope["type"] == "execute-current-canvas-anima-regional"
        and type(envelope["protocolVersion"]) is str
        and envelope["protocolVersion"] == PROTOCOL_VERSION
        and type(request_id) is str
        and _REQUEST_ID_PATTERN.fullmatch(request_id) is not None,
        "Anima regional request identity/version is invalid.",
    )
    root = _owned_root(envelope["stagingRoot"])
    bundle_descriptor = _descriptor(envelope["bundle"], root, _MAX_BUNDLE_BYTES)
    bundle = _object(
        _json_snapshot(_snapshot(bundle_descriptor)),
        {
            "schemaVersion",
            "request",
            "recipe",
            "compiledPrompts",
            "compositionProfile",
            "promptInterpretation",
        },
        "Anima regional bundle",
    )
    _require(
        type(bundle["schemaVersion"]) is int and bundle["schemaVersion"] == 1,
        "Anima regional bundle version is invalid.",
    )
    _require(
        type(bundle["compositionProfile"]) is str
        and bundle["compositionProfile"] == COMPOSITION_PROFILE
        and type(bundle["promptInterpretation"]) is str
        and bundle["promptInterpretation"] == PROMPT_INTERPRETATION,
        "Anima regional composition or prompt interpretation is unsupported.",
    )
    parsed = parse_request(bundle["request"])
    _require(
        type(parsed) is GenerateAnimaTxt2ImgCommand,
        "Anima regions require an exact ordinary Anima txt2img command.",
    )
    command = cast(GenerateAnimaTxt2ImgCommand, parsed)
    _require(
        command.request_id == request_id and command.staging_root == root,
        "Anima regional command identity/staging differs from its transport.",
    )
    validate_generation_paths(root, command.target_path, command.output_path)
    _descriptor(
        {
            "path": str(command.target_path),
            "byteSize": command.target_byte_size,
            "sha256": command.target_sha256,
        },
        root,
        MAX_GENERATION_TARGET_BYTES,
    )
    _require(
        bundle_descriptor[0] not in (command.target_path, command.output_path),
        "Anima regional bundle, target and output must be distinct.",
    )
    snapshots = _RawSnapshots(
        root, {bundle_descriptor[0], command.target_path, command.output_path}
    )
    recipe = _hydrate_recipe(bundle["recipe"], snapshots)
    captured = _capture(recipe, bundle["compiledPrompts"])
    plan = _capture_command(command, captured)
    _require(
        all(region.text is not None and region.text != "" for region in captured.regions),
        "Every enabled public Anima region requires a nonempty positive prompt.",
    )
    _require(
        64 <= plan.width <= 512
        and 64 <= plan.height <= 512
        and plan.width % 8 == 0
        and plan.height % 8 == 0
        and 1 <= plan.steps <= 200
        and 1 <= plan.guidance_scale <= 30,
        "Anima regional public execution requires 64..512 pixels, "
        "Euler 1..200 steps and CFG 1..30.",
    )
    # The ordinary parser pins original Base architecture and three distinct file
    # descriptors. Reuse the loader's pinned-companion policy before invoking it;
    # actual schema/hash-bound model bytes remain that loader's responsibility.
    files = {
        "checkpoint": command.bundle.checkpoint,
        "qwen3_encoder": command.bundle.qwen3_encoder,
        "vae": command.bundle.vae,
    }
    for file in files.values():
        path = canonical_absolute_path(file.path, label="Anima regional model")
        _require(
            path != root and root not in path.parents,
            "Anima regional models must remain outside request staging.",
        )
    for role, identity in (ANIMA_BASE_ARCHITECTURE.companion_identities or {}).items():
        file = files[role]
        _require(
            (file.sha256, file.byte_size) == identity,
            "Anima regional execution requires the exact pinned Qwen3 and VAE companions.",
        )
    validate_generation_target(
        staging_root=root,
        target_path=command.target_path,
        output_path=command.output_path,
        target_sha256=command.target_sha256,
        target_byte_size=command.target_byte_size,
        width=command.width,
        height=command.height,
        img2img=False,
    )
    return AnimaRegionalRequest(
        command=command,
        recipe=recipe,
        compiled_prompts=bundle["compiledPrompts"],
        report_progress=envelope.get("reportProgress") is True,
    )


def execute_anima_regional_request(
    value: object,
    *,
    config_dir: Path,
    runtime: MLRuntime,
    on_progress: DenoisingProgressSink | None = None,
) -> dict[str, object]:
    """Load request-owned CUDA BF16 models and delegate to the existing consumer."""
    _require(
        on_progress is None or callable(on_progress),
        "Anima regional progress requires a callable sink.",
    )
    request = parse_anima_regional_request(value)
    _require(
        not request.report_progress or on_progress is not None,
        "Requested Anima regional progress requires an available callable sink.",
    )
    if not supports_anima_compute(runtime):
        raise DerivativeError("INFERENCE_UNAVAILABLE", "Anima requires native CUDA BF16 compute.")
    torch = cast(Any, runtime.torch)
    with torch.no_grad():
        models = load_anima_models(request.command.bundle, device="cuda", dtype=torch.bfloat16)
        for model in (
            models.transformer,
            models.text_conditioner,
            models.qwen3_encoder,
            models.vae,
        ):
            model.eval()
        return generate_current_canvas_regional_anima_txt2img(
            request.recipe,
            command=request.command,
            compiled_prompts=request.compiled_prompts,
            models=models,
            runtime=runtime,
            profile="cuda-bfloat16-v1",
            composition_profile="invoke-krea2-global-support-v1",
            on_progress=on_progress if request.report_progress else None,
        )
