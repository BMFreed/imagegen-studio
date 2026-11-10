"""Invoke Standard SDXL IP-Adapter prepass and typed regional image inputs.

Adapted from InvokeAI 4875d965 backend/ip_adapter/ip_adapter.py,
ip_attention_weights.py and sd/denoise_latents.py. No pipeline processors,
sampler, network loader or persistent resource owner are introduced here.
"""

from __future__ import annotations

import hashlib
import importlib
import io
import json
import os
import re
import stat
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, cast

from PIL import Image

from .derivatives import (
    MAX_IMAGE_PIXELS,
    MAX_IMAGE_SIDE,
    DerivativeError,
    canonical_absolute_path,
)
from .illustrious_regional_attention import Shape

if TYPE_CHECKING:
    from .inference import MLRuntime

REFERENCE_PROFILE = "invoke-illustrious-regional-reference-txt2img-v1"
REFERENCE_IMG2IMG_PROFILE = "invoke-illustrious-regional-reference-img2img-v1"
REFERENCE_OUTPAINT_PROFILE = "invoke-illustrious-regional-reference-outpaint-v1"
_REFERENCE_PROFILES = (REFERENCE_PROFILE, REFERENCE_IMG2IMG_PROFILE, REFERENCE_OUTPAINT_PROFILE)
_SHA256 = re.compile(r"[0-9a-f]{64}\Z")
_MAX_IMAGE_BYTES = 32 * 1024 * 1024
_MAX_RESOURCE_BYTES = {"adapter": 1024**3, "visionModel": 3 * 1024**3, "visionConfig": 65536}


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise DerivativeError("INVALID_REQUEST", message)


def _record(value: object, keys: set[str], label: str) -> dict[str, Any]:
    _require(type(value) is dict, f"Invalid {label} object.")
    record = cast(dict[str, Any], value)
    _require(record.keys() == keys, f"Invalid {label} fields.")
    return record


@dataclass(frozen=True, slots=True)
class ReferenceResource:
    path: Path
    byte_size: int
    sha256: str


_ResourceVersion = tuple[int, int, int, int, int]
_ResourceGroup = dict[str, tuple[ReferenceResource, _ResourceVersion]]


def _resource_version(entry: os.stat_result) -> _ResourceVersion:
    return (entry.st_dev, entry.st_ino, entry.st_size, entry.st_mtime_ns, entry.st_ctime_ns)


def _resource_path_version(resource: ReferenceResource) -> _ResourceVersion:
    try:
        canonical_absolute_path(resource.path, label="Reference resource")
        entry = resource.path.lstat()
        _require(
            stat.S_ISREG(entry.st_mode) and entry.st_size == resource.byte_size,
            "Reference resource storage or exact size changed.",
        )
        canonical_absolute_path(resource.path, label="Reference resource")
        return _resource_version(entry)
    except OSError as error:
        raise DerivativeError("INPUT_UNAVAILABLE", "Reference resource is unavailable.") from error


def _resource_group(resources: dict[str, ReferenceResource]) -> _ResourceGroup:
    return {
        role: (resource, _resource_path_version(resource)) for role, resource in resources.items()
    }


def _verify_resource_group(
    resources: dict[str, ReferenceResource],
    expected: _ResourceGroup | None = None,
) -> _ResourceGroup:
    # Capture every pathname before the first serial SHA pass. Keep that exact
    # descriptor/version group through model loading, including restored bytes.
    versions = _resource_group(resources) if expected is None else expected
    for resource in resources.values():
        verify_reference_resource(resource)
    _require(
        _resource_group(resources) == versions,
        "Reference resource group changed during hashing or model loading.",
    )
    return versions


@dataclass(frozen=True, slots=True)
class CapturedRegionalReference:
    region_id: str
    reference_id: str
    png: bytes
    width: int
    height: int
    # Immutable bbox-resolution alpha belonging to this exact Regional layer.
    alpha: bytes


@dataclass(frozen=True, slots=True)
class CapturedRegionalReferences:
    resources: dict[str, ReferenceResource]
    images: tuple[CapturedRegionalReference, ...]
    shape: Shape


@dataclass(frozen=True, slots=True)
class ProjectedRegionalReference:
    region_id: str
    reference_id: str
    conditional: Any
    unconditional: Any
    # Binary planes, factor 1/2/4/8. Separate from text's ge128 pyramid.
    masks: tuple[bytes, ...]


@dataclass(frozen=True, slots=True)
class PreparedRegionalReferences:
    images: tuple[ProjectedRegionalReference, ...]
    # Complete native registry indices, retaining self-attention positions.
    weights: dict[int, tuple[Any, Any]]
    shape: Shape


def verify_reference_resource(resource: ReferenceResource) -> None:
    """Stream exact bytes without retaining a multi-GiB duplicate of vision weights."""
    try:
        at_path = _resource_path_version(resource)
        descriptor = os.open(resource.path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, "rb") as stream:
            before = os.fstat(stream.fileno())
            _require(
                stat.S_ISREG(before.st_mode) and _resource_version(before) == at_path,
                "Reference resource storage or exact size changed.",
            )
            digest = hashlib.sha256()
            total = 0
            while chunk := stream.read(1024 * 1024):
                total += len(chunk)
                _require(total <= resource.byte_size, "Reference resource grew while reading.")
                digest.update(chunk)
            after = os.fstat(stream.fileno())
            _require(
                total == resource.byte_size
                and digest.hexdigest() == resource.sha256
                and _resource_version(before) == _resource_version(after)
                and _resource_version(after) == _resource_path_version(resource),
                "Reference resource bytes changed.",
            )
    except OSError as error:
        raise DerivativeError("INPUT_UNAVAILABLE", "Reference resource is unavailable.") from error


def capture_regional_references(
    value: object,
    recipe: dict[str, Any],
    *,
    root: Path,
    reserved: set[Path],
    checkpoint: Path,
    read_image: Any,
    expected_profile: str = REFERENCE_PROFILE,
) -> CapturedRegionalReferences:
    """Bind ordered operational image snapshots to the original authoring records."""
    record = _record(value, {"profile", "resources", "images"}, "regional references")
    _require(
        expected_profile in _REFERENCE_PROFILES and record["profile"] == expected_profile,
        "Reference inference profile does not match its exact target mode.",
    )
    resource_values = _record(
        record["resources"], {"adapter", "visionConfig", "visionModel"}, "reference resources"
    )
    resources: dict[str, ReferenceResource] = {}
    paths = {checkpoint}
    for role, raw in resource_values.items():
        entry = _record(raw, {"path", "byteSize", "sha256"}, "reference resource")
        _require(
            type(entry["path"]) is str
            and 1 <= len(entry["path"]) <= 4096
            and "\x00" not in entry["path"],
            "Reference resource path is invalid.",
        )
        path = canonical_absolute_path(Path(entry["path"]), label="Reference resource")
        size, digest = entry["byteSize"], entry["sha256"]
        _require(
            path not in paths
            and path != root
            and root not in path.parents
            and type(size) is int
            and 1 <= size <= _MAX_RESOURCE_BYTES[role]
            and type(digest) is str
            and _SHA256.fullmatch(digest) is not None,
            "Reference resource identity or byte bound is invalid.",
        )
        paths.add(path)
        resources[role] = ReferenceResource(path, size, digest)
    _verify_resource_group(resources)
    model, config = resources["visionModel"].path, resources["visionConfig"].path
    _require(
        model.name == "model.safetensors"
        and config.name == "config.json"
        and model.parent == config.parent,
        "Vision weights and config must share their canonical model directory.",
    )
    images = record["images"]
    _require(type(images) is list and 1 <= len(images) <= 3, "Admit one to three reference images.")
    authored: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for region in recipe["regions"]:
        refs = region.get("referenceImages", [])
        _require(type(refs) is list, "Reference authoring records require an exact list.")
        authored.extend((region, ref) for ref in refs)
    _require(len(authored) == len(images), "Every enabled authored reference must be captured.")
    result: list[CapturedRegionalReference] = []
    identities: set[str] = set()
    total = 0
    for raw, (region, authored_ref) in zip(images, authored, strict=True):
        image = _record(raw, {"regionId", "referenceId", "image"}, "captured reference")
        wrapper = _record(image["image"], {"$referencePng"}, "reference PNG transport")
        descriptor = _record(
            wrapper["$referencePng"],
            {"path", "byteSize", "sha256", "width", "height"},
            "reference PNG descriptor",
        )
        _require(type(authored_ref) is dict, "Reference authoring record must be an object.")
        asset = authored_ref.get("asset")
        _require(type(asset) is dict, "Reference authoring record requires its original asset.")
        asset = cast(dict[str, Any], asset)
        width, height = descriptor["width"], descriptor["height"]
        _require(
            image["regionId"] == region["regionId"]
            and type(image["referenceId"]) is str
            and image["referenceId"] == authored_ref.get("id")
            and image["referenceId"] not in identities
            and descriptor["sha256"] == asset.get("sha256")
            and descriptor["byteSize"] == asset.get("bytes")
            and (width, height) == (asset.get("width"), asset.get("height"))
            and type(width) is int
            and type(height) is int
            and 1 <= width <= MAX_IMAGE_SIDE
            and 1 <= height <= MAX_IMAGE_SIDE
            and width * height <= MAX_IMAGE_PIXELS,
            "Reference owner, order, original hash or geometry differs from authoring.",
        )
        identities.add(image["referenceId"])
        _require(
            type(descriptor["path"]) is str
            and 1 <= len(descriptor["path"]) <= 4096
            and "\x00" not in descriptor["path"],
            "Reference PNG requires an exact bounded path string.",
        )
        path = canonical_absolute_path(Path(descriptor["path"]), label="Reference PNG")
        _require(path not in reserved, "Reference PNG aliases another staging role.")
        reserved.add(path)
        # Existing worker's strict no-follow, owned, direct-child descriptor reader.
        png = cast(
            bytes,
            read_image(
                {key: descriptor[key] for key in ("path", "byteSize", "sha256")}, _MAX_IMAGE_BYTES
            ),
        )
        total += len(png)
        _require(total <= 3 * _MAX_IMAGE_BYTES, "Reference PNG aggregate exceeds 96 MiB.")
        _open_reference_png(png, width, height).close()
        result.append(
            CapturedRegionalReference(
                image["regionId"],
                image["referenceId"],
                png,
                width,
                height,
                region["coverage"]["alpha"],
            )
        )
    bbox = recipe["bbox"]
    return CapturedRegionalReferences(
        resources, tuple(result), Shape(bbox["height"] // 8, bbox["width"] // 8)
    )


def _open_reference_png(png: bytes, width: int, height: int) -> Image.Image:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(png)) as image:
                _require(
                    image.format == "PNG"
                    and image.size == (width, height)
                    and image.mode in ("RGB", "RGBA")
                    and not getattr(image, "is_animated", False),
                    "Reference requires its original static RGB/RGBA PNG and exact dimensions.",
                )
                image.load()
                return image.convert("RGB")
    except (
        OSError,
        ValueError,
        Image.DecompressionBombWarning,
        Image.DecompressionBombError,
    ) as error:
        raise DerivativeError("INVALID_REQUEST", "Reference PNG cannot be decoded.") from error


def reference_mask_pyramid(alpha: bytes, shape: Shape) -> tuple[bytes, ...]:
    """Invoke alpha>0, nearest-to-latent, then ceil-mode 2x2 maximum pooling."""
    width, height = shape.width * 8, shape.height * 8
    _require(type(alpha) is bytes and len(alpha) == width * height, "Invalid reference mask plane.")
    values = bytes(
        int(alpha[y * 8 * width + x * 8] > 0)
        for y in range(shape.height)
        for x in range(shape.width)
    )
    levels = [values]
    height, width = shape.height, shape.width
    for _ in range(3):
        next_h, next_w = (height + 1) // 2, (width + 1) // 2
        values = bytes(
            max(
                values[y * width + x]
                for y in range(2 * row, min(2 * row + 2, height))
                for x in range(2 * col, min(2 * col + 2, width))
            )
            for row in range(next_h)
            for col in range(next_w)
        )
        levels.append(values)
        height, width = next_h, next_w
    return tuple(levels)


def _load_reference_models(
    captured: CapturedRegionalReferences, torch: Any
) -> tuple[Any, Any, Any, dict[int, tuple[Any, Any]]]:
    """Explicit tiny-model test seam; production always loads exact offline Standard assets."""
    transformers = cast(Any, importlib.import_module("transformers"))
    safetensors = cast(Any, importlib.import_module("safetensors.torch"))
    config_path = captured.resources["visionConfig"].path
    config = json.loads(config_path.read_text("utf-8"))
    expected = {
        "hidden_size": 1280,
        "projection_dim": 1024,
        "image_size": 224,
        "patch_size": 14,
        "num_hidden_layers": 32,
        "num_attention_heads": 16,
    }
    _require(
        type(config) is dict and all(config.get(k) == v for k, v in expected.items()),
        "Unsupported CLIP Vision config for Standard SDXL ViT-H.",
    )
    vision = (
        transformers.CLIPVisionModelWithProjection.from_pretrained(
            str(config_path.parent),
            local_files_only=True,
            torch_dtype=torch.float16,
            use_safetensors=True,
        )
        .eval()
        .to(device="cuda:0", dtype=torch.float16)
    )
    state = safetensors.load_file(str(captured.resources["adapter"].path), device="cpu")
    projection = torch.nn.ModuleDict(
        {"proj": torch.nn.Linear(1024, 8192), "norm": torch.nn.LayerNorm(2048)}
    )
    projection_state = {
        key.removeprefix("image_proj."): tensor
        for key, tensor in state.items()
        if key.startswith("image_proj.")
    }
    _require(
        set(projection_state) == {"proj.weight", "proj.bias", "norm.weight", "norm.bias"},
        "Only the four-token Standard image projection is supported.",
    )
    projection.load_state_dict(projection_state, strict=True)
    projection.eval().to(device="cuda:0", dtype=torch.float16)
    weights: dict[int, tuple[Any, Any]] = {}
    for name in state:
        if name.startswith("image_proj."):
            continue
        match = re.fullmatch(r"ip_adapter\.([0-9]+)\.to_([kv])_ip\.weight", name)
        _require(match is not None, "Unknown Standard IP-Adapter tensor.")
        assert match is not None
        index = int(match[1])
        key_name = f"ip_adapter.{index}.to_k_ip.weight"
        value_name = f"ip_adapter.{index}.to_v_ip.weight"
        _require(key_name in state and value_name in state, "Incomplete IP-Adapter K/V pair.")
        if index not in weights:
            key, value = state[key_name], state[value_name]
            _require(
                key.ndim == 2 and key.shape == value.shape and key.shape[1] == 2048,
                "Standard IP-Adapter K/V dimensions are invalid.",
            )
            weights[index] = (
                key.to(device="cuda:0", dtype=torch.float16),
                value.to(device="cuda:0", dtype=torch.float16),
            )
    _require(bool(weights), "IP-Adapter contains no attention weights.")
    return vision, projection, transformers.CLIPImageProcessor(), weights


def prepare_regional_references(
    captured: CapturedRegionalReferences, runtime: MLRuntime
) -> PreparedRegionalReferences:
    """Encode/release vision and projection before the caller loads/borrows the UNet."""
    torch = cast(Any, runtime.torch)
    versions = _verify_resource_group(captured.resources)
    vision, projection, processor, weights = _load_reference_models(captured, torch)
    images: list[ProjectedRegionalReference] = []
    try:
        _require(
            _resource_group(captured.resources) == versions,
            "Reference resource group changed during model loading.",
        )
        with torch.no_grad():
            for source in captured.images:
                with _open_reference_png(source.png, source.width, source.height) as image:
                    pixels = processor(images=[image], return_tensors="pt").pixel_values
                parameter = next(vision.parameters())
                embeds = vision(
                    pixels.to(device=parameter.device, dtype=parameter.dtype)
                ).image_embeds
                _require(
                    tuple(embeds.shape) == (1, 1024),
                    "Vision projection must yield one 1024-vector.",
                )
                conditional = projection["norm"](projection["proj"](embeds).reshape(1, 4, -1))
                unconditional = projection["norm"](
                    projection["proj"](torch.zeros_like(embeds)).reshape(1, 4, -1)
                )
                _require(
                    bool(torch.isfinite(conditional).all())
                    and bool(torch.isfinite(unconditional).all()),
                    "Image projection produced non-finite values.",
                )
                images.append(
                    ProjectedRegionalReference(
                        source.region_id,
                        source.reference_id,
                        conditional.detach(),
                        unconditional.detach(),
                        reference_mask_pyramid(source.alpha, captured.shape),
                    )
                )
        _verify_resource_group(captured.resources, versions)
        return PreparedRegionalReferences(tuple(images), weights, captured.shape)
    finally:
        # No vision/projection modules are installed on the pipeline or retained in the result.
        del vision, projection, processor
