"""Private owned-file transport into the existing Illustrious native owners.

InvokeAI a61ac4fb uses resource names to load detached masks/conditioning and
model-manager scopes to acquire native components (sd/denoise_latents.py,
shared/invocation_context.py, model_loaders/stable_diffusion.py). This adapter
uses Studio's exact no-follow snapshots for that resource handoff. It adds no
conditioning, attention, sampler, publication, queue or persistence algorithm.

Main owns staging until completion is consumed, or physical child exit on failure. The
worker consumes hash-bound snapshots and never removes inputs or their parent.
Checkpoint/catalog provenance remains Main's responsibility; the production
single-file loader owns checkpoint-to-live-component construction.

Invoke's queue freezes invocation graphs for Retry, but noise dtype remains a
runtime setting. Studio transports an explicit optional initialization identity
so frozen jobs never inherit a later runtime default.
"""

from __future__ import annotations

import importlib
import json
import os
import stat
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, cast

from . import PROTOCOL_VERSION
from .derivatives import DerivativeError, canonical_absolute_path, read_snapshot
from .generation_artifacts import validate_generation_paths
from .illustrious_regional_attention import Alpha8, Everywhere, Shape
from .illustrious_regional_attention_adapter import TransformerBinding
from .illustrious_regional_denoising import (
    _denoising_parameters,  # pyright: ignore[reportPrivateUsage]
    _DenoisingProfile,  # pyright: ignore[reportPrivateUsage]
    _dpmpp_2m_profile,  # pyright: ignore[reportPrivateUsage]
    _execution_profile,  # pyright: ignore[reportPrivateUsage]
    _vae_profile,  # pyright: ignore[reportPrivateUsage]
)
from .illustrious_regional_lora import prepare_regional_loras, verify_regional_lora_resources
from .illustrious_regional_output import (
    _command_parameters,  # pyright: ignore[reportPrivateUsage]
    generate_current_canvas_regional_txt2img,
)
from .illustrious_regional_recipe import (
    _bbox,  # pyright: ignore[reportPrivateUsage]
    _Layout,  # pyright: ignore[reportPrivateUsage]
    _recipe_inputs,  # pyright: ignore[reportPrivateUsage]
)
from .illustrious_regional_vae import (
    prepare_owned_regional_vae,
    verify_regional_vae_resource,
)
from .inference import (
    DenoisingProgressSink,
    MLRuntime,
    load_illustrious_pipeline,
    validate_generation_assets,
)
from .inference_embeddings import read_embedding_snapshot
from .protocol import (
    _REQUEST_ID_PATTERN,  # pyright: ignore[reportPrivateUsage]
    _SHA256_PATTERN,  # pyright: ignore[reportPrivateUsage]
    MAX_GENERATION_TARGET_BYTES,
    GenerateIllustriousTxt2ImgCommand,
    IllustriousInferenceParameters,
    parse_request,
)

_MAX_BUNDLE_BYTES = 1024 * 1024
_MAX_RAW_BYTES = 64 * 1024 * 1024
_MAX_RESOURCE_BYTES = 64 * 1024 * 1024
_ENCODING_PROFILE = "ordinary-canvas-static-dualclip-exact-ti-shared-readonly-cuda-fp16-v1"
_INVOKE_ENCODING_PROFILE = "ordinary-canvas-invoke-dualclip-exact-ti-shared-readonly-cuda-fp16-v1"
_DENOISING_PROFILE = "ordinary-canvas-euler-txt2img-cuda-fp16-v2"
_TOPOLOGY = {
    "down_blocks.1.attentions.0": (2, 2),
    "down_blocks.1.attentions.1": (2, 2),
    "down_blocks.2.attentions.0": (4, 10),
    "down_blocks.2.attentions.1": (4, 10),
    "mid_block.attentions.0": (4, 10),
    "up_blocks.0.attentions.0": (4, 10),
    "up_blocks.0.attentions.1": (4, 10),
    "up_blocks.0.attentions.2": (4, 10),
    "up_blocks.1.attentions.0": (2, 2),
    "up_blocks.1.attentions.1": (2, 2),
    "up_blocks.1.attentions.2": (2, 2),
}


def _denoising_profile(
    parameters: IllustriousInferenceParameters,
    initialization_profile: str | None = None,
    composition_profile: str | None = None,
) -> _DenoisingProfile:
    prepared_vae = composition_profile == "invoke-canvas-v1" and (
        parameters.vae is not None or parameters.vae_precision != "FP16"
    )
    if composition_profile == "invoke-canvas-v1" and parameters.scheduler in (
        "dpmpp_2m",
        "dpmpp_2m_k",
    ):
        _require(
            composition_profile == "invoke-canvas-v1"
            and type(initialization_profile) is str
            and initialization_profile == "invoke-cpu-f32-add-noise-v1",
            "DPM++ 2M requires explicit Invoke Canvas composition and initialization profiles.",
        )
        return (
            "ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cuda-vae-v1"
            if prepared_vae
            else "ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cuda-fp16-v1"
        )
    if initialization_profile is not None:
        _require(
            type(initialization_profile) is str
            and initialization_profile == "invoke-cpu-f32-add-noise-v1"
            and parameters.scheduler == "euler_a",
            "The explicit regional initialization profile requires supported Euler a execution.",
        )
        return (
            "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cuda-vae-v1"
            if prepared_vae
            else "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cuda-fp16-v1"
        )
    if prepared_vae:
        return (
            "ordinary-canvas-euler-ancestral-txt2img-cuda-vae-v1"
            if parameters.scheduler == "euler_a"
            else "ordinary-canvas-euler-txt2img-cuda-vae-v1"
        )
    return (
        "ordinary-canvas-euler-ancestral-txt2img-cuda-fp16-v1"
        if parameters.scheduler == "euler_a"
        else _DENOISING_PROFILE
    )


@dataclass(frozen=True, slots=True)
class RegionalRequest:
    command: GenerateIllustriousTxt2ImgCommand
    parameters: IllustriousInferenceParameters
    recipe: dict[str, Any]
    global_negative_coverage: Everywhere | Alpha8
    global_positive_coverage: Everywhere | Alpha8
    negative_pooled_source_id: str
    positive_pooled_source_id: str
    layout: _Layout
    composition_profile: str | None = None
    report_progress: bool = False
    initialization_profile: str | None = None


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise DerivativeError("INVALID_REQUEST", message)


def _object(value: object, keys: set[str], label: str) -> dict[str, Any]:
    _require(type(value) is dict, f"{label} must be an exact object.")
    record = cast(dict[str, Any], value)
    _require(record.keys() == keys, f"{label} fields are invalid.")
    return record


def _path(value: object, label: str) -> Path:
    _require(
        type(value) is str and 1 <= len(value) <= 4096 and "\x00" not in value,
        f"{label} must be a bounded absolute path.",
    )
    return canonical_absolute_path(Path(cast(str, value)), label=label)


def _owned_root(value: object) -> Path:
    root = _path(value, "Regional staging root")
    try:
        entry = root.lstat()
    except OSError as error:
        raise DerivativeError("INVALID_PATH", "Regional staging is unavailable.") from error
    _require(
        stat.S_ISDIR(entry.st_mode) and entry.st_uid == os.getuid() and not entry.st_mode & 0o022,
        "Regional staging must be an owned non-writable-by-others directory.",
    )
    return root


def _descriptor(value: object, root: Path, maximum: int) -> tuple[Path, int, str]:
    record = _object(value, {"path", "byteSize", "sha256"}, "Regional file descriptor")
    path = _path(record["path"], "Regional file")
    size, digest = record["byteSize"], record["sha256"]
    _require(path.parent == root, "Regional files must be direct staging children.")
    _require(type(size) is int and 1 <= size <= maximum, "Regional file size is invalid.")
    _require(
        type(digest) is str and _SHA256_PATTERN.fullmatch(digest) is not None,
        "Regional files require a canonical SHA-256 digest.",
    )
    try:
        entry = path.lstat()
    except OSError as error:
        raise DerivativeError("INPUT_UNAVAILABLE", "Regional file is unavailable.") from error
    _require(
        stat.S_ISREG(entry.st_mode)
        and entry.st_uid == os.getuid()
        and not entry.st_mode & 0o022
        and entry.st_nlink == 1
        and entry.st_size == size,
        "Regional files require exact owned, unlinked regular storage.",
    )
    return path, size, digest


def _snapshot(descriptor: tuple[Path, int, str]) -> bytes:
    path, size, digest = descriptor
    snapshot = read_snapshot(path, digest, max_bytes=size)
    if len(snapshot) != size:
        raise DerivativeError("GENERATION_INPUT_CHANGED", "Regional file size changed.")
    return snapshot


def _unique_fields(entries: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in entries:
        _require(key not in result, "Regional bundle cannot contain duplicate JSON fields.")
        result[key] = value
    return result


def _invalid_constant(value: str) -> object:
    raise DerivativeError("INVALID_REQUEST", f"Regional JSON cannot contain {value}.")


def _json_snapshot(snapshot: bytes) -> object:
    try:
        return cast(
            object,
            json.loads(
                snapshot.decode("utf-8"),
                object_pairs_hook=_unique_fields,
                parse_constant=_invalid_constant,
            ),
        )
    except (UnicodeError, ValueError, RecursionError) as error:
        raise DerivativeError(
            "INVALID_REQUEST", "Regional bundle is invalid UTF-8 JSON."
        ) from error


class _RawSnapshots:
    def __init__(self, root: Path, reserved: set[Path]) -> None:
        self.root = root
        self.reserved = reserved
        self.descriptors: dict[Path, tuple[int, str]] = {}
        self.total = 0

    def alpha(self, value: object, expected: int) -> bytes:
        wrapper = _object(value, {"$alpha8"}, "Regional alpha transport")
        descriptor = _descriptor(wrapper["$alpha8"], self.root, _MAX_RAW_BYTES)
        path, size, digest = descriptor
        _require(path not in self.reserved, "Alpha files must not alias bundle, target or output.")
        _require(size == expected, "Alpha byte size must exactly match its declared geometry.")
        old = self.descriptors.get(path)
        _require(old is None or old == (size, digest), "One alpha path has conflicting identities.")
        if old is None:
            self.total += size
            _require(self.total <= _MAX_RAW_BYTES, "Regional raw inputs exceed 64 MiB.")
            self.descriptors[path] = (size, digest)
        return _snapshot(descriptor)


def _hydrate_recipe(value: object, snapshots: _RawSnapshots) -> dict[str, Any]:
    _require(type(value) is dict, "Regional recipe must be an exact object.")
    recipe = cast(dict[str, Any], value).copy()
    bbox = _bbox(recipe.get("bbox"))
    regions = recipe.get("regions")
    _require(
        type(regions) is list and len(regions) <= 3, "Regional recipe admits at most 3 regions."
    )
    hydrated: list[dict[str, Any]] = []
    for value in cast(list[object], regions):
        _require(type(value) is dict, "Every regional stream must be an exact object.")
        region = cast(dict[str, Any], value).copy()
        coverage = _object(
            region.get("coverage"), {"alpha", "bounds", "intersection", "kind"}, "World coverage"
        ).copy()
        coverage["alpha"] = snapshots.alpha(coverage["alpha"], bbox.width * bbox.height)
        region["coverage"] = coverage
        hydrated.append(region)
    recipe["regions"] = hydrated
    return recipe


def _global_coverage(
    value: object, snapshots: _RawSnapshots, *, width: int, height: int
) -> Everywhere | Alpha8:
    _require(type(value) is dict, "Global support must be explicit.")
    record = cast(dict[str, Any], value)
    if record.get("kind") == "everywhere":
        _object(record, {"kind"}, "Everywhere support")
        return Everywhere()
    record = _object(record, {"kind", "alpha", "width", "height"}, "Global alpha8 support")
    _require(
        record["kind"] == "alpha8"
        and type(record["width"]) is int
        and type(record["height"]) is int
        and (record["width"], record["height"]) == (width, height),
        "Global alpha8 support must match the exact latent grid.",
    )
    return Alpha8(Shape(height, width), snapshots.alpha(record["alpha"], width * height))


def _verify_resources(pairs: tuple[Any, ...], root: Path, checkpoint: Path) -> None:
    """Preflight exact descriptors and bounded file/header snapshots before model loading.

    The existing TI consumer rechecks actual snapshots, floating tensors and
    encoder-dtype conversion before installation; no tensors are loaded here.
    """
    identities: dict[Path, tuple[str, int]] = {}
    entries: list[Any] = []
    for pair in pairs:
        resources = pair.resources
        _require(resources is not None, "The private worker requires complete exact-TI pairs.")
        entries.extend((*resources.positive, *resources.negative))
    _require(len(entries) <= 16, "Regional exact resources exceed 16 signed descriptors.")
    for entry in entries:
        path = canonical_absolute_path(entry.path, label="Regional exact embedding")
        _require(
            path != checkpoint and path != root and root not in path.parents,
            "Exact resources must be outside regional staging and distinct from checkpoint.",
        )
        identity = (entry.sha256, entry.byte_size)
        _require(
            path not in identities or identities[path] == identity,
            "One exact resource path has conflicting descriptors.",
        )
        identities[path] = identity
    _require(
        sum(size for _, size in identities.values()) <= _MAX_RESOURCE_BYTES,
        "Regional exact serialized resources exceed 64 MiB.",
    )
    counts: dict[Path, int] = {}
    for entry in entries:
        if entry.path not in counts:
            snapshot = read_embedding_snapshot(entry)
            header_size = int.from_bytes(snapshot[:8], "little")
            header = cast(dict[str, Any], json.loads(snapshot[8 : 8 + header_size]))
            shape = cast(list[int], header["clip_l"]["shape"])
            counts[entry.path] = 1 if len(shape) == 1 else shape[0]
            del snapshot, header
    for sign in ("positive", "negative"):
        _require(
            sum(counts[entry.path] for pair in pairs for entry in getattr(pair.resources, sign))
            <= 300,
            "Regional exact resources exceed 300 installed vectors per sign.",
        )


def qualify_bindings(pipeline: Any, runtime: MLRuntime) -> tuple[TransformerBinding, ...]:
    """Bind only the loaded, qualified Illustrious topology; never accept wire factors."""
    diffusers = cast(Any, runtime.diffusers)
    unet = pipeline.unet
    _require(
        type(unet) is diffusers.UNet2DConditionModel
        and tuple(unet.config.down_block_types)
        == ("DownBlock2D", "CrossAttnDownBlock2D", "CrossAttnDownBlock2D")
        and tuple(unet.config.up_block_types)
        == ("CrossAttnUpBlock2D", "CrossAttnUpBlock2D", "UpBlock2D")
        and len(unet.down_blocks) == len(unet.up_blocks) == 3,
        "Private regional loading requires the qualified Illustrious UNet configuration.",
    )
    parents = {
        name: module
        for name, module in unet.named_modules()
        if isinstance(module, diffusers.Transformer2DModel)
    }
    _require(parents.keys() == _TOPOLOGY.keys(), "Loaded UNet transformer topology differs.")
    result: list[TransformerBinding] = []
    sites: set[int] = set()
    for name, (expected_factor, depth) in _TOPOLOGY.items():
        if name.startswith("down_blocks."):
            factor = 2 ** int(name.split(".")[1])
        elif name.startswith("up_blocks."):
            factor = 2 ** (len(unet.up_blocks) - int(name.split(".")[1]) - 1)
        else:
            factor = 2 ** (len(unet.down_blocks) - 1)
        parent = parents[name]
        _require(
            type(parent) is diffusers.Transformer2DModel
            and factor == expected_factor
            and len(parent.transformer_blocks) == depth,
            "Loaded UNet transformer factor/depth differs from qualified Illustrious.",
        )
        for block in parent.transformer_blocks:
            attention = block.attn2
            _require(
                attention.heads == (10 if factor == 2 else 20)
                and attention.to_q.out_features == attention.heads * 64
                and attention.to_k.in_features == attention.to_v.in_features == 2048
                and id(attention) not in sites,
                "Loaded UNet cross-attention geometry differs from qualified Illustrious.",
            )
            sites.add(id(attention))
        result.append(TransformerBinding(parent, cast(Any, factor)))
    _require(len(result) == 11 and len(sites) == 70, "Incomplete Illustrious native bindings.")
    return tuple(result)


def parse_regional_request(value: object) -> RegionalRequest:
    """Detach and verify one complete file handoff without loading native models."""
    envelope = _object(
        value,
        {"type", "protocolVersion", "requestId", "stagingRoot", "bundle"}
        | ({"reportProgress"} if type(value) is dict and "reportProgress" in value else set()),
        "Private regional request",
    )
    if "reportProgress" in envelope:
        _require(
            envelope["reportProgress"] is True, "Regional reportProgress must be true when present."
        )
    request_id = envelope["requestId"]
    _require(
        envelope["type"] == "execute-current-canvas-regional"
        and type(envelope["protocolVersion"]) is str
        and envelope["protocolVersion"] == PROTOCOL_VERSION
        and type(request_id) is str
        and _REQUEST_ID_PATTERN.fullmatch(request_id) is not None,
        "Private regional request identity/version is invalid.",
    )
    root = _owned_root(envelope["stagingRoot"])
    bundle_descriptor = _descriptor(envelope["bundle"], root, _MAX_BUNDLE_BYTES)
    bundle_value = _json_snapshot(_snapshot(bundle_descriptor))
    bundle = _object(
        bundle_value,
        {
            "schemaVersion",
            "request",
            "recipe",
            "globalNegativeCoverage",
            "globalPositiveCoverage",
            "negativePooledSourceId",
            "positivePooledSourceId",
            "layout",
        }
        | (
            {"compositionProfile"}
            if type(bundle_value) is dict and "compositionProfile" in bundle_value
            else set[str]()
        )
        | (
            {"initializationProfile"}
            if type(cast(object, bundle_value)) is dict
            and "initializationProfile" in cast(dict[str, Any], bundle_value)
            else set[str]()
        ),
        "Private regional bundle",
    )
    composition_profile = bundle.get("compositionProfile")
    if "compositionProfile" in bundle:
        _require(
            type(composition_profile) is str and composition_profile == "invoke-canvas-v1",
            "The explicit regional composition profile is unsupported.",
        )
    initialization_profile = bundle.get("initializationProfile")
    if "initializationProfile" in bundle:
        _require(
            type(initialization_profile) is str
            and initialization_profile == "invoke-cpu-f32-add-noise-v1",
            "The explicit regional initialization profile is unsupported.",
        )
    encoding_profile = (
        _INVOKE_ENCODING_PROFILE if composition_profile is not None else _ENCODING_PROFILE
    )
    _require(
        type(bundle["schemaVersion"]) is int and bundle["schemaVersion"] == 1,
        "Private regional bundle version is invalid.",
    )
    command = parse_request(bundle["request"])
    _require(
        type(command) is GenerateIllustriousTxt2ImgCommand,
        "Private regional loading requires exact ordinary Illustrious txt2img.",
    )
    command = cast(GenerateIllustriousTxt2ImgCommand, command)
    _require(
        command.request_id == request_id and command.staging_root == root,
        "Regional command identity/staging must agree with its transport.",
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
        "Regional bundle, target and output must be distinct.",
    )
    parameters = _command_parameters(command)
    _require(
        not parameters.loras or composition_profile == "invoke-canvas-v1",
        "Regional LoRAs require the explicit Invoke Canvas composition profile.",
    )
    # Keep complete logical parameters for resource identity and loading ownership.
    # The existing recipe/denoising owners consume an already prepared native model.
    execution_parameters = replace(parameters, loras=())
    denoising_profile = _denoising_profile(parameters, initialization_profile, composition_profile)
    tensor_profile, _ = _execution_profile(denoising_profile, encoding_profile)
    prepared_vae = _vae_profile(denoising_profile)
    if _dpmpp_2m_profile(denoising_profile):
        _denoising_parameters(
            execution_parameters,
            tensor_profile,
            resolved_noise=True,
            prepared_vae=prepared_vae,
            dpmpp_2m=True,
        )
    elif parameters.scheduler == "euler_a":
        _denoising_parameters(
            execution_parameters,
            tensor_profile,
            resolved_noise=True,
            ancestral=True,
            prepared_vae=prepared_vae,
        )
    else:
        _denoising_parameters(
            execution_parameters, tensor_profile, resolved_noise=True, prepared_vae=prepared_vae
        )
    snapshots = _RawSnapshots(
        root, {bundle_descriptor[0], command.target_path, command.output_path}
    )
    recipe = _hydrate_recipe(bundle["recipe"], snapshots)
    bbox = _bbox(recipe["bbox"])
    negative = _global_coverage(
        bundle["globalNegativeCoverage"], snapshots, width=bbox.width // 8, height=bbox.height // 8
    )
    positive = _global_coverage(
        bundle["globalPositiveCoverage"], snapshots, width=bbox.width // 8, height=bbox.height // 8
    )
    bbox, pairs, _, _, _, _ = _recipe_inputs(
        recipe,
        execution_parameters,
        encoding_profile,
        bundle["layout"],
        negative,
        positive,
        bundle["negativePooledSourceId"],
        bundle["positivePooledSourceId"],
    )
    _require(
        _bbox(command.bbox) == bbox
        and (command.width, command.height) == (bbox.width, bbox.height),
        "Regional command bbox must exactly match the complete Main recipe.",
    )
    checkpoint = canonical_absolute_path(parameters.checkpoint_path, label="Checkpoint")
    _require(
        checkpoint != root and root not in checkpoint.parents,
        "Checkpoint must be outside private regional staging.",
    )
    _verify_resources(pairs, root, checkpoint)
    verify_regional_lora_resources(parameters.loras, root, checkpoint)
    if prepared_vae:
        verify_regional_vae_resource(parameters.vae, root, checkpoint)
    validate_generation_assets(command)
    return RegionalRequest(
        command=command,
        parameters=parameters,
        recipe=recipe,
        global_negative_coverage=negative,
        global_positive_coverage=positive,
        negative_pooled_source_id=bundle["negativePooledSourceId"],
        positive_pooled_source_id=bundle["positivePooledSourceId"],
        layout=bundle["layout"],
        composition_profile=composition_profile,
        report_progress=envelope.get("reportProgress") is True,
        initialization_profile=initialization_profile,
    )


def install_capture_hooks(pipeline: Any) -> None:
    """Invoke the pinned native installer on both actual capture owners; never forward."""
    capture = cast(Any, importlib.import_module("transformers.utils.output_capturing"))
    capture.maybe_install_capturing_hooks(pipeline.text_encoder.text_model)
    capture.maybe_install_capturing_hooks(pipeline.text_encoder_2.text_model)


def execute_regional_request(
    value: object,
    *,
    config_dir: Path,
    runtime: MLRuntime,
    on_progress: DenoisingProgressSink | None = None,
) -> dict[str, object]:
    """Load once and delegate one original native provisional publication."""
    _require(
        on_progress is None or callable(on_progress), "Regional progress requires a callable sink."
    )
    request = parse_regional_request(value)
    _require(
        not request.report_progress or on_progress is not None,
        "Requested regional progress requires an available callable sink.",
    )
    torch = cast(Any, runtime.torch)
    with torch.no_grad():
        # Invoke acquires model components before per-prompt TI/Compel conditioning.
        # This loader must not parse recipe-owned TI as ordinary resource-free text or
        # install it on the borrowed originals. The checked recipe/command below keeps
        # every authored prompt and exact binding for the single conditioning owner.
        loading_parameters = replace(
            request.parameters, positive_prompt="", negative_prompt="", loras=()
        )
        pipeline, _ = load_illustrious_pipeline(
            loading_parameters, config_dir=config_dir, runtime=runtime, mode="txt2img"
        )
        prepare_regional_loras(pipeline, request.parameters.loras, torch)
        denoising_profile = _denoising_profile(
            request.parameters, request.initialization_profile, request.composition_profile
        )
        if _vae_profile(denoising_profile):
            prepare_owned_regional_vae(pipeline, request.parameters, torch)
        # Only a successfully prepared, owned pipeline permits the native output
        # command to lose its stack. The logical request retains every descriptor.
        execution_command = (
            replace(request.command, loras=()) if request.parameters.loras else request.command
        )
        for component in (
            pipeline.text_encoder,
            pipeline.text_encoder_2,
            pipeline.unet,
            pipeline.vae,
        ):
            component.eval()
        install_capture_hooks(pipeline)
        bindings = qualify_bindings(pipeline, runtime)
        return generate_current_canvas_regional_txt2img(
            request.recipe,
            command=execution_command,
            pipeline=pipeline,
            runtime=runtime,
            profile=_INVOKE_ENCODING_PROFILE
            if request.composition_profile == "invoke-canvas-v1"
            else _ENCODING_PROFILE,
            denoising_profile=denoising_profile,
            global_negative_coverage=request.global_negative_coverage,
            global_positive_coverage=request.global_positive_coverage,
            negative_pooled_source_id=request.negative_pooled_source_id,
            positive_pooled_source_id=request.positive_pooled_source_id,
            bindings=bindings,
            layout=request.layout,
            **(
                {"on_progress": on_progress}
                if request.report_progress and on_progress is not None
                else {}
            ),
        )
