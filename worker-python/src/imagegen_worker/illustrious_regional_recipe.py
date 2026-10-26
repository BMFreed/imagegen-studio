"""Private, one-shot composition of an acknowledged Main Current Canvas recipe.

This explicit CPU / cuda:0 FP16 candidate neither authenticates external
job/checkpoint metadata nor grants public generation admission. The caller supplies
the actual Main recipe and the same job's parameters, and exclusively owns the pipeline, tokenizers,
CLIPs and UNet for the entire call. Direct concurrent forwards or model mutation
are unsupported. The reservation below protects overlapping calls to this consumer;
the existing bridge remains the sole owner of native attention restoration.
Both CLIPs must already have native text_model output-capturing hooks installed;
the caller owns that setup, before entering this consumer's unchanged-state scope.
Plain-profile local CLIP hooks may observe or return value-equal replacements. During
encoding their registry entries are guarded and restored; global forward hooks
refuse. Hooks must not mutate arguments/outputs in place or change hook registries
during the call. This cooperative exclusion includes mutable containers and fields.

Only consumed metadata is retained, in immutable records. Authored/dormant prompt
data is checked structurally without interpreting, normalizing or activating it.
Exact-TI profiles accept only pinned native capture hooks and encode on bounded,
private text-component graphs within the same reservation. Shared-readonly
profiles borrow non-token weights and own final token tables. UNet/VAE remain
borrowed. No checkpoint, image adapter or image is loaded by this module.
"""

from __future__ import annotations

import importlib
import importlib.metadata
import inspect
import math
import re
import threading
from collections.abc import Generator
from contextlib import contextmanager, nullcontext
from dataclasses import dataclass, fields, replace
from typing import Any, Literal, cast
from uuid import UUID

from .illustrious_regional_attention import (
    Alpha8,
    AttentionPlan,
    EncodedSegment,
    Everywhere,
    Shape,
    plan_illustrious_attention,
)
from .illustrious_regional_attention_adapter import (
    _OWNERS,  # pyright: ignore[reportPrivateUsage]
    _OWNERS_LOCK,  # pyright: ignore[reportPrivateUsage]
    IllustriousRegionalAdapterError,
    TransformerBinding,
    _load_native,  # pyright: ignore[reportPrivateUsage]
    _module_tree,  # pyright: ignore[reportPrivateUsage]
    _runtime,  # pyright: ignore[reportPrivateUsage]
    _tensor_policy,  # pyright: ignore[reportPrivateUsage]
    _TensorProfile,  # pyright: ignore[reportPrivateUsage]
    validate_illustrious_regional_attention,
)
from .illustrious_regional_conditioning import (
    EncodedTensorBinding,
    _finite,  # pyright: ignore[reportPrivateUsage]
    _tensor,  # pyright: ignore[reportPrivateUsage]
    encoded_bindings_from_sdxl_conditioning,
    run_illustrious_regional_conditioning,
)
from .illustrious_regional_embeddings import (
    RegionalEmbeddingResources,
    _EmbeddingStrategy,  # pyright: ignore[reportPrivateUsage]
    bounded_ti_module_tree,
    installed_regional_embeddings,
    masked_ref_text,
    prepare_regional_embeddings,
    prompt_ref_keys,
    recipe_embedding_resources,
    validate_authored_selection,
)
from .illustrious_regional_geometry import ordinary_canvas_coverage_to_latent
from .inference import (
    MLRuntime,
    build_sdxl_conditioning,
    normalize_compel_prompt,
    validate_pipeline_prompts,
)
from .inference_embeddings import EmbeddingConditioningInputs, expanded_conditioning_length
from .protocol import IllustriousInferenceParameters

__all__ = ("IllustriousRegionalRecipeError", "run_current_canvas_regional_recipe")

_Code = Literal["INPUT_INVALID", "PROFILE_INVALID", "UNSUPPORTED", "LIMIT", "SCOPE_CONFLICT"]
_Profile = Literal[
    "ordinary-canvas-static-dualclip-cpu-v1",
    "ordinary-canvas-static-dualclip-cuda-fp16-v1",
    "ordinary-canvas-static-dualclip-exact-ti-cpu-v1",
    "ordinary-canvas-static-dualclip-exact-ti-cuda-fp16-v1",
    "ordinary-canvas-static-dualclip-exact-ti-shared-readonly-cpu-v1",
    "ordinary-canvas-static-dualclip-exact-ti-shared-readonly-cuda-fp16-v1",
]
_Layout = Literal["cfg-negative-first", "positive-only"]
_CoverageKind = Literal["covered", "intersecting-empty", "empty", "outside"]
_PROFILE: _Profile = "ordinary-canvas-static-dualclip-cpu-v1"
_CUDA_PROFILE: _Profile = "ordinary-canvas-static-dualclip-cuda-fp16-v1"
_TI_PROFILE: _Profile = "ordinary-canvas-static-dualclip-exact-ti-cpu-v1"
_TI_CUDA_PROFILE: _Profile = "ordinary-canvas-static-dualclip-exact-ti-cuda-fp16-v1"
_TI_SHARED_PROFILE: _Profile = "ordinary-canvas-static-dualclip-exact-ti-shared-readonly-cpu-v1"
_TI_SHARED_CUDA_PROFILE: _Profile = (
    "ordinary-canvas-static-dualclip-exact-ti-shared-readonly-cuda-fp16-v1"
)
_TI_PROFILES = (_TI_PROFILE, _TI_CUDA_PROFILE, _TI_SHARED_PROFILE, _TI_SHARED_CUDA_PROFILE)
_SAFE_INTEGER = 2**53 - 1
_MAX_TEXT_BYTES = 16 * 1024
_MAX_PAIR_TEXT_BYTES = 128 * 1024
_MAX_SAMPLE_BYTES = 32 * 1024 * 1024
_MAX_REGIONS = 3
_MAX_SIGN_LENGTH = 308
_MAX_HOOK_DEPTH = 16
_MAX_HOOK_NODES = 4096
_UUID = re.compile(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\Z")
_SHA256 = re.compile(r"[0-9a-f]{64}\Z")
_RESERVATIONS_LOCK = threading.RLock()
_RESERVATIONS: dict[int, object] = {}


class IllustriousRegionalRecipeError(ValueError):
    """Local recipe refusal; existing geometry/adapter/native errors pass through."""

    code: _Code

    def __init__(self, code: _Code, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class _Rect:
    x: int
    y: int
    width: int
    height: int

    def mapping(self) -> dict[str, int]:
        return {"x": self.x, "y": self.y, "width": self.width, "height": self.height}


@dataclass(frozen=True, slots=True)
class _WorldCoverage:
    bounds: _Rect
    alpha: bytes
    kind: _CoverageKind
    intersection: _Rect | None


@dataclass(frozen=True, slots=True)
class _Pair:
    binding_id: str
    positive: str | None
    negative: str
    coverage: _WorldCoverage | None
    resources: RegionalEmbeddingResources | None = None


def _require(condition: bool, code: _Code, message: str) -> None:
    if not condition:
        raise IllustriousRegionalRecipeError(code, message)


def _encoding_tensor_profile(profile: _Profile) -> _TensorProfile:
    """High-level selection is exclusively the explicit encoding profile."""
    _require(
        type(profile) is str and profile in (_PROFILE, _CUDA_PROFILE, *_TI_PROFILES),
        "PROFILE_INVALID",
        "Unsupported recipe profile.",
    )
    return (
        "cuda-float16-v1"
        if profile in (_CUDA_PROFILE, _TI_CUDA_PROFILE, _TI_SHARED_CUDA_PROFILE)
        else "cpu-float32-v1"
    )


def _encoding_embedding_strategy(profile: _Profile) -> _EmbeddingStrategy:
    return (
        "shared-readonly"
        if profile in (_TI_SHARED_PROFILE, _TI_SHARED_CUDA_PROFILE)
        else "independent-copy"
    )


def _record(
    value: object, required: set[str], optional: frozenset[str] = frozenset()
) -> dict[str, Any]:
    _require(type(value) is dict, "INPUT_INVALID", "Expected an exact built-in dictionary.")
    record = cast(dict[str, Any], value)
    _require(
        all(type(key) is str for key in record)
        and required <= record.keys()
        and record.keys() <= required | optional,
        "INPUT_INVALID",
        "Recipe dictionary fields do not match the canonical Main shape.",
    )
    return record


def _integer(value: object, minimum: int = 0, maximum: int = _SAFE_INTEGER) -> int:
    _require(
        type(value) is int and minimum <= value <= maximum,
        "INPUT_INVALID",
        "Expected an exact safe integer in the supported range, excluding bool.",
    )
    return cast(int, value)


def _identity(value: object, owned: set[str] | None = None) -> str:
    _require(
        type(value) is str and _UUID.fullmatch(value) is not None,
        "INPUT_INVALID",
        "Recipe identities must be UUID strings.",
    )
    identity = cast(str, value)
    canonical = str(UUID(identity))
    if owned is not None:
        _require(canonical not in owned, "INPUT_INVALID", "Owned recipe identities must be unique.")
        owned.add(canonical)
    return identity


def _rect(value: object) -> _Rect:
    rect = _record(value, {"x", "y", "width", "height"})
    return _Rect(
        x=_integer(rect["x"], -_SAFE_INTEGER),
        y=_integer(rect["y"], -_SAFE_INTEGER),
        width=_integer(rect["width"], 1),
        height=_integer(rect["height"], 1),
    )


def _bbox(value: object) -> _Rect:
    rect = _rect(value)
    _require(
        abs(rect.x) <= 2_147_483_647
        and abs(rect.y) <= 2_147_483_647
        and rect.width <= 2048
        and rect.height <= 2048
        and rect.width * rect.height <= 4_000_000,
        "LIMIT",
        "Canvas bbox exceeds the ordinary CPU geometry profile.",
    )
    _require(
        rect.width % 8 == 0 and rect.height % 8 == 0,
        "INPUT_INVALID",
        "Canvas bbox sides must be divisible by eight.",
    )
    return rect


def _coverage(value: object, bbox: _Rect, mask_revision: int) -> _WorldCoverage:
    record = _record(value, {"alpha", "bounds", "intersection", "kind"})
    bounds = _rect(record["bounds"])
    alpha = record["alpha"]
    kind = record["kind"]
    _require(bounds == bbox, "INPUT_INVALID", "Coverage bounds must equal the Canvas bbox.")
    _require(
        type(alpha) is bytes and len(alpha) == bbox.width * bbox.height,
        "INPUT_INVALID",
        "Coverage alpha requires exact immutable row-major bytes at bbox resolution.",
    )
    _require(
        type(kind) is str and kind in ("covered", "intersecting-empty", "empty", "outside"),
        "INPUT_INVALID",
        "Unknown Main coverage classification.",
    )
    intersection = None if record["intersection"] is None else _rect(record["intersection"])
    _require(
        (intersection is None) == (kind in ("empty", "outside"))
        and (kind == "empty" or mask_revision > 0),
        "INPUT_INVALID",
        "Coverage classification, intersection and mask revision are inconsistent.",
    )
    if intersection is not None:
        _require(
            bbox.x <= intersection.x
            and bbox.y <= intersection.y
            and intersection.x + intersection.width <= bbox.x + bbox.width
            and intersection.y + intersection.height <= bbox.y + bbox.height,
            "INPUT_INVALID",
            "Coverage intersection must lie inside its bbox.",
        )
        # Main clips world alpha to the intersection, without thresholding it.
        left, top = intersection.x - bbox.x, intersection.y - bbox.y
        right, bottom = left + intersection.width, top + intersection.height
        for row in range(bbox.height):
            start = row * bbox.width
            if top <= row < bottom:
                outside = any(alpha[start : start + left]) or any(
                    alpha[start + right : start + bbox.width]
                )
            else:
                outside = any(alpha[start : start + bbox.width])
            _require(not outside, "INPUT_INVALID", "Alpha is nonzero outside its intersection.")
    _require(
        bool(any(alpha)) == (kind == "covered"),
        "INPUT_INVALID",
        "Coverage kind must preserve whether any world-alpha sample is nonzero.",
    )
    return _WorldCoverage(bounds, alpha, cast(_CoverageKind, kind), intersection)


def _authored_ref(value: object) -> None:
    ref = _record(value, {"resource", "token"})
    _require(
        type(ref["token"]) is str and bool(ref["token"].strip()),
        "INPUT_INVALID",
        "Authored embedding literals must be nonempty strings.",
    )
    resource = _record(
        ref["resource"],
        {
            "baseModelFamily",
            "civitaiFileId",
            "civitaiModelId",
            "civitaiVersionId",
            "displayName",
            "fileSha256",
            "kind",
            "localModelId",
            "localVersionId",
            "predictionType",
            "versionName",
        },
    )
    _require(
        type(resource["kind"]) is str and resource["kind"] == "embedding",
        "INPUT_INVALID",
        "Authored regional references must describe embeddings.",
    )
    for key in ("displayName", "localModelId", "localVersionId", "versionName"):
        _require(
            type(resource[key]) is str and bool(resource[key].strip()),
            "INPUT_INVALID",
            "Authored resource labels must be nonempty strings.",
        )
    _require(
        type(resource["fileSha256"]) is str
        and _SHA256.fullmatch(resource["fileSha256"]) is not None,
        "INPUT_INVALID",
        "Authored resource hashes must be canonical SHA256 strings.",
    )
    for key in ("civitaiFileId", "civitaiModelId", "civitaiVersionId"):
        if resource[key] is not None:
            _integer(resource[key])
    for key, choices in (
        ("baseModelFamily", ("illustrious", "anima")),
        ("predictionType", ("epsilon", "v_prediction", "sample")),
    ):
        value = resource[key]
        _require(
            value is None or (type(value) is str and value in choices),
            "INPUT_INVALID",
            "Authored resource family or prediction type is malformed.",
        )


def _prompt(value: object, *, effective: bool, exact_ti: bool = False) -> str:
    prompt = _record(value, {"text", "embeddingRefs"})
    text, refs = prompt["text"], prompt["embeddingRefs"]
    _require(type(text) is str and type(refs) is list, "INPUT_INVALID", "Invalid prompt block.")
    _require(len(refs) <= 10_000, "LIMIT", "Authored prompt reference count exceeds Main's limit.")
    if effective:
        if exact_ti:
            _require(len(refs) <= 16, "LIMIT", "Too many active embedding references.")
            for ref in refs:
                _authored_ref(ref)
            _active_text(text, syntax_text=masked_ref_text(text, refs))
        else:
            _require(not refs, "UNSUPPORTED", "Effective embedding references are not supported.")
            _active_text(text)
    else:
        for ref in refs:
            _authored_ref(ref)
    return cast(str, text)


def _active_text(text: str, *, syntax_text: str | None = None) -> int:
    _require(len(text) <= _MAX_TEXT_BYTES, "LIMIT", "Active text exceeds 16 KiB UTF-8.")
    try:
        size = len(text.encode("utf-8", errors="strict"))
    except UnicodeEncodeError as error:
        raise IllustriousRegionalRecipeError(
            "INPUT_INVALID", "Active text is not UTF-8."
        ) from error
    _require(size <= _MAX_TEXT_BYTES, "LIMIT", "Active text exceeds 16 KiB UTF-8.")
    # This also rejects braces (including escaped braces) and resource markup.
    # Static syntax remains forbidden even if a literal happens to contain braces.
    if syntax_text is not None and any(char in text for char in "{}"):
        normalize_compel_prompt(text)
    normalize_compel_prompt(text if syntax_text is None else syntax_text)
    return size


def _authored(
    value: object,
    *,
    positive: str | None,
    negative: str,
    source: str,
    effective_positive: dict[str, Any] | None = None,
    effective_negative: dict[str, Any] | None = None,
    exact_ti: bool = False,
) -> None:
    record = _record(value, {"positive", "negative", "useGlobalNegativePrompt"})
    use_global = record["useGlobalNegativePrompt"]
    _require(type(use_global) is bool, "INPUT_INVALID", "Invalid authored negative selection.")
    authored_positive = (
        None if record["positive"] is None else _prompt(record["positive"], effective=False)
    )
    authored_negative = (
        None if record["negative"] is None else _prompt(record["negative"], effective=False)
    )
    _require(
        (authored_positive is not None or authored_negative is not None)
        and (authored_negative is not None or use_global)
        and positive == authored_positive
        and (source == "current-canvas") == use_global
        and (use_global or negative == authored_negative),
        "INPUT_INVALID",
        "Effective regional channels disagree with their authored selection.",
    )
    if exact_ti:
        if effective_positive is not None:
            validate_authored_selection(
                cast(dict[str, Any], record["positive"]), effective_positive
            )
        if not use_global:
            validate_authored_selection(
                cast(dict[str, Any], record["negative"]), cast(dict[str, Any], effective_negative)
            )


def _recipe(
    recipe: object, parameters: IllustriousInferenceParameters, *, exact_ti: bool = False
) -> tuple[_Rect, tuple[_Pair, ...]]:
    record = _record(
        recipe,
        {
            "kind",
            "bbox",
            "documentId",
            "documentRevision",
            "family",
            "globalPrompts",
            "item",
            "regions",
        }
        | ({"globalEmbeddings"} if exact_ti else set()),
        frozenset() if exact_ti else frozenset({"globalEmbeddings"}),
    )
    _require(
        exact_ti or "globalEmbeddings" not in record,
        "UNSUPPORTED",
        "Resolved TI resources require an explicit exact-TI encoding profile.",
    )
    _require(
        type(record["kind"]) is str and record["kind"] == "current-canvas-regional-recipe",
        "INPUT_INVALID",
        "Only the complete ordinary Current Canvas Main recipe is supported.",
    )
    _require(
        type(record["family"]) is str and record["family"] == "illustrious",
        "UNSUPPORTED",
        "Only the Illustrious family is supported.",
    )
    _identity(record["documentId"])
    _identity(record["documentRevision"])
    bbox = _bbox(record["bbox"])
    item = _record(record["item"], {"iteration", "promptPairIndex", "prompts", "seed"})
    _integer(item["iteration"])
    _integer(item["promptPairIndex"])
    seed = _integer(item["seed"], maximum=0xFFFFFFFF)
    _require(
        type(parameters) is IllustriousInferenceParameters,
        "INPUT_INVALID",
        "The exact base IllustriousInferenceParameters record is required.",
    )
    _require(
        _integer(parameters.seed, maximum=0xFFFFFFFF) == seed,
        "INPUT_INVALID",
        "Recipe seed must equal the supplied job seed.",
    )
    for entries in (
        parameters.positive_embeddings,
        parameters.negative_embeddings,
        parameters.loras,
    ):
        _require(
            type(entries) is tuple, "INPUT_INVALID", "Resource parameters require exact tuples."
        )
        _require(not entries, "UNSUPPORTED", "Embeddings and LoRAs are outside this profile.")
    prompts = _record(item["prompts"], {"positive", "negative"})
    global_prompts = _record(record["globalPrompts"], {"positive", "negative"})
    positive = _prompt(global_prompts["positive"], effective=True, exact_ti=exact_ti)
    negative = _prompt(global_prompts["negative"], effective=True, exact_ti=exact_ti)
    _require(
        type(prompts["positive"]) is str
        and type(prompts["negative"]) is str
        and type(parameters.positive_prompt) is str
        and type(parameters.negative_prompt) is str
        and prompts["positive"] == positive == parameters.positive_prompt
        and prompts["negative"] == negative == parameters.negative_prompt,
        "INPUT_INVALID",
        "Global text must exactly match the concrete item and supplied job parameters.",
    )
    regions = record["regions"]
    _require(type(regions) is list, "INPUT_INVALID", "Main regions require an exact ordered list.")
    _require(
        len(regions) <= _MAX_REGIONS, "LIMIT", "This private profile admits at most 3 regions."
    )
    owned: set[str] = set()
    global_resources = (
        recipe_embedding_resources(
            record["globalEmbeddings"],
            positive=global_prompts["positive"],
            negative=global_prompts["negative"],
        )
        if exact_ti
        else None
    )
    pairs = [_Pair("current-canvas", positive, negative, None, global_resources)]
    for value in regions:
        region = _record(
            value,
            {"coverage", "maskId", "maskRevision", "negative", "positive", "regionId"}
            | ({"embeddings"} if exact_ti else set()),
            frozenset({"authoredPrompts", "referenceImages"})
            | (frozenset[str]() if exact_ti else frozenset({"embeddings"})),
        )
        _require(
            exact_ti or "embeddings" not in region,
            "UNSUPPORTED",
            "Resolved regional TI resources require an explicit exact-TI encoding profile.",
        )
        region_id = _identity(region["regionId"], owned)
        _identity(region["maskId"], owned)
        mask_revision = _integer(region["maskRevision"])
        positive = (
            None
            if region["positive"] is None
            else _prompt(region["positive"], effective=True, exact_ti=exact_ti)
        )
        resolved = _record(region["negative"], {"prompt", "source"})
        source = resolved["source"]
        _require(
            type(source) is str and source in ("current-canvas", "regional"),
            "INPUT_INVALID",
            "Regional negative source must be explicit.",
        )
        # Keep the local-vs-inherited selection explicit; local empty stays local.
        local_negative = _prompt(resolved["prompt"], effective=True, exact_ti=exact_ti)
        if source == "current-canvas":
            _require(
                local_negative == pairs[0].negative
                and (
                    not exact_ti
                    or prompt_ref_keys(resolved["prompt"])
                    == prompt_ref_keys(global_prompts["negative"])
                ),
                "INPUT_INVALID",
                "An inherited effective negative must equal the global negative prompt.",
            )
            negative = pairs[0].negative
        else:
            negative = local_negative
        if "authoredPrompts" in region:
            _authored(
                region["authoredPrompts"],
                positive=positive,
                negative=negative,
                source=source,
                effective_positive=region["positive"],
                effective_negative=resolved["prompt"],
                exact_ti=exact_ti,
            )
        if "referenceImages" in region:
            refs = region["referenceImages"]
            _require(type(refs) is list, "INPUT_INVALID", "Reference images require an exact list.")
            _require(not refs, "UNSUPPORTED", "Enabled reference images are not supported.")
        coverage = _coverage(region["coverage"], bbox, mask_revision)
        resources = (
            recipe_embedding_resources(
                region["embeddings"], positive=region["positive"], negative=resolved["prompt"]
            )
            if exact_ti
            else None
        )
        pairs.append(_Pair(region_id, positive, negative, coverage, resources))
    # Includes omitted positives' technical empty input and every repeated inheritance.
    signed = tuple(text for pair in pairs for text in (pair.positive or "", pair.negative))
    _require(len(signed) <= 8, "LIMIT", "Too many signed pair inputs.")
    _require(
        sum(len(text.encode("utf-8")) for text in signed) <= _MAX_PAIR_TEXT_BYTES,
        "LIMIT",
        "Aggregate active pair text exceeds 128 KiB UTF-8.",
    )
    return bbox, tuple(pairs)


def _explicit_coverage(value: object, shape: Shape) -> Everywhere | Alpha8:
    if type(value) is Everywhere:
        return Everywhere()
    _require(
        type(value) is Alpha8,
        "INPUT_INVALID",
        "Global coverage must be explicit Everywhere/Alpha8.",
    )
    alpha = cast(Alpha8, value)
    _require(
        type(alpha.shape) is Shape
        and type(alpha.shape.height) is int
        and type(alpha.shape.width) is int
        and alpha.shape == shape
        and type(alpha.samples) is bytes
        and len(alpha.samples) == shape.height * shape.width,
        "INPUT_INVALID",
        "Explicit global alpha must match the derived latent grid.",
    )
    return Alpha8(Shape(shape.height, shape.width), alpha.samples)


def _native_runtime(
    runtime: MLRuntime, tensor_profile: _TensorProfile = "cpu-float32-v1"
) -> tuple[Any, Any, Any, Any]:
    _require(type(runtime) is MLRuntime, "PROFILE_INVALID", "Expected the exact MLRuntime record.")
    native = _load_native()
    torch = native[0]
    policy = _tensor_policy(torch, tensor_profile)
    diffusers = cast(Any, importlib.import_module("diffusers"))
    compel = cast(Any, importlib.import_module("compel"))
    transformers = cast(Any, importlib.import_module("transformers"))
    _require(
        runtime.torch is torch
        and runtime.diffusers is diffusers
        and runtime.compel is compel
        and transformers.__version__ == "5.5.4"
        and importlib.metadata.version("compel") == "2.4.0",
        "PROFILE_INVALID",
        "The runtime must contain the actual pinned ML modules.",
    )
    _require(
        not torch.is_grad_enabled()
        and not torch.is_autocast_enabled("cpu")
        and (policy.device.type != "cuda" or not torch.is_autocast_enabled("cuda")),
        "PROFILE_INVALID",
        "Autograd and profile autocast must be disabled.",
    )
    return torch, diffusers, compel, transformers


def _pipeline_parts(pipeline: Any, diffusers: Any, transformers: Any) -> tuple[Any, ...]:
    _require(
        type(pipeline) is diffusers.StableDiffusionXLPipeline,
        "PROFILE_INVALID",
        "Expected the exact standard StableDiffusionXLPipeline.",
    )
    parts = (
        pipeline.tokenizer,
        pipeline.tokenizer_2,
        pipeline.text_encoder,
        pipeline.text_encoder_2,
        pipeline.unet,
    )
    _require(
        type(parts[0]) in (transformers.CLIPTokenizer, transformers.CLIPTokenizerFast)
        and type(parts[1]) in (transformers.CLIPTokenizer, transformers.CLIPTokenizerFast)
        and type(parts[2]) is transformers.CLIPTextModel
        and type(parts[3]) is transformers.CLIPTextModelWithProjection
        and type(parts[4]) is diffusers.UNet2DConditionModel,
        "PROFILE_INVALID",
        "The pipeline requires standard CLIP tokenizers, paired CLIPs and native UNet.",
    )
    return parts


@contextmanager
def _reservation(objects: tuple[Any, ...]) -> Generator[None]:
    # The local objects tuple keeps every reserved identity alive until release.
    identities = {id(value) for value in objects}
    owner = object()
    with _RESERVATIONS_LOCK:
        _require(
            identities.isdisjoint(_RESERVATIONS),
            "SCOPE_CONFLICT",
            "An overlapping pipeline/tokenizer/CLIP/UNet is already in use by this consumer.",
        )
        for identity in identities:
            _RESERVATIONS[identity] = owner
    try:
        yield
    finally:
        with _RESERVATIONS_LOCK:
            for identity in identities:
                if _RESERVATIONS.get(identity) is owner:
                    del _RESERVATIONS[identity]


def _module_profile(
    torch: Any,
    modules: tuple[Any, ...],
    tensor_profile: _TensorProfile = "cpu-float32-v1",
    *,
    shared_readonly: bool = False,
) -> None:
    _runtime(torch, modules, tensor_profile)
    quick_gelu_type = cast(
        Any, importlib.import_module("transformers.activations")
    ).QuickGELUActivation
    gelu_type = (
        cast(Any, importlib.import_module("transformers.activations")).GELUActivation
        if shared_readonly
        else None
    )
    for module in modules:
        cls = cast(Any, type(module))
        native_namespace = (
            cls.__module__.startswith(
                ("torch.nn.", "diffusers.models.", "transformers.models.clip.")
            )
            or cls is quick_gelu_type
            or (shared_readonly and cls is gelu_type)
        )
        _require(
            not any(
                key in module.__dict__
                for key in (
                    "forward",
                    "__call__",
                    "_call_impl",
                    "_wrapped_call_impl",
                    "_slow_forward",
                )
            )
            and getattr(module, "_compiled_call_impl", None) is None
            and not hasattr(module, "_orig_mod")
            and not hasattr(module, "_hf_hook")
            and native_namespace
            and getattr(importlib.import_module(cls.__module__), cls.__name__, None) is cls
            and all(
                getattr(getattr(module, slot), "__func__", None) is getattr(cls, slot)
                and getattr(getattr(module, slot), "__self__", None) is module
                for slot in ("_call_impl", "_wrapped_call_impl", "_slow_forward")
            ),
            "PROFILE_INVALID",
            "Used modules require standard uncompiled, unshadowed, non-offloaded native calls.",
        )
        if shared_readonly and cls is gelu_type:
            _require(
                module.act is torch.nn.functional.gelu,
                "PROFILE_INVALID",
                "Shared native GELU requires its exact pure builtin activation.",
            )
        _require(
            not getattr(module, "_hf_peft_config_loaded", False)
            and not getattr(module, "peft_config", None)
            and getattr(module, "lora_layer", None) is None
            and not any(hasattr(module, name) for name in ("lora_A", "lora_B", "lora_embedding_A")),
            "UNSUPPORTED",
            "Preloaded adapters are outside this profile.",
        )


def _pipeline_profile(pipeline: Any, diffusers: Any) -> None:
    _require(
        not any(
            key in pipeline.__dict__ for key in ("__call__", "_call_impl", "_wrapped_call_impl")
        )
        and getattr(pipeline, "_compiled_call_impl", None) is None
        and not getattr(pipeline, "_all_hooks", ())
        and not getattr(pipeline, "hf_device_map", None)
        and getattr(pipeline, "final_offload_hook", None) is None
        and not hasattr(pipeline, "_hf_hook"),
        "PROFILE_INVALID",
        "Pipeline custom call paths and offloading are unsupported.",
    )
    vae = pipeline.vae
    _require(
        type(vae) is diffusers.AutoencoderKL
        and type(pipeline.vae_scale_factor) is int
        and pipeline.vae_scale_factor == 8
        and len(vae.config.block_out_channels) == 4
        and tuple(vae.config.down_block_types) == ("DownEncoderBlock2D",) * 4
        and tuple(vae.config.up_block_types) == ("UpDecoderBlock2D",) * 4
        and len(vae.encoder.down_blocks) == 4
        and len(vae.decoder.up_blocks) == 4
        and all(type(width) is int and width > 0 for width in vae.config.block_out_channels)
        and type(vae.config.in_channels) is int
        and vae.config.in_channels == 3
        and type(vae.config.out_channels) is int
        and vae.config.out_channels == 3
        and type(vae.config.latent_channels) is int
        and vae.config.latent_channels == 4,
        "PROFILE_INVALID",
        "Ordinary Canvas requires the standard four-stage AutoencoderKL / scale factor 8.",
    )


def _clip_profile(tokenizer: Any, encoder: Any, width: int, *, projected: bool) -> None:
    config = encoder.config
    embedding = encoder.get_input_embeddings()
    _require(
        type(config.hidden_size) is int
        and config.hidden_size == width
        and type(config.max_position_embeddings) is int
        and config.max_position_embeddings == 77
        and (
            not projected
            or (
                type(config.projection_dim) is int
                and config.projection_dim == 1280
                and tuple(encoder.text_projection.weight.shape) == (1280, 1280)
            )
        )
        and tuple(embedding.weight.shape) == (config.vocab_size, width)
        and tuple(encoder.text_model.embeddings.position_embedding.weight.shape) == (77, width),
        "PROFILE_INVALID",
        "CLIPs require widths 768/1280, 77 positions and compatible embedding tables.",
    )
    _require(
        not any(
            key in tokenizer.__dict__
            for key in (
                "__call__",
                "encode",
                "tokenize",
                "get_vocab",
                "get_added_vocab",
                "_call_one",
                "_encode_plus",
                "_batch_encode_plus",
                "convert_tokens_to_ids",
            )
        )
        and type(tokenizer.model_max_length) is int
        and tokenizer.model_max_length == 77,
        "PROFILE_INVALID",
        "Tokenizer custom call paths or nonstandard position limits are unsupported.",
    )
    vocab = tokenizer.get_vocab()
    _require(
        type(vocab) is dict
        and type(config.vocab_size) is int
        and len(vocab) == len(tokenizer) == config.vocab_size
        and all(type(token) is str and type(index) is int for token, index in vocab.items())
        and set(vocab.values()) == set(range(config.vocab_size)),
        "PROFILE_INVALID",
        "Tokenizer vocabulary must exactly fit its CLIP embedding table.",
    )
    added = tokenizer.get_added_vocab()
    _require(type(added) is dict, "PROFILE_INVALID", "Malformed added tokenizer vocabulary.")
    specials = set(tokenizer.all_special_tokens)
    special_ids = set(tokenizer.all_special_ids)
    for token, index in added.items():
        _require(
            token in specials
            and index in special_ids
            and vocab.get(token) == index
            and getattr(tokenizer.added_tokens_decoder.get(index), "special", False) is True,
            "UNSUPPORTED",
            "Non-special added vocabulary/preloaded textual inversion is unsupported.",
        )
    _require(
        all(type(index) is int and 0 <= index < config.vocab_size for index in special_ids),
        "PROFILE_INVALID",
        "Tokenizer special IDs must fit its embedding table.",
    )


def _unet_profile(root: Any) -> None:
    config = root.config
    addition_dim = config.addition_time_embed_dim
    _require(
        type(config.in_channels) is int
        and config.in_channels == 4
        and type(config.out_channels) is int
        and config.out_channels == 4
        and type(config.cross_attention_dim) is int
        and config.cross_attention_dim == 2048
        and config.addition_embed_type == "text_time"
        and type(addition_dim) is int
        and addition_dim > 0
        and type(config.projection_class_embeddings_input_dim) is int
        and config.projection_class_embeddings_input_dim == 1280 + 6 * addition_dim
        and root.add_embedding.linear_1.in_features == config.projection_class_embeddings_input_dim
        and root.class_embedding is None
        and config.time_cond_proj_dim is None
        and root.time_embedding.cond_proj is None,
        "PROFILE_INVALID",
        "UNet requires ordinary four-channel SDXL text_time with no time-conditioned CFG.",
    )


def _native_arguments(
    torch: Any,
    root: Any,
    shape: Shape,
    layout: _Layout,
    sample: Any,
    timestep: Any,
    time_ids: Any,
    tensor_profile: _TensorProfile = "cpu-float32-v1",
) -> tuple[Any, Any, Any]:
    batch = 2 if layout == "cfg-negative-first" else 1
    _unet_profile(root)
    _tensor(torch, sample, 4, tensor_profile)
    _tensor(torch, timestep, 0, tensor_profile, timestep=True)
    _tensor(torch, time_ids, 2, tensor_profile)
    _require(
        tuple(sample.shape) == (batch, 4, shape.height, shape.width)
        and tuple(time_ids.shape) == (batch, 6),
        "INPUT_INVALID",
        "Native sample/time IDs must match the derived grid and explicit CFG layout.",
    )
    _require(
        sample.numel() * sample.element_size() <= _MAX_SAMPLE_BYTES,
        "LIMIT",
        "Sample exceeds the 32 MiB cap.",
    )
    for value in (sample, timestep, time_ids):
        _finite(torch, value)
    return (
        sample.clone(memory_format=torch.contiguous_format),
        timestep.clone(),
        time_ids.clone(memory_format=torch.contiguous_format),
    )


def _builders(
    pipeline: Any, compel: Any, managers: tuple[Any, Any] = (None, None)
) -> tuple[Any, Any]:
    return cast(
        tuple[Any, Any],
        tuple(
            compel.Compel(
                tokenizer=tokenizer,
                text_encoder=encoder,
                returned_embeddings_type=compel.ReturnedEmbeddingsType.PENULTIMATE_HIDDEN_STATES_NON_NORMALIZED,
                truncate_long_prompts=False,
                split_long_text_mode=compel.SplitLongTextMode.SENTENCES,
                requires_pooled=pooled,
                textual_inversion_manager=manager,
            )
            for tokenizer, encoder, pooled, manager in (
                (pipeline.tokenizer, pipeline.text_encoder, False, managers[0]),
                (pipeline.tokenizer_2, pipeline.text_encoder_2, True, managers[1]),
            )
        ),
    )


def _lengths(
    pairs: tuple[_Pair, ...],
    parameters: IllustriousInferenceParameters,
    pipeline: Any,
    compel: Any,
    *,
    commands: tuple[IllustriousInferenceParameters, ...] | None = None,
    embedding_inputs: tuple[EmbeddingConditioningInputs, ...] | None = None,
) -> tuple[tuple[int, int], ...]:
    builders = _builders(
        pipeline, compel, (None, None) if embedding_inputs is None else embedding_inputs[0].managers
    )
    lengths: list[tuple[int, int]] = []
    for index, pair in enumerate(pairs):
        command = (
            replace(parameters, positive_prompt=pair.positive or "", negative_prompt=pair.negative)
            if commands is None
            else commands[index]
        )
        # Preserve the unchanged producer's own refusal checks as well. Only
        # the actual expanded splitters below determine emitted row lengths.
        normalized = (
            validate_pipeline_prompts(command, pipeline)
            if embedding_inputs is None
            else validate_pipeline_prompts(
                command, pipeline, effective_prompts=embedding_inputs[index].prompts
            )
        )
        signed: list[int] = []
        for prompt in normalized:
            # Even technical empty positives pass both actual parsers/splitters.
            expanded = tuple(expanded_conditioning_length(builder, prompt) for builder in builders)
            length = 77 if prompt == "" else max(expanded)
            _require(
                1 <= length <= _MAX_SIGN_LENGTH and length % 77 == 0,
                "INPUT_INVALID",
                "Actual Compel splitting must yield complete non-truncated CLIP chunks.",
            )
            signed.append(length)
        lengths.append((signed[0], signed[1]))
    _require(
        sum(length[1] for length in lengths) <= _MAX_SIGN_LENGTH
        and sum(
            length[0]
            for pair, length in zip(pairs, lengths, strict=True)
            if pair.positive is not None
        )
        <= _MAX_SIGN_LENGTH,
        "LIMIT",
        "An emitted sign exceeds 308 actual dual-CLIP rows.",
    )
    return tuple(lengths)


def _active_support(plan: AttentionPlan, bindings: tuple[TransformerBinding, ...]) -> None:
    # With prior mask None support is identical across heads. Use the existing
    # plan query API rather than materializing an expanded native attention mask.
    for factor in {binding.factor for binding in bindings}:
        shape = Shape(
            (plan.latent_shape.height + factor - 1) // factor,
            (plan.latent_shape.width + factor - 1) // factor,
        )
        view = plan.query(factor=factor, shape=shape, key_length=plan.key_length)
        for batch in range(len(plan.batch_signs)):
            for query in range(shape.height * shape.width):
                if not view.allowed_ranges(batch_index=batch, query_index=query):
                    raise IllustriousRegionalAdapterError(
                        "ALL_MASKED", "An active batch/query row has no allowed key."
                    )


def _reject_global_forward_hooks() -> None:
    hooks = cast(Any, importlib.import_module("torch.nn.modules.module"))
    _require(
        not hooks._global_forward_pre_hooks and not hooks._global_forward_hooks,
        "PROFILE_INVALID",
        "Global Torch forward pre/post hooks are outside this private profile.",
    )


def _equal_hook_value(
    before: Any,
    after: Any,
    *,
    torch: Any,
    output_types: tuple[type[Any], ...],
    tensor_profile: _TensorProfile = "cpu-float32-v1",
) -> bool:
    """Compare finite native values without arbitrary equality or unbounded trees.

    Identity is sufficient under the explicit no-in-place-mutation contract.
    Distinct tensors retain exact native profiles and finite values, while
    distinct ModelOutputs retain both ordered mappings and dataclass attributes.
    """
    remaining = _MAX_HOOK_NODES
    policy = _tensor_policy(torch, tensor_profile)
    allowed_dtypes = (torch.bool, torch.int32, torch.int64, torch.float32)
    if policy.device.type == "cuda":
        # Native CLIP attention may retain float32 masks/softmax intermediates
        # beside half model values. Metadata retains its native integer/bool role.
        allowed_dtypes += (torch.float16,)

    def same(expected: Any, actual: Any, depth: int) -> bool:
        nonlocal remaining
        remaining -= 1
        if remaining < 0 or depth >= _MAX_HOOK_DEPTH or type(expected) is not type(actual):
            return False
        value_type = cast(type[Any], type(expected))
        if value_type is torch.Tensor:
            if not (
                expected.device == actual.device == policy.device
                and expected.layout == actual.layout == torch.strided
                and expected.dtype == actual.dtype
                and expected.dtype in allowed_dtypes
                and tuple(expected.shape) == tuple(actual.shape)
                and expected.requires_grad is False
                and actual.requires_grad is False
            ):
                return False
            return expected is actual or bool(
                torch.isfinite(expected).all().item()
                and torch.isfinite(actual).all().item()
                and torch.equal(expected, actual)
            )
        if expected is None or value_type in (bool, int, str):
            return bool(expected == actual)
        if value_type in (tuple, list):
            if expected is actual:
                return True
            return (
                len(expected) == len(actual)
                and len(expected) <= remaining
                and all(
                    same(left, right, depth + 1)
                    for left, right in zip(expected, actual, strict=True)
                )
            )
        if value_type is dict or value_type in output_types:
            if expected is actual:
                return True
            if not (
                len(expected) == len(actual)
                and len(expected) <= remaining
                and all(type(key) is str for key in expected)
                and all(type(key) is str for key in actual)
            ):
                return False
            if value_type is dict:
                if expected.keys() != actual.keys():
                    return False
            elif tuple(expected.keys()) != tuple(actual.keys()):
                return False
            if not all(same(expected[key], actual[key], depth + 1) for key in expected):
                return False
            # ModelOutput consumers use attributes as well as ordered mappings;
            # checking keys alone would miss a divergent dataclass attribute.
            return value_type is dict or all(
                same(getattr(expected, field.name), getattr(actual, field.name), depth + 1)
                for field in fields(expected)
            )
        return False

    return same(before, after, 0)


def _bound_hook_call(
    signature: inspect.Signature, module: Any, args: Any, kwargs: Any, *, partial: bool
) -> dict[str, Any]:
    _require(
        type(args) is tuple and type(kwargs) is dict,
        "INPUT_INVALID",
        "CLIP hook replacements require native argument tuples and keyword dictionaries.",
    )
    try:
        bind = signature.bind_partial if partial else signature.bind
        bound: inspect.BoundArguments = bind(
            module, *cast(tuple[Any, ...], args), **cast(dict[str, Any], kwargs)
        )
        bound.apply_defaults()
    except TypeError as error:
        raise IllustriousRegionalRecipeError(
            "INPUT_INVALID", "CLIP hook replacement does not bind the native forward signature."
        ) from error
    # Own the structural binding and variadic kwargs entries while retaining
    # tensor references under the cooperative no-tensor-in-place contract.
    return {
        name: dict(value)
        if signature.parameters[name].kind is inspect.Parameter.VAR_KEYWORD
        else value
        for name, value in bound.arguments.items()
        if name != "self"
    }


def _clip_hook_guard(
    hook: Any,
    *,
    pre: bool,
    with_kwargs: bool,
    signature: inspect.Signature,
    torch: Any,
    output_types: tuple[type[Any], ...],
    tensor_profile: _TensorProfile = "cpu-float32-v1",
) -> Any:
    def guarded(*hook_args: Any) -> Any:
        # Native dispatch owns ordering, exception handling and always_call.
        # Every invocation calls the original exactly once, including observers.
        if pre:
            module, args = hook_args[:2]
            kwargs: dict[str, Any] = hook_args[2] if with_kwargs else {}
            # Snapshot semantic entries before the callback: even a None return
            # can otherwise retarget the call by replacing a kwargs entry.
            before = _bound_hook_call(signature, module, args, kwargs, partial=not with_kwargs)
            result = hook(*hook_args)
            if result is None:
                next_args, next_kwargs = args, kwargs
            elif with_kwargs:
                _require(
                    type(result) is tuple and len(result) == 2,
                    "INPUT_INVALID",
                    "CLIP kwargs prehooks must return None or a native (args, kwargs) pair.",
                )
                next_args, next_kwargs = cast(tuple[Any, Any], result)
            else:
                # Match Torch's positional-only prehook return normalization.
                next_args = (
                    cast(tuple[Any, ...], result) if isinstance(result, tuple) else (result,)
                )
                next_kwargs = kwargs
            # Torch does not expose kwargs to positional-only hooks and leaves
            # them untouched. Bind their visible positional portion partially;
            # kwargs hooks bind the complete call, including moved positions.
            after = _bound_hook_call(
                signature, module, next_args, next_kwargs, partial=not with_kwargs
            )
        else:
            result = hook(*hook_args)
            if result is None:
                return None
            before, after = hook_args[-1], result
        _require(
            _equal_hook_value(
                before,
                after,
                torch=torch,
                output_types=output_types,
                tensor_profile=tensor_profile,
            ),
            "INPUT_INVALID",
            "CLIP hook replacement must retain the exact finite native values and profiles.",
        )
        return result

    return guarded


@contextmanager
def _scoped_clip_hook_guards(
    torch: Any, modules: tuple[Any, ...], tensor_profile: _TensorProfile = "cpu-float32-v1"
) -> Generator[None]:
    """Guard existing local entries without adding keys or changing native flags.

    Setup belongs to the journal's try/finally, including a failing assignment or
    wrapper construction. The caller forbids registration/removal while active.
    No call-entry slot, global registry or attention processor is owned here.
    """
    outputs = cast(Any, importlib.import_module("transformers.modeling_outputs"))
    clip = cast(Any, importlib.import_module("transformers.models.clip.modeling_clip"))
    output_types = (
        outputs.BaseModelOutput,
        outputs.BaseModelOutputWithPooling,
        clip.CLIPTextModelOutput,
    )
    journal: list[tuple[Any, int, Any]] = []
    seen: set[int] = set()
    try:
        for module in modules:
            if id(module) in seen:
                continue
            seen.add(id(module))
            signature = inspect.signature(cast(Any, type(module)).forward)
            for pre, registry, kwargs_flags in (
                (True, module._forward_pre_hooks, module._forward_pre_hooks_with_kwargs),
                (False, module._forward_hooks, module._forward_hooks_with_kwargs),
            ):
                for key, original in tuple(registry.items()):
                    journal.append((registry, key, original))
                    registry[key] = _clip_hook_guard(
                        original,
                        pre=pre,
                        with_kwargs=key in kwargs_flags,
                        signature=signature,
                        torch=torch,
                        output_types=output_types,
                        tensor_profile=tensor_profile,
                    )
        yield
    finally:
        for registry, key, original in reversed(journal):
            registry[key] = original


def _recipe_inputs(
    recipe: object,
    parameters: IllustriousInferenceParameters,
    profile: _Profile,
    layout: _Layout,
    global_negative_coverage: Everywhere | Alpha8,
    global_positive_coverage: Everywhere | Alpha8,
    negative_pooled_source_id: str,
    positive_pooled_source_id: str,
) -> tuple[
    _Rect,
    tuple[_Pair, ...],
    IllustriousInferenceParameters,
    Shape,
    Everywhere | Alpha8,
    Everywhere | Alpha8,
]:
    """Private shared input preflight; no model, tokenization or owned mutation."""
    _encoding_tensor_profile(profile)
    bbox, pairs = _recipe(recipe, parameters, exact_ti=profile in _TI_PROFILES)
    # A private base-record copy also prevents callbacks from retargeting later
    # pairs by altering the borrowed parameters through dataclass escape hatches.
    parameters = replace(parameters)
    _require(
        type(layout) is str and layout in ("cfg-negative-first", "positive-only"),
        "INPUT_INVALID",
        "An explicit supported batch layout is required.",
    )
    cfg = parameters.cfg_scale
    _require(
        type(cfg) in (float, int) and math.isfinite(cfg) and cfg >= 0,
        "INPUT_INVALID",
        "CFG scale must be a finite nonnegative number, excluding bool.",
    )
    _require(
        (layout == "cfg-negative-first") == (cfg > 1),
        "PROFILE_INVALID",
        "Explicit layout must agree with ordinary SDXL's CFG predicate.",
    )
    for source, eligible in (
        (negative_pooled_source_id, {pair.binding_id for pair in pairs}),
        (
            positive_pooled_source_id,
            {pair.binding_id for pair in pairs if pair.positive is not None},
        ),
    ):
        _require(
            type(source) is str and source in eligible,
            "INPUT_INVALID",
            "Each pooled source must explicitly select an existing emitted source of that sign.",
        )
    shape = Shape(bbox.height // 8, bbox.width // 8)
    global_negative = _explicit_coverage(global_negative_coverage, shape)
    global_positive = _explicit_coverage(global_positive_coverage, shape)
    return bbox, pairs, parameters, shape, global_negative, global_positive


def _recipe_model_preflight(
    pipeline: Any,
    torch: Any,
    diffusers: Any,
    parts: tuple[Any, ...],
    clip_modules: tuple[Any, ...],
    tensor_profile: _TensorProfile = "cpu-float32-v1",
    *,
    shared_readonly: bool = False,
) -> None:
    _pipeline_profile(pipeline, diffusers)
    _module_profile(torch, clip_modules, tensor_profile, shared_readonly=shared_readonly)
    # In pinned Transformers the decorated capture owners are the two
    # inner CLIPTextTransformers. Their first hidden-state forward installs
    # persistent native hooks and this flag. Require setup before this call
    # so the consumer never warms, repairs or mutates model hook state.
    _require(
        all(
            getattr(encoder.text_model, "_output_capturing_hooks_installed", False) is True
            for encoder in parts[2:4]
        ),
        "PROFILE_INVALID",
        "Both CLIPs require native output-capturing hooks installed before this call.",
    )
    _clip_profile(parts[0], parts[2], 768, projected=False)
    _clip_profile(parts[1], parts[3], 1280, projected=True)


def _recipe_adapter_preflight(unet_modules: tuple[Any, ...]) -> None:
    # Preserve the existing adapter's overlap identity before inspecting its
    # legitimately owned call-entry slots or allocating any TI copies.
    with _OWNERS_LOCK:
        if any(id(module) in _OWNERS for module in unet_modules):
            raise IllustriousRegionalAdapterError(
                "SCOPE_CONFLICT", "An overlapping root/module already belongs to another scope."
            )


def _encode_recipe_bindings(
    *,
    bbox: _Rect,
    pairs: tuple[_Pair, ...],
    parameters: IllustriousInferenceParameters,
    shape: Shape,
    global_negative: Everywhere | Alpha8,
    global_positive: Everywhere | Alpha8,
    pipeline: Any,
    runtime: MLRuntime,
    torch: Any,
    compel: Any,
    parts: tuple[Any, ...],
    clip_modules: tuple[Any, ...],
    unet_modules: tuple[Any, ...],
    bindings: tuple[TransformerBinding, ...],
    layout: _Layout,
    tensor_profile: _TensorProfile = "cpu-float32-v1",
    embedding_strategy: _EmbeddingStrategy = "independent-copy",
) -> tuple[AttentionPlan, tuple[EncodedTensorBinding, ...], tuple[EncodedTensorBinding, ...]]:
    """Preflight all streams, then encode each once under the existing CLIP guards."""
    ti = None
    if pairs[0].resources is not None:
        _recipe_adapter_preflight(unet_modules)
        ti = prepare_regional_embeddings(
            tuple(cast(RegionalEmbeddingResources, pair.resources) for pair in pairs),
            tuple((pair.positive or "", pair.negative) for pair in pairs),
            parameters,
            pipeline,
            torch,
            clip_modules,
            strategy=embedding_strategy,
        )
    lengths = (
        _lengths(pairs, parameters, pipeline, compel)
        if ti is None
        else _lengths(
            pairs, parameters, ti.staged, compel, commands=ti.commands, embedding_inputs=ti.inputs
        )
    )
    coverage: list[tuple[Everywhere | Alpha8, Everywhere | Alpha8]] = []
    for pair in pairs:
        if pair.coverage is None:
            coverage.append((global_negative, global_positive))
        else:
            world = pair.coverage
            latent = ordinary_canvas_coverage_to_latent(
                alpha=world.alpha,
                coverage_bounds=cast(Any, world.bounds.mapping()),
                bbox=cast(Any, bbox.mapping()),
                latent_shape=shape,
                profile="ordinary-canvas-origin-nearest8-v1",
            )
            # All four world kinds stay in the detached pair. A zero latent
            # plane remains zero regardless of the original classification.
            coverage.append((latent, latent))
    negative_segments = tuple(
        EncodedSegment(pair.binding_id, length[1], covers[0])
        for pair, length, covers in zip(pairs, lengths, coverage, strict=True)
    )
    positive_segments = tuple(
        EncodedSegment(pair.binding_id, length[0], covers[1])
        for pair, length, covers in zip(pairs, lengths, coverage, strict=True)
        if pair.positive is not None
    )
    plan = plan_illustrious_attention(
        latent_shape=shape,
        negative=negative_segments,
        positive=positive_segments,
        profile="alpha8-ge128-ceil2x2-max-v1",
        layout=layout,
    )
    # The old read-only validator also refuses an already active old scope,
    # and checks every binding/model/expanded-mask budget before encoding.
    validate_illustrious_regional_attention(
        parts[4], bindings=bindings, plan=plan, tensor_profile=tensor_profile
    )
    _module_profile(torch, unet_modules, tensor_profile)
    for binding in bindings:
        _require(
            type(binding.transformer.config.cross_attention_dim) is int
            and binding.transformer.config.cross_attention_dim == 2048
            and all(
                block.attn2.to_k.in_features == 2048
                for block in binding.transformer.transformer_blocks
            ),
            "PROFILE_INVALID",
            "Every bound cross-attention site requires context width 2048.",
        )
    _active_support(plan, bindings)
    negative_bindings: list[EncodedTensorBinding] = []
    positive_bindings: list[EncodedTensorBinding] = []
    execution = (
        nullcontext((pipeline, None))
        if ti is None
        else installed_regional_embeddings(
            ti, pipeline, torch, cuda=tensor_profile == "cuda-float16-v1"
        )
    )
    with execution as (working, inputs):
        guards = (
            _scoped_clip_hook_guards(torch, clip_modules, tensor_profile)
            if ti is None
            else nullcontext()
        )
        with guards:
            for index, (pair, length, covers) in enumerate(
                zip(pairs, lengths, coverage, strict=True)
            ):
                positive_text = pair.positive if pair.positive is not None else ""
                command = (
                    replace(
                        parameters, positive_prompt=positive_text, negative_prompt=pair.negative
                    )
                    if ti is None
                    else ti.commands[index]
                )
                conditioning = build_sdxl_conditioning(
                    command,
                    working,
                    runtime,
                    embedding_inputs=EmbeddingConditioningInputs(
                        (positive_text, pair.negative), (None, None)
                    )
                    if inputs is None
                    else inputs[index],
                )
                _require(
                    type(conditioning.positive_length) is int
                    and type(conditioning.negative_length) is int
                    and (conditioning.positive_length, conditioning.negative_length) == length,
                    "INPUT_INVALID",
                    "Actual dual-CLIP true lengths differ from the all-pairs preflight.",
                )
                converted = encoded_bindings_from_sdxl_conditioning(
                    pair.binding_id,
                    conditioning,
                    negative_coverage=covers[0],
                    positive_coverage=covers[1],
                    tensor_profile=tensor_profile,
                )
                negative_bindings.append(converted.negative)
                if pair.positive is not None:
                    positive_bindings.append(converted.positive)
    return plan, tuple(negative_bindings), tuple(positive_bindings)


def run_current_canvas_regional_recipe(
    recipe: object,
    *,
    pipeline: Any,
    runtime: MLRuntime,
    parameters: IllustriousInferenceParameters,
    profile: _Profile,
    global_negative_coverage: Everywhere | Alpha8,
    global_positive_coverage: Everywhere | Alpha8,
    negative_pooled_source_id: str,
    positive_pooled_source_id: str,
    bindings: tuple[TransformerBinding, ...],
    layout: _Layout,
    sample: Any,
    timestep: Any,
    time_ids: Any,
) -> Any:
    """Encode the captured ordered streams and return the original native result.

    Every keyword is explicit. Global coverages and signed pools are caller
    choices within this private candidate. No background/inverse, deduplication,
    fallback, image adapter, reusable tensor bank or denoising loop is inferred.
    """
    bbox, pairs, parameters, shape, global_negative, global_positive = _recipe_inputs(
        recipe,
        parameters,
        profile,
        layout,
        global_negative_coverage,
        global_positive_coverage,
        negative_pooled_source_id,
        positive_pooled_source_id,
    )
    tensor_profile = _encoding_tensor_profile(profile)
    torch, diffusers, compel, transformers = _native_runtime(runtime, tensor_profile)
    _reject_global_forward_hooks()
    parts = _pipeline_parts(pipeline, diffusers, transformers)
    embedding_strategy = _encoding_embedding_strategy(profile)
    tree = bounded_ti_module_tree if profile in _TI_PROFILES else _module_tree
    clip_modules = tree(parts[2]) + tree(parts[3])
    unet_modules = _module_tree(parts[4])
    tokenizer_backends = tuple(
        backend
        for tokenizer in parts[:2]
        if (backend := getattr(tokenizer, "backend_tokenizer", None)) is not None
    )
    # Reserve only objects used by this call; the global runtime and unused VAE
    # do not serialize otherwise disjoint pipelines.
    with _reservation((pipeline, *parts, *tokenizer_backends, *clip_modules, *unet_modules)):
        _recipe_model_preflight(
            pipeline,
            torch,
            diffusers,
            parts,
            clip_modules,
            tensor_profile,
            shared_readonly=embedding_strategy == "shared-readonly",
        )
        _recipe_adapter_preflight(unet_modules)
        _module_profile(torch, unet_modules, tensor_profile)
        owned_sample, owned_timestep, owned_time_ids = _native_arguments(
            torch, parts[4], shape, layout, sample, timestep, time_ids, tensor_profile
        )
        _, negative_bindings, positive_bindings = _encode_recipe_bindings(
            bbox=bbox,
            pairs=pairs,
            parameters=parameters,
            shape=shape,
            global_negative=global_negative,
            global_positive=global_positive,
            pipeline=pipeline,
            runtime=runtime,
            torch=torch,
            compel=compel,
            parts=parts,
            clip_modules=clip_modules,
            unet_modules=unet_modules,
            bindings=bindings,
            layout=layout,
            tensor_profile=tensor_profile,
            embedding_strategy=embedding_strategy,
        )
        return run_illustrious_regional_conditioning(
            parts[4],
            negative=tuple(negative_bindings),
            positive=tuple(positive_bindings),
            latent_shape=shape,
            layout=layout,
            bindings=bindings,
            sample=owned_sample,
            timestep=owned_timestep,
            time_ids=owned_time_ids,
            negative_pooled_source_id=negative_pooled_source_id,
            positive_pooled_source_id=positive_pooled_source_id,
            tensor_profile=tensor_profile,
        )
