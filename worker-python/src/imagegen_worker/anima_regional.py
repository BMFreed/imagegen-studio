"""Private original-Anima positive regions through the existing native owners.

Adapted from InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd:
backend/anima/{regional_prompting,conditioning_data,anima_transformer_patch}.py,
app/invocations/anima/anima_denoise.py and the canvas addRegionalGuidance caller.
The pinned Diffusers Cosmos processor remains the attention implementation. Only
the positive prediction call owns the temporary processors; context length never
selects a sign. This is no checkpoint loading owner. The explicit global-support
profile adapts only Krea-2's background fallback from InvokeAI
ae06c1bd36218100f89a48ff5b8855751d06a898, backend/krea2/regional_prompting.py;
the default retains original Anima behavior.
The explicit flow-sampling profile adapts the same revision's
backend/anima/scheduler_driver.py and anima_denoise.py prediction/driver seam;
the existing frozen native grids and iteration-progress contract stay unchanged.

Main compilation, recipe provenance and checkpoint-to-live-model association are
trusted caller responsibilities, as in the ordinary compiled Anima command.
Native class/config/hook admission is finite and cooperative, not a sandbox for
arbitrary Python callbacks or concurrent mutation of the borrowed graph.
"""

from __future__ import annotations

import copy
import hashlib
import importlib
import importlib.metadata
import json
import math
import re
import threading
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass, replace
from itertools import chain
from pathlib import PosixPath
from typing import TYPE_CHECKING, Any, Literal, cast
from uuid import UUID

from imagegen_worker.anima_conditioning import (
    AnimaConditioningPair,
    CompiledAnimaPrompt,
    # Reuse the private conditioning owner's token/weight preflight unchanged.
    _first_token_sequence,  # pyright: ignore[reportPrivateUsage]
    _token_weights,  # pyright: ignore[reportPrivateUsage]
    _tokenize,  # pyright: ignore[reportPrivateUsage]
    encode_anima_prompt,
    validate_compiled_anima_prompt,
)
from imagegen_worker.anima_euler import (
    AnimaPredictionFactory,
    AnimaPredictor,
    execute_captured_anima_plan,
    predict_anima_flow,
)
from imagegen_worker.anima_flow_sampling import (
    AnimaFlowSamplingPlan,
    validate_anima_flow_sampling_plan,
)
from imagegen_worker.anima_sampling import create_anima_native_denoiser
from imagegen_worker.anima_tokenizers import AnimaTokenizers, load_anima_tokenizers
from imagegen_worker.anima_worker import anima_prompt_payload, anima_sampling_payload
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.generation_artifacts import (
    publish_generation_image,
    validate_generation_target,
)
from imagegen_worker.inference_anima import LoadedAnimaModels
from imagegen_worker.protocol import GenerateAnimaImg2ImgCommand, GenerateAnimaTxt2ImgCommand

if TYPE_CHECKING:
    from imagegen_worker.inference import DenoisingProgressSink, MLRuntime

_Profile = Literal["cpu-float32-v1", "cuda-bfloat16-v1"]
_CompositionProfile = Literal["invoke-krea2-global-support-v1"]
_SamplingProfile = Literal["invoke-anima-flow-sampling-v1"]
_MAX_REGIONS = 3
_MAX_TEXT_BYTES = 16 * 1024
_MAX_TOTAL_TEXT_BYTES = 128 * 1024
_MAX_MASK_ELEMENTS = 33_554_432
_CONTEXT_ROWS = 512
_SCAN_ELEMENTS = 1_048_576
_LOCK = threading.Lock()
_MODEL_OWNERS: set[int] = set()
_ATTENTION_OWNERS: set[int] = set()
_WAN_CACHE_FIELDS = (
    "_conv_num",
    "_conv_idx",
    "_feat_map",
    "_enc_conv_num",
    "_enc_conv_idx",
    "_enc_feat_map",
)


@dataclass(frozen=True)
class _Prompt:
    source_id: str
    polarity: str
    text: str
    compiled: CompiledAnimaPrompt


@dataclass(frozen=True)
class _Region:
    source_id: str
    text: str | None
    alpha: bytes


@dataclass(frozen=True)
class _Input:
    bbox: tuple[int, int, int, int]
    seed: int
    prompts: tuple[_Prompt, ...]
    regions: tuple[_Region, ...]


def _require(condition: bool, code: str, message: str) -> None:
    if not condition:
        raise DerivativeError(code, message)


def _object(
    value: object, required: set[str], optional: set[str] | None = None
) -> dict[str, object]:
    _require(type(value) is dict, "INVALID_REQUEST", "Anima regional input requires plain objects.")
    result = cast(dict[str, object], value)
    _require(
        required <= set(result) <= required | (optional or set()),
        "INVALID_REQUEST",
        "Anima regional input fields are invalid.",
    )
    return result


def _integer(value: object, minimum: int, maximum: int) -> int:
    _require(
        type(value) is int and minimum <= value <= maximum,
        "INVALID_REQUEST",
        "Anima regional integer is invalid.",
    )
    return cast(int, value)


def _uuid(value: object) -> str:
    _require(type(value) is str, "INVALID_REQUEST", "Anima regional owner ID is invalid.")
    text = cast(str, value)
    try:
        valid = str(UUID(text)) == text.lower()
    except ValueError:
        valid = False
    _require(valid, "INVALID_REQUEST", "Anima regional owner ID is invalid.")
    return text


def _rect(value: object) -> tuple[int, int, int, int]:
    data = _object(value, {"x", "y", "width", "height"})
    return (
        _integer(data["x"], -2_147_483_647, 2_147_483_647),
        _integer(data["y"], -2_147_483_647, 2_147_483_647),
        _integer(data["width"], 1, 2048),
        _integer(data["height"], 1, 2048),
    )


def _text(value: object) -> str:
    _require(type(value) is str, "INVALID_REQUEST", "Anima regional text is invalid.")
    text = cast(str, value)
    try:
        size = len(text.encode("utf-8"))
    except UnicodeError as error:
        raise DerivativeError(
            "INVALID_REQUEST", "Anima regional text is not valid Unicode."
        ) from error
    _require(size <= _MAX_TEXT_BYTES, "LIMIT", "Anima regional text exceeds 16 KiB.")
    _require(
        "{" not in text and "}" not in text,
        "GENERATION_PROMPT_UNSUPPORTED",
        "Anima regional text must already be concrete and static.",
    )
    return text


def _prompt(value: object) -> str:
    data = _object(value, {"text", "embeddingRefs"})
    _require(
        type(data["embeddingRefs"]) is list and not data["embeddingRefs"],
        "GENERATION_PROMPT_UNSUPPORTED",
        "Original Anima regional inputs do not support textual inversion references.",
    )
    return _text(data["text"])


def _authored_prompt_agrees(value: object, effective: object) -> None:
    if value == effective:
        return
    authored = _object(value, {"text", "embeddingRefs"})
    selected = _object(effective, {"text", "embeddingRefs"})
    _require(
        authored["text"] == selected["text"],
        "INVALID_REQUEST",
        "Regional prompt differs from its authored block.",
    )
    refs = authored["embeddingRefs"]
    _require(
        type(refs) is list and len(cast(list[object], refs)) <= 10_000,
        "INVALID_REQUEST",
        "Authored regional references are invalid.",
    )
    # Main retains dormant metadata in authored blocks while effective Anima
    # prompts have no TI. Reuse the existing recipe/reference and literal-range
    # owners rather than introducing another activation interpretation.
    from imagegen_worker.illustrious_regional_embeddings import validate_authored_selection
    from imagegen_worker.illustrious_regional_recipe import (
        _authored_ref,  # pyright: ignore[reportPrivateUsage]
    )

    try:
        for ref in cast(list[object], refs):
            _authored_ref(ref)
        validate_authored_selection(cast(dict[str, Any], authored), cast(dict[str, Any], selected))
    except (ValueError, TypeError, KeyError) as error:
        raise DerivativeError(
            "GENERATION_PROMPT_UNSUPPORTED",
            "Anima regional authored references must remain inactive.",
        ) from error


def _coverage(value: object, bbox: tuple[int, int, int, int]) -> bytes:
    data = _object(value, {"bounds", "alpha", "kind", "intersection"})
    _require(_rect(data["bounds"]) == bbox, "INVALID_REQUEST", "Regional coverage bbox differs.")
    x, y, width, height = bbox
    raw = data["alpha"]
    _require(
        type(raw) in (bytes, bytearray, list, tuple), "INVALID_REQUEST", "Invalid alpha8 input."
    )
    sequence = cast(bytes | bytearray | list[object] | tuple[object, ...], raw)
    _require(len(sequence) == width * height, "INVALID_REQUEST", "Regional alpha8 size differs.")
    _require(
        all(type(item) is int and 0 <= item <= 255 for item in sequence),
        "INVALID_REQUEST",
        "Regional alpha8 values are invalid.",
    )
    alpha = bytes(cast(Any, sequence))
    kind, intersection = data["kind"], data["intersection"]
    _require(
        kind in ("covered", "intersecting-empty", "empty", "outside"),
        "INVALID_REQUEST",
        "Regional coverage classification is invalid.",
    )
    if kind in ("empty", "outside"):
        _require(
            intersection is None and not any(alpha),
            "INVALID_REQUEST",
            "Empty or outside coverage contains pixels.",
        )
    else:
        left, top, span, rows = _rect(intersection)
        _require(
            x <= left and y <= top and left + span <= x + width and top + rows <= y + height,
            "INVALID_REQUEST",
            "Regional intersection is outside its target.",
        )
        _require(
            bool(any(alpha)) == (kind == "covered"),
            "INVALID_REQUEST",
            "Regional coverage classification disagrees with its alpha.",
        )
        for row in range(height):
            start = row * width
            if not top - y <= row < top - y + rows:
                outside = alpha[start : start + width]
            else:
                outside = (
                    alpha[start : start + left - x] + alpha[start + left - x + span : start + width]
                )
            _require(
                not any(outside), "INVALID_REQUEST", "Regional alpha exceeds its intersection."
            )
    return alpha


def _capture(recipe: object, compiled_prompts: object) -> _Input:
    data = _object(
        recipe,
        {
            "kind",
            "family",
            "bbox",
            "documentId",
            "documentRevision",
            "item",
            "globalPrompts",
            "regions",
        },
    )
    _require(
        data["kind"] == "current-canvas-regional-recipe" and data["family"] == "anima",
        "INVALID_REQUEST",
        "A complete original-Anima Current Canvas recipe is required.",
    )
    _uuid(data["documentId"])
    _uuid(data["documentRevision"])
    bbox = _rect(data["bbox"])
    _require(
        bbox[2] * bbox[3] <= 4_000_000, "LIMIT", "Regional image area exceeds the existing bound."
    )
    item = _object(data["item"], {"iteration", "promptPairIndex", "prompts", "seed"})
    _integer(item["iteration"], 0, 2**53 - 1)
    _integer(item["promptPairIndex"], 0, 2**53 - 1)
    seed = _integer(item["seed"], 0, 0xFFFFFFFF)
    global_prompts = _object(data["globalPrompts"], {"positive", "negative"})
    positive, negative = _prompt(global_prompts["positive"]), _prompt(global_prompts["negative"])
    concrete = _object(item["prompts"], {"positive", "negative"})
    _require(
        concrete == {"positive": positive, "negative": negative},
        "INVALID_REQUEST",
        "Concrete batch text differs from the recipe's global prompts.",
    )
    raw_regions = data["regions"]
    _require(
        type(raw_regions) is list, "INVALID_REQUEST", "Regional owners must be an ordered list."
    )
    entries = cast(list[object], raw_regions)
    _require(
        len(entries) <= _MAX_REGIONS,
        "LIMIT",
        "Anima regional execution admits at most three regions.",
    )
    expected: list[tuple[str, str, str]] = [
        ("current-canvas", "positive", positive),
        ("current-canvas", "negative", negative),
    ]
    total_text_bytes = len(positive.encode("utf-8")) + len(negative.encode("utf-8"))
    regions: list[_Region] = []
    owned: set[str] = set()
    for value in entries:
        region = _object(
            value,
            {"regionId", "maskId", "maskRevision", "positive", "negative", "coverage"},
            {"authoredPrompts", "referenceImages"},
        )
        source_id, mask_id = _uuid(region["regionId"]), _uuid(region["maskId"])
        _require(
            source_id not in owned and mask_id not in owned and source_id != mask_id,
            "INVALID_REQUEST",
            "Regional owner IDs collide.",
        )
        owned.update((source_id, mask_id))
        _integer(region["maskRevision"], 0, 2**53 - 1)
        if "referenceImages" in region:
            _require(
                type(region["referenceImages"]) is list and not region["referenceImages"],
                "GENERATION_PROMPT_UNSUPPORTED",
                "Anima regional reference images are unsupported.",
            )
        local_positive = None if region["positive"] is None else _prompt(region["positive"])
        local_negative = _object(region["negative"], {"prompt", "source"})
        negative_text = _prompt(local_negative["prompt"])
        _require(
            local_negative["source"] in ("current-canvas", "regional"),
            "INVALID_REQUEST",
            "Regional negative source is invalid.",
        )
        if "authoredPrompts" not in region:
            _require(
                local_positive is None and local_negative["source"] == "current-canvas",
                "INVALID_REQUEST",
                "Effective prompts have no authored owner.",
            )
        else:
            authored = _object(
                region["authoredPrompts"], {"positive", "negative", "useGlobalNegativePrompt"}
            )
            _require(
                type(authored["useGlobalNegativePrompt"]) is bool,
                "INVALID_REQUEST",
                "Invalid negative inheritance.",
            )
            _authored_prompt_agrees(authored["positive"], region["positive"])
            if authored["useGlobalNegativePrompt"]:
                _require(
                    local_negative["source"] == "current-canvas",
                    "INVALID_REQUEST",
                    "Inherited negative source differs.",
                )
            else:
                _require(
                    local_negative["source"] == "regional",
                    "INVALID_REQUEST",
                    "Local negative differs from its authored block.",
                )
                _authored_prompt_agrees(authored["negative"], local_negative["prompt"])
        if local_negative["source"] == "current-canvas":
            _require(
                local_negative["prompt"] == global_prompts["negative"],
                "INVALID_REQUEST",
                "Inherited negative text or references differ from Current Canvas.",
            )
        _require(
            negative_text == "",
            "GENERATION_PROMPT_UNSUPPORTED",
            "Spatial Anima regional negative prompts are not qualified.",
        )
        if local_positive is not None:
            expected.append((source_id, "positive", local_positive))
            total_text_bytes += len(local_positive.encode("utf-8"))
        regions.append(_Region(source_id, local_positive, _coverage(region["coverage"], bbox)))
    _require(
        total_text_bytes <= _MAX_TOTAL_TEXT_BYTES,
        "LIMIT",
        "Anima regional aggregate text exceeds 128 KiB.",
    )
    _require(
        type(compiled_prompts) in (list, tuple),
        "INVALID_REQUEST",
        "Compiled regional records must be ordered.",
    )
    records = cast(list[object] | tuple[object, ...], compiled_prompts)
    _require(
        len(records) == len(expected),
        "INVALID_REQUEST",
        "Missing or extra compiled regional records.",
    )
    prompts: list[_Prompt] = []
    for value, (source_id, polarity, text) in zip(records, expected, strict=True):
        record = _object(value, {"sourceId", "polarity", "text", "prompt"})
        _require(
            (record["sourceId"], record["polarity"], record["text"]) == (source_id, polarity, text),
            "INVALID_REQUEST",
            "Compiled prompt source, sign or authored text differs.",
        )
        prompts.append(
            _Prompt(source_id, polarity, text, validate_compiled_anima_prompt(record["prompt"]))
        )
    return _Input(bbox, seed, tuple(prompts), tuple(regions))


def _capture_command(
    command: GenerateAnimaTxt2ImgCommand,
    captured: _Input,
    *,
    sampling_profile: _SamplingProfile | None = None,
    img2img: bool = False,
) -> AnimaFlowSamplingPlan:
    _require(
        type(command) is (GenerateAnimaImg2ImgCommand if img2img else GenerateAnimaTxt2ImgCommand),
        "INVALID_REQUEST",
        "Anima regional execution requires exact img2img command."
        if img2img
        else "Anima regional execution requires exact txt2img command.",
    )
    _uuid(command.request_id)
    _require(
        type(command.loras) is tuple and not command.loras,
        "GENERATION_PROMPT_UNSUPPORTED",
        "Private Anima regions do not admit LoRA.",
    )
    _require(
        sampling_profile is None
        or (type(sampling_profile) is str and sampling_profile == "invoke-anima-flow-sampling-v1"),
        "INVALID_REQUEST",
        "Anima regional sampling profile is unsupported.",
    )
    try:
        plan = validate_anima_flow_sampling_plan(anima_sampling_payload(command.sampling))
    except (AttributeError, TypeError, ValueError) as error:
        raise DerivativeError("INVALID_REQUEST", "Anima sampling command is invalid.") from error
    _require(
        plan.mode == ("img2img" if img2img else "txt2img")
        and (plan.scheduler == "euler" or sampling_profile is not None),
        "INVALID_REQUEST",
        "Private Anima image regions require original img2img Euler."
        if img2img
        else "Private Anima regions require original txt2img Euler.",
    )
    bbox = _rect(command.bbox)
    _require(
        type(command.width) is int
        and type(command.height) is int
        and bbox == captured.bbox
        and (command.width, command.height) == captured.bbox[2:]
        and (plan.width, plan.height, plan.seed) == (*captured.bbox[2:], captured.seed),
        "INVALID_REQUEST",
        "Anima command dimensions, world bbox or seed differ from its recipe.",
    )
    _require(
        type(command.positive_prompt) is CompiledAnimaPrompt
        and type(command.negative_prompt) is CompiledAnimaPrompt
        and command.positive_prompt == captured.prompts[0].compiled
        and command.negative_prompt == captured.prompts[1].compiled,
        "INVALID_REQUEST",
        "Anima command global conditioning differs from its Main compilation.",
    )
    _require(
        type(command.target_sha256) is str
        and re.fullmatch(r"[0-9a-f]{64}", command.target_sha256) is not None,
        "INVALID_REQUEST",
        "Anima target digest is invalid.",
    )
    _integer(command.target_byte_size, 1, 32 * 1024 * 1024)
    for path in (command.target_path, command.output_path, command.staging_root):
        _require(
            type(path) is PosixPath
            and path.is_absolute()
            and ".." not in path.parts
            and "\x00" not in str(path),
            "INVALID_REQUEST",
            "Anima generation paths must be safe absolute paths.",
        )
    return plan


def _native_classes(torch: Any) -> set[type[Any]]:
    """Finite classes used by the pinned original Base graph, including scaled tests."""
    allowed: set[type[Any]] = {
        torch.nn.ModuleList,
        torch.nn.Sequential,
        torch.nn.Identity,
        torch.nn.Linear,
        torch.nn.Embedding,
        torch.nn.LayerNorm,
        torch.nn.RMSNorm,
        torch.nn.Dropout,
        torch.nn.GELU,
        torch.nn.SiLU,
        torch.nn.Conv2d,
        torch.nn.Conv3d,
        torch.nn.ZeroPad2d,
        torch.nn.Upsample,
    }
    for module_name, names in (
        (
            "diffusers.models.transformers.transformer_cosmos",
            (
                "CosmosTransformer3DModel",
                "CosmosTransformerBlock",
                "CosmosPatchEmbed",
                "CosmosTimestepEmbedding",
                "CosmosEmbedding",
                "CosmosAdaLayerNorm",
                "CosmosAdaLayerNormZero",
                "CosmosRotaryPosEmbed",
            ),
        ),
        ("diffusers.models.embeddings", ("Timesteps",)),
        ("diffusers.models.attention_processor", ("Attention",)),
        ("diffusers.models.attention", ("FeedForward",)),
        ("diffusers.models.activations", ("GELU",)),
        ("diffusers.models.normalization", ("RMSNorm",)),
        ("transformers.activations", ("SiLUActivation",)),
        (
            "diffusers.models.condition_embedders.condition_embedder_anima",
            (
                "AnimaTextConditioner",
                "AnimaRotaryEmbedding",
                "AnimaTextConditionerAttention",
                "AnimaTextConditionerBlock",
            ),
        ),
        (
            "transformers.models.qwen3.modeling_qwen3",
            (
                "Qwen3Model",
                "Qwen3Attention",
                "Qwen3DecoderLayer",
                "Qwen3MLP",
                "Qwen3RMSNorm",
                "Qwen3RotaryEmbedding",
            ),
        ),
        (
            "diffusers.models.autoencoders.autoencoder_kl_wan",
            (
                "AutoencoderKLWan",
                "WanCausalConv3d",
                "WanRMS_norm",
                "WanUpsample",
                "WanResample",
                "WanResidualBlock",
                "WanAttentionBlock",
                "WanMidBlock",
                "WanResidualDownBlock",
                "WanEncoder3d",
                "WanResidualUpBlock",
                "WanUpBlock",
                "WanDecoder3d",
                "AvgDown3D",
                "DupUp3D",
            ),
        ),
    ):
        module = importlib.import_module(module_name)
        allowed.update(getattr(module, name) for name in names)
    return allowed


def _no_hooks(model: Any, torch: Any) -> None:
    module_globals = torch.nn.modules.module
    for name in (
        "_global_forward_hooks",
        "_global_forward_pre_hooks",
        "_global_backward_hooks",
        "_global_backward_pre_hooks",
        "_global_module_registration_hooks",
        "_global_parameter_registration_hooks",
        "_global_buffer_registration_hooks",
    ):
        _require(
            not getattr(module_globals, name, {}),
            "INFERENCE_UNAVAILABLE",
            "Global native hooks are outside private Anima admission.",
        )
    allowed = _native_classes(torch)
    conditioner = importlib.import_module(
        "diffusers.models.condition_embedders.condition_embedder_anima"
    )
    for count, module in enumerate(model.modules(), 1):
        _require(count <= 100_000, "LIMIT", "Anima module graph exceeds private inspection bounds.")
        _require(
            type(module) in allowed,
            "INFERENCE_UNAVAILABLE",
            f"Anima module class {type(module).__module__}.{type(module).__name__} "
            "is outside its finite original native graph.",
        )
        if type(module) is conditioner.AnimaTextConditionerAttention:
            _require(
                type(module.processor) is conditioner.AnimaTextConditionerAttnProcessor
                and not vars(module.processor)
                and "set_processor" not in vars(module),
                "INFERENCE_UNAVAILABLE",
                "Anima requires the original native text-conditioning processor.",
            )
        _require(
            not module.training and "forward" not in vars(module),
            "INFERENCE_UNAVAILABLE",
            "Anima requires unchanged eval-native module methods.",
        )
        _require(
            not any(
                getattr(module, name, {})
                for name in (
                    "_forward_hooks",
                    "_forward_pre_hooks",
                    "_backward_hooks",
                    "_backward_pre_hooks",
                )
            ),
            "INFERENCE_UNAVAILABLE",
            "Borrowed Anima callbacks are outside private admission.",
        )
        _require(
            not hasattr(module, "_hf_hook"),
            "INFERENCE_UNAVAILABLE",
            "Offloaded Anima modules are unsupported.",
        )
        _require(
            not isinstance(
                module,
                (
                    torch.nn.modules.batchnorm._BatchNorm,
                    torch.nn.modules.instancenorm._InstanceNorm,
                ),
            ),
            "INFERENCE_UNAVAILABLE",
            "Stateful normalization is outside original Anima admission.",
        )
        if isinstance(module, (torch.nn.Embedding, torch.nn.EmbeddingBag)):
            _require(
                module.max_norm is None,
                "INFERENCE_UNAVAILABLE",
                "Anima embeddings must not renormalize borrowed storage.",
            )


def _qualified_attentions(transformer: Any, torch: Any) -> tuple[Any, ...]:
    cosmos = importlib.import_module("diffusers.models.transformers.transformer_cosmos")
    _require(
        type(transformer) is cosmos.CosmosTransformer3DModel,
        "INFERENCE_UNAVAILABLE",
        "Original native Cosmos model is required.",
    )
    _no_hooks(transformer, torch)
    _require(
        not transformer.gradient_checkpointing
        and not getattr(transformer, "peft_config", None)
        and not getattr(transformer.config, "use_crossattn_projection", False)
        and transformer.config.extra_pos_embed_type is None
        and not hasattr(transformer, "anima_v2_connector")
        and not hasattr(transformer, "semantic_connector"),
        "INFERENCE_UNAVAILABLE",
        "Only the prepared original-Anima Base topology is qualified.",
    )
    blocks = transformer.transformer_blocks
    _require(
        type(blocks) is torch.nn.ModuleList and 1 <= len(blocks) <= 28,
        "INFERENCE_UNAVAILABLE",
        "Anima block topology is unsupported.",
    )
    result: list[Any] = []
    for block in blocks:
        _require(
            type(block) is cosmos.CosmosTransformerBlock
            and not block.img_context
            and block.before_proj is None
            and block.after_proj is None,
            "INFERENCE_UNAVAILABLE",
            "Anima native block topology is unsupported.",
        )
        with _LOCK:
            _require(
                id(block.attn2) not in _ATTENTION_OWNERS,
                "OWNERSHIP_CONFLICT",
                "Anima regional attention components are already borrowed.",
            )
        for attention in (block.attn1, block.attn2):
            _require(
                type(attention) is cosmos.Attention
                and type(attention.processor) is cosmos.CosmosAttnProcessor2_0
                and not vars(attention.processor)
                and "set_processor" not in vars(attention)
                and not isinstance(attention.processor, torch.nn.Module),
                "INFERENCE_UNAVAILABLE",
                "Anima requires the original native attention processor.",
            )
        result.append(block.attn2)
    return tuple(result)


def _model_profile(
    models: LoadedAnimaModels, runtime: MLRuntime, profile: _Profile
) -> tuple[Any, tuple[Any, ...]]:
    _require(
        type(profile) is str and profile in ("cpu-float32-v1", "cuda-bfloat16-v1"),
        "INFERENCE_UNAVAILABLE",
        "Anima regional tensor profile is unsupported.",
    )
    _require(
        type(models) is LoadedAnimaModels,
        "INFERENCE_UNAVAILABLE",
        "Prepared original Anima models are required.",
    )
    torch = cast(Any, runtime.torch)
    diffusers = cast(Any, runtime.diffusers)
    transformers = importlib.import_module("transformers")
    for package, expected in (
        ("torch", "2.7.1"),
        ("diffusers", "0.40.0"),
        ("transformers", "5.5.4"),
        ("torchvision", "0.22.1"),
        ("tokenizers", "0.22.2"),
    ):
        _require(
            importlib.metadata.version(package).split("+", maxsplit=1)[0] == expected,
            "INFERENCE_UNAVAILABLE",
            "Pinned Anima dependencies are required.",
        )
    _require(
        type(models.qwen3_encoder) is transformers.Qwen3Model
        and type(models.text_conditioner) is diffusers.AnimaTextConditioner
        and type(models.vae) is diffusers.AutoencoderKLWan,
        "INFERENCE_UNAVAILABLE",
        "Original Qwen3, Anima conditioner and Wan VAE classes are required.",
    )
    attentions = _qualified_attentions(models.transformer, torch)
    dispatch = importlib.import_module("diffusers.models.attention_dispatch")
    _require(
        dispatch._AttentionBackendRegistry.get_active_backend()[0]
        == dispatch.AttentionBackendName.NATIVE,
        "INFERENCE_UNAVAILABLE",
        "Private Anima qualification requires the original native attention backend.",
    )
    target_device = torch.device("cpu" if profile == "cpu-float32-v1" else "cuda:0")
    target_dtype = torch.float32 if profile == "cpu-float32-v1" else torch.bfloat16
    if profile == "cuda-bfloat16-v1":
        _require(
            torch.cuda.is_bf16_supported(including_emulation=False),
            "INFERENCE_UNAVAILABLE",
            "Anima requires native CUDA BF16 compute.",
        )
    _require(
        not torch.is_autocast_enabled() and not torch.is_autocast_enabled("cpu"),
        "INFERENCE_UNAVAILABLE",
        "Private Anima execution does not admit autocast.",
    )
    for model in (models.transformer, models.text_conditioner, models.qwen3_encoder, models.vae):
        _no_hooks(model, torch)
        _require(
            not getattr(model, "peft_config", None),
            "INFERENCE_UNAVAILABLE",
            "Prepared Anima adapters are unsupported.",
        )
        for parameter in model.parameters():
            _require(
                type(parameter) is torch.nn.Parameter
                and parameter.device == target_device
                and parameter.dtype == target_dtype,
                "INFERENCE_UNAVAILABLE",
                "Anima parameter placement differs from its explicit profile.",
            )
        for count, tensor in enumerate(cast(Any, chain(model.parameters(), model.buffers())), 1):
            _require(
                count <= 100_000,
                "LIMIT",
                "Anima registered state exceeds private inspection bounds.",
            )
            _require(
                type(tensor) in (torch.Tensor, torch.nn.Parameter)
                and tensor.layout == torch.strided
                and tensor.is_contiguous()
                and tensor.device == target_device,
                "INFERENCE_UNAVAILABLE",
                "Anima state must be native contiguous tensors on its explicit device.",
            )
            if tensor.is_floating_point():
                flat = tensor.detach().view(-1)
                for start in range(0, flat.numel(), _SCAN_ELEMENTS):
                    _require(
                        bool(torch.isfinite(flat[start : start + _SCAN_ELEMENTS]).all().item()),
                        "INFERENCE_UNAVAILABLE",
                        "Anima borrowed floating state is non-finite.",
                    )
    encoder_config = models.qwen3_encoder.config
    _require(
        type(encoder_config) is transformers.Qwen3Config
        and encoder_config.hidden_act == "silu"
        and not any(
            bool(getattr(encoder_config, name, False))
            for name in ("output_hidden_states", "output_attentions", "output_cross_attentions")
        )
        and getattr(models.qwen3_encoder.rotary_emb, "rope_type", "default") == "default",
        "INFERENCE_UNAVAILABLE",
        "Anima Qwen3 capture outputs and dynamic RoPE are outside private admission.",
    )
    config = models.transformer.config
    _require(
        config.in_channels == 16
        and config.out_channels == 16
        and tuple(config.patch_size) == (1, 2, 2)
        and config.concat_padding_mask
        and models.vae.config.z_dim == 16
        and models.vae.spatial_compression_ratio == 8
        and models.text_conditioner.config.min_sequence_length == _CONTEXT_ROWS
        and models.text_conditioner.config.target_vocab_size == 32128
        and encoder_config.vocab_size == 151936
        and models.text_conditioner.config.source_dim == encoder_config.hidden_size
        and models.text_conditioner.config.target_dim == config.text_embed_dim,
        "INFERENCE_UNAVAILABLE",
        "Original Anima conditioning and latent topology is required.",
    )
    return torch, attentions


def _tokenizer_graph(roots: tuple[Any, Any]) -> tuple[set[int], tuple[str, str]]:
    """Bound and qualify native copy state before invoking its native reducers."""
    transformers = importlib.import_module("transformers")
    native = importlib.import_module("tokenizers")
    _require(
        type(roots[0]) is transformers.Qwen2Tokenizer
        and type(roots[1]) is transformers.T5Tokenizer,
        "INFERENCE_UNAVAILABLE",
        "Original native Qwen2/T5 fast tokenizers are required.",
    )
    _require(
        len(roots[0]) == 151_669
        and len(roots[1]) == 32_100
        and roots[0]._tokenizer is not roots[1]._tokenizer,
        "INFERENCE_UNAVAILABLE",
        "Anima tokenizers must retain their distinct original vocabularies.",
    )
    allowed_wrappers = {transformers.Qwen2Tokenizer, transformers.T5Tokenizer}
    seen: set[int] = set()
    mutable: set[int] = set()
    nodes = metadata_bytes = backend_bytes = 0
    digests: dict[int, str] = {}

    # An explicit iterator stack releases inspection state on return without a
    # recursive-function closure cycle, including when a later node refuses.
    stack: list[tuple[Any, int]] = [(iter(roots), 0)]
    while stack:
        iterator, depth = stack[-1]
        try:
            value = next(iterator)
        except StopIteration:
            stack.pop()
            continue
        nodes += 1
        _require(
            nodes <= 2_000_000 and depth <= 128,
            "LIMIT",
            "Anima tokenizer copy graph exceeds its defensive work bound.",
        )
        cls = cast(Any, type(value))
        if value is None or cls in (bool, int, float, str, bytes):
            if cls is float:
                _require(
                    math.isfinite(cast(float, value)),
                    "INFERENCE_UNAVAILABLE",
                    "Anima tokenizer metadata is non-finite.",
                )
            metadata_bytes += (
                len(cast(str, value).encode("utf-8"))
                if cls is str
                else len(cast(bytes, value))
                if cls is bytes
                else 8
            )
            _require(
                metadata_bytes <= 32 * 1024 * 1024,
                "LIMIT",
                "Anima tokenizer metadata exceeds 32 MiB.",
            )
            continue
        if id(value) in seen:
            continue
        seen.add(id(value))
        if cls in (tuple, frozenset):
            stack.append((iter(value), depth + 1))
            continue
        mutable.add(id(value))
        if cls is dict:
            stack.append((chain.from_iterable(value.items()), depth + 1))
        elif cls in (list, set):
            stack.append((iter(value), depth + 1))
        elif cls in allowed_wrappers:
            stack.append((iter((cast(dict[str, Any], vars(value)),)), depth + 1))
        elif cls is native.Tokenizer:
            _require(
                not getattr(value, "__dict__", {}),
                "INFERENCE_UNAVAILABLE",
                "Custom tokenizer backend state is unsupported.",
            )
            encoded = value.to_str().encode("utf-8")
            backend_bytes += len(encoded)
            _require(
                backend_bytes <= 32 * 1024 * 1024,
                "LIMIT",
                "Anima serialized tokenizer backends exceed 32 MiB.",
            )
            digests[id(value)] = hashlib.sha256(encoded).hexdigest()
        elif cls is native.AddedToken:
            _require(
                not getattr(value, "__dict__", {}),
                "INFERENCE_UNAVAILABLE",
                "Custom native AddedToken state is unsupported.",
            )
            fields = ("content", "single_word", "lstrip", "rstrip", "normalized", "special")
            stack.append((iter(tuple(getattr(value, field) for field in fields)), depth + 1))
        else:
            raise DerivativeError(
                "INFERENCE_UNAVAILABLE",
                f"Anima tokenizer copy state {cls.__module__}.{cls.__name__} is unsupported.",
            )
    return mutable, (digests[id(roots[0]._tokenizer)], digests[id(roots[1]._tokenizer)])


def _restore_owned_t5_model(source: Any, owned: Any) -> None:
    # The pinned Rust JSON round-trip can perturb Unigram f64 scores by one ULP.
    # Rebuild only the owned native model from Python's exact float interpretation;
    # the complete backend digest below must still match before any tokenization.
    native = importlib.import_module("tokenizers")
    model: dict[str, Any] = json.loads(source._tokenizer.to_str())["model"]
    _require(
        type(model) is dict
        and set(model) == {"type", "unk_id", "vocab", "byte_fallback"}
        and model["type"] == "Unigram"
        and model["unk_id"] == 2
        and model["byte_fallback"] is False
        and type(model["vocab"]) is list
        and 1 <= len(model["vocab"]) <= 32_100,
        "INFERENCE_UNAVAILABLE",
        "Anima T5 requires its original finite native Unigram model.",
    )
    vocabulary: list[tuple[str, float]] = []
    for entry in model["vocab"]:
        _require(
            type(entry) is list
            and len(entry) == 2
            and type(entry[0]) is str
            and type(entry[1]) in (int, float)
            and math.isfinite(cast(float, entry[1])),
            "INFERENCE_UNAVAILABLE",
            "Anima T5 Unigram state is invalid.",
        )
        row = cast(list[Any], entry)
        vocabulary.append((cast(str, row[0]), float(row[1])))
    owned._tokenizer.model = native.models.Unigram(
        vocabulary, unk_id=model["unk_id"], byte_fallback=model["byte_fallback"]
    )


def _owned_tokenizers(supplied: AnimaTokenizers | None) -> AnimaTokenizers:
    if supplied is None:
        owned = load_anima_tokenizers()
        _tokenizer_graph((owned.qwen3, owned.t5))
        return owned
    _require(
        type(supplied) is AnimaTokenizers,
        "INFERENCE_UNAVAILABLE",
        "Anima tokenizer owner is invalid.",
    )
    roots = (supplied.qwen3, supplied.t5)
    original_mutable, original_digests = _tokenizer_graph(roots)
    copies = copy.deepcopy(roots)
    _restore_owned_t5_model(roots[1], copies[1])
    owned_mutable, owned_digests = _tokenizer_graph(copies)
    _require(
        not original_mutable & owned_mutable and original_digests == owned_digests,
        "INFERENCE_UNAVAILABLE",
        "Anima tokenizer copying did not establish independent exact native ownership.",
    )
    _require(
        all(
            source is not target and source._tokenizer is not target._tokenizer
            for source, target in zip(roots, copies, strict=True)
        ),
        "INFERENCE_UNAVAILABLE",
        "Anima tokenizer wrappers and backends must be independently owned.",
    )
    return AnimaTokenizers(*copies)


def _preflight_prompt_weights(
    captured: _Input, tokenizers: AnimaTokenizers, torch: Any, dtype: Any
) -> None:
    """Reuse real native tokenization/weight arithmetic before any encoder forward."""
    for prompt in captured.prompts:
        if prompt.source_id != "current-canvas" and prompt.text == "":
            continue
        qwen, t5 = _tokenize(prompt.compiled, tokenizers)
        qwen_ids = _first_token_sequence(qwen, "input_ids")
        qwen_mask = _first_token_sequence(qwen, "attention_mask")
        _require(
            len(qwen_ids) == len(qwen_mask)
            and len(qwen_ids) <= 8192
            and all(type(value) is int and 0 <= value < 151936 for value in qwen_ids)
            and all(value == 1 for value in qwen_mask),
            "GENERATION_PROMPT_UNSUPPORTED",
            "Anima regional Qwen token preflight is invalid.",
        )
        if not qwen_ids:
            pad_id = tokenizers.qwen3.pad_token_id
            _require(
                type(pad_id) is int and 0 <= pad_id < 151936,
                "GENERATION_PROMPT_UNSUPPORTED",
                "Anima Qwen3 empty-input pad token is unavailable.",
            )
        weights, _offsets = _token_weights(
            prompt.compiled,
            _first_token_sequence(t5, "input_ids"),
            _first_token_sequence(t5, "offset_mapping"),
            _first_token_sequence(t5, "special_tokens_mask"),
            tokenizers.t5,
        )
        native_weights = torch.tensor(weights, dtype=dtype, device="cpu")
        _require(
            bool(torch.isfinite(native_weights).all().item())
            and all(
                weight == 0 or native_weights[index].item() != 0
                for index, weight in enumerate(weights)
            ),
            "GENERATION_PROMPT_UNSUPPORTED",
            "Anima regional token attention cannot be represented in the explicit model dtype.",
        )


@contextmanager
def _vae_cache_scope(vae: Any) -> Generator[None]:
    """Native Wan replaces its caches before use; retain borrowed presence/owners."""
    wan = importlib.import_module("diffusers.models.autoencoders.autoencoder_kl_wan")
    counts = vae._cached_conv_counts
    _require(
        type(counts) is dict
        and set(counts) == {"encoder", "decoder"}
        and all(
            type(counts[name]) is int
            and counts[name]
            == sum(type(module) is wan.WanCausalConv3d for module in getattr(vae, name).modules())
            for name in ("encoder", "decoder")
        ),
        "INFERENCE_UNAVAILABLE",
        "Anima Wan cache allocation metadata differs from its native graph.",
    )
    saved: dict[str, Any] = {
        name: cast(Any, vars(vae))[name] for name in _WAN_CACHE_FIELDS if name in vars(vae)
    }
    _require(
        not saved or set(saved) == set(_WAN_CACHE_FIELDS),
        "INFERENCE_UNAVAILABLE",
        "Anima Wan cache state is incomplete.",
    )
    if saved:
        for prefix, label in (("", "decoder"), ("_enc", "encoder")):
            count = saved[f"{prefix}_conv_num"]
            index = saved[f"{prefix}_conv_idx"]
            cache = saved[f"{prefix}_feat_map"]
            _require(
                type(count) is int
                and count == counts[label]
                and type(index) is list
                and index == [0]
                and type(cache) is list
                and len(cache) == count
                and all(value is None for value in cache),
                "INFERENCE_UNAVAILABLE",
                "Borrowed Anima Wan feature caches must be idle and empty.",
            )
    try:
        yield
    finally:
        for name in _WAN_CACHE_FIELDS:
            if name in saved:
                setattr(vae, name, saved[name])
            elif name in vars(vae):
                delattr(vae, name)


@contextmanager
def _reserve(objects: tuple[Any, ...], owners: set[int]) -> Generator[None]:
    identities = {id(value) for value in objects}
    with _LOCK:
        _require(
            not identities & owners,
            "OWNERSHIP_CONFLICT",
            "Anima regional components are already borrowed.",
        )
        owners.update(identities)
    try:
        yield
    finally:
        with _LOCK:
            owners.difference_update(identities)


class _RegionalProcessor:
    def __init__(self, original: Any, mask: Any, torch: Any) -> None:
        self.original, self.mask, self.torch = original, mask, torch

    def __call__(
        self,
        attn: Any,
        hidden_states: Any,
        encoder_hidden_states: Any = None,
        attention_mask: Any = None,
        image_rotary_emb: Any = None,
    ) -> Any:
        torch = self.torch
        _require(
            torch.is_tensor(hidden_states)
            and torch.is_tensor(encoder_hidden_states)
            and hidden_states.ndim == 3
            and encoder_hidden_states.ndim == 3
            and hidden_states.shape[0] == encoder_hidden_states.shape[0] == 1
            and hidden_states.shape[1] == self.mask.shape[-2]
            and encoder_hidden_states.shape[1] == self.mask.shape[-1]
            and hidden_states.device == encoder_hidden_states.device == self.mask.device,
            "GENERATION_WORKER_FAILED",
            "Anima native attention context or query differs from regional preflight.",
        )
        mask = self.mask
        if attention_mask is not None:
            _require(
                torch.is_tensor(attention_mask)
                and attention_mask.device == mask.device
                and attention_mask.ndim == 4
                and attention_mask.shape[0] == 1
                and attention_mask.shape[1] in (1, attn.heads)
                and attention_mask.shape[2] in (1, mask.shape[-2])
                and attention_mask.shape[3] == mask.shape[-1],
                "INFERENCE_UNAVAILABLE",
                "Existing Anima attention mask has an unsupported shape or placement.",
            )
            if attention_mask.dtype == torch.bool:
                mask = mask & attention_mask
            else:
                _require(
                    attention_mask.dtype == hidden_states.dtype
                    and bool(
                        (torch.isfinite(attention_mask) | torch.isneginf(attention_mask))
                        .all()
                        .item()
                    ),
                    "INFERENCE_UNAVAILABLE",
                    "Existing Anima additive mask is unsupported.",
                )
                mask = torch.where(mask, attention_mask, float("-inf"))
        allowed = mask if mask.dtype == torch.bool else ~torch.isneginf(mask)
        _require(
            bool(allowed.any(dim=-1).all().item()),
            "GENERATION_WORKER_FAILED",
            "Anima regional attention has an all-masked query.",
        )
        return self.original(
            attn,
            hidden_states,
            encoder_hidden_states=encoder_hidden_states,
            attention_mask=mask,
            image_rotary_emb=image_rotary_emb,
        )


@contextmanager
def scoped_anima_regional_attention(transformer: Any, mask: Any, torch: Any) -> Generator[None]:
    """Temporarily delegate even cross-attention to the original native processor.

    The caller scopes this only around a positive prediction. Private mask bytes
    detach the scope from caller mutation; original processors are restored even
    after a partially successful native setter. No model forward is replaced.
    """
    attentions = _qualified_attentions(transformer, torch)
    _require(
        type(mask) is torch.Tensor
        and mask.dtype == torch.bool
        and mask.ndim == 4
        and tuple(mask.shape[:2]) == (1, 1)
        and mask.shape[-2] > 0
        and mask.shape[-1] > 0,
        "INVALID_REQUEST",
        "Anima regional attention requires a [1,1,Q,K] Boolean mask.",
    )
    for attention in attentions:
        _require(
            attention.heads * mask.numel() <= _MAX_MASK_ELEMENTS,
            "LIMIT",
            "Anima expanded attention mask exceeds its existing element bound.",
        )
    _require(
        mask.device == next(transformer.parameters()).device,
        "INVALID_REQUEST",
        "Anima regional mask placement differs from the borrowed transformer.",
    )
    _require(
        bool(mask.any(dim=-1).all().item()),
        "INVALID_REQUEST",
        "Anima regional mask contains an all-masked query.",
    )
    private_mask = mask.detach().clone()
    with _reserve(attentions, _ATTENTION_OWNERS):
        installed: list[tuple[Any, Any, _RegionalProcessor]] = []
        try:
            for index, attention in enumerate(attentions):
                if index % 2 == 0:
                    original = attention.processor
                    replacement = _RegionalProcessor(original, private_mask, torch)
                    installed.append((attention, original, replacement))
                    attention.set_processor(replacement)
            yield
            _require(
                all(
                    attention.processor is replacement
                    for attention, _original, replacement in installed
                ),
                "OWNERSHIP_CONFLICT",
                "Anima regional processor ownership changed during execution.",
            )
        finally:
            for attention, original, _replacement in reversed(installed):
                attention.processor = original


def _prepare_mask(
    captured: _Input,
    attentions: tuple[Any, ...],
    torch: Any,
    device: Any,
    dtype: Any,
    composition_profile: _CompositionProfile | None = None,
) -> Any:
    _require(
        composition_profile is None
        or (
            type(composition_profile) is str
            and composition_profile == "invoke-krea2-global-support-v1"
        ),
        "INVALID_REQUEST",
        "Anima regional composition profile is unsupported.",
    )
    active = tuple(
        region for region in captured.regions if region.text is not None and region.text != ""
    )
    if not active:
        return None
    width, height = captured.bbox[2:]
    grid_height, grid_width = math.ceil((height // 8) / 2), math.ceil((width // 8) / 2)
    queries, keys = grid_height * grid_width, _CONTEXT_ROWS * (1 + len(active))
    for attention in attentions:
        _require(
            attention.heads * queries * keys <= _MAX_MASK_ELEMENTS,
            "LIMIT",
            "Anima expanded attention mask exceeds its existing element bound.",
        )
    masks: list[Any] = []
    background = torch.ones((queries,), dtype=torch.bool, device=device)
    for region in active:
        alpha = torch.frombuffer(bytearray(region.alpha), dtype=torch.uint8).reshape(
            1, 1, height, width
        )
        # Invoke first normalizes/binarizes the full image, then uses tensor NEAREST.
        binary = (alpha.to(dtype=dtype, device=device) / 255) > 0.5
        sampled = (
            torch.nn.functional.interpolate(
                binary.to(dtype=dtype), size=(grid_height, grid_width), mode="nearest"
            )
            .reshape(-1)
            .to(dtype=torch.bool)
        )
        _require(
            bool(sampled.any().item()),
            "GENERATION_PROMPT_UNSUPPORTED",
            "Anima regional positive has no sampled regional coverage.",
        )
        masks.append(sampled)
        background &= ~sampled
    allowed = torch.zeros((queries, keys), dtype=torch.bool, device=device)
    # Adapt only Krea-2's unmasked-conditioning fallback. The original regional
    # permissions, background subtraction, and Anima block/sign scopes stay exact.
    global_support = (
        background | ~background.any()
        if composition_profile == "invoke-krea2-global-support-v1"
        else background
    )
    allowed[:, :_CONTEXT_ROWS] = global_support.unsqueeze(1)
    for index, region_mask in enumerate(masks, 1):
        start, end = index * _CONTEXT_ROWS, (index + 1) * _CONTEXT_ROWS
        allowed[:, start:end] = region_mask.unsqueeze(1)
    _require(
        bool(allowed.any(dim=-1).all().item()),
        "INVALID_REQUEST",
        "Anima regional preparation has an all-masked query.",
    )
    return allowed.unsqueeze(0).unsqueeze(0)


def _prediction_factory(
    captured: _Input,
    models: LoadedAnimaModels,
    tokenizers: AnimaTokenizers | None,
    mask: Any,
) -> AnimaPredictionFactory:
    active_ids = {
        region.source_id
        for region in captured.regions
        if region.text is not None and region.text != ""
    }
    extras = tuple(prompt for prompt in captured.prompts[2:] if prompt.source_id in active_ids)

    def prepare(pair: AnimaConditioningPair, torch: Any, device: Any, dtype: Any) -> AnimaPredictor:
        contexts = [pair.positive.embeddings]
        for prompt in extras:
            contexts.append(
                encode_anima_prompt(
                    anima_prompt_payload(prompt.compiled), models, tokenizers=tokenizers
                ).embeddings
            )
        for context in (*contexts, pair.negative.embeddings):
            _require(
                tuple(context.shape)
                == (1, _CONTEXT_ROWS, models.text_conditioner.config.target_dim)
                and context.device == device
                and context.dtype == dtype
                and bool(torch.isfinite(context).all().item()),
                "GENERATION_WORKER_FAILED",
                "Anima regional context rows, placement or finite state differ from preflight.",
            )
        combined = torch.cat(contexts, dim=1)
        _require(
            combined.shape[1] == mask.shape[-1],
            "GENERATION_WORKER_FAILED",
            "Anima combined context length differs from its mask.",
        )

        def predict(role: Literal["positive", "negative"], latents: Any, sigma: float) -> Any:
            if role == "positive":
                with scoped_anima_regional_attention(models.transformer, mask, torch):
                    return predict_anima_flow(models.transformer, latents, combined, sigma, torch)
            _require(role == "negative", "INVALID_REQUEST", "Anima prediction sign is invalid.")
            return predict_anima_flow(
                models.transformer, latents, pair.negative.embeddings, sigma, torch
            )

        return predict

    return prepare


def generate_current_canvas_regional_anima_txt2img(
    recipe: object,
    *,
    command: GenerateAnimaTxt2ImgCommand,
    compiled_prompts: object,
    models: LoadedAnimaModels,
    runtime: MLRuntime,
    profile: _Profile,
    tokenizers: AnimaTokenizers | None = None,
    composition_profile: _CompositionProfile | None = None,
    on_progress: DenoisingProgressSink | None = None,
    sampling_profile: _SamplingProfile | None = None,
) -> dict[str, object]:
    """One matching Main recipe to existing native sampling/Wan and provisional PNG.

    The exact prepared Anima Base models are borrowed, not loaded here. This
    private consumer grants no public admission, durable candidate or visual
    quality claim; all regional negatives/references remain unsupported.
    The default remains Euler-only; the explicit sampling profile reuses the
    ordinary native flow driver without changing frozen schedules or progress.
    """
    return _generate_current_canvas_regional_anima(
        recipe,
        command=command,
        compiled_prompts=compiled_prompts,
        models=models,
        runtime=runtime,
        profile=profile,
        tokenizers=tokenizers,
        composition_profile=composition_profile,
        on_progress=on_progress,
        sampling_profile=sampling_profile,
        img2img=False,
    )


def generate_current_canvas_regional_anima_img2img(
    recipe: object,
    *,
    command: GenerateAnimaImg2ImgCommand,
    compiled_prompts: object,
    models: LoadedAnimaModels,
    runtime: MLRuntime,
    profile: _Profile,
    tokenizers: AnimaTokenizers | None = None,
    composition_profile: _CompositionProfile | None = None,
    on_progress: DenoisingProgressSink | None = None,
    sampling_profile: _SamplingProfile | None = None,
) -> dict[str, object]:
    """Verify one opaque source snapshot and reuse original Anima image sampling.

    Invoke b0ac163b139c432aff4c51078c31c074bf292f72:
    app/invocations/vae/anima_image_to_latents.py and
    frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts
    supply the image-to-latents/normalization and canvas graft mechanism.
    The existing ordinary executor owns posterior noise, selected
    clipped initial sigma, native driver and Wan decoding. Opaque image guidance
    adds no inpaint keep mask, contribution alpha or separate denoising loop.
    """
    return _generate_current_canvas_regional_anima(
        recipe,
        command=command,
        compiled_prompts=compiled_prompts,
        models=models,
        runtime=runtime,
        profile=profile,
        tokenizers=tokenizers,
        composition_profile=composition_profile,
        on_progress=on_progress,
        sampling_profile=sampling_profile,
        img2img=True,
    )


def _generate_current_canvas_regional_anima(
    recipe: object,
    *,
    command: GenerateAnimaTxt2ImgCommand,
    compiled_prompts: object,
    models: LoadedAnimaModels,
    runtime: MLRuntime,
    profile: _Profile,
    tokenizers: AnimaTokenizers | None,
    composition_profile: _CompositionProfile | None,
    on_progress: DenoisingProgressSink | None,
    sampling_profile: _SamplingProfile | None,
    img2img: bool,
) -> dict[str, object]:
    """One reservation/conditioning/target/cache owner for the two exact command modes."""
    _require(
        on_progress is None or callable(on_progress),
        "INVALID_REQUEST",
        "Anima regional progress requires a callable sink.",
    )
    _require(
        composition_profile is None
        or (
            type(composition_profile) is str
            and composition_profile == "invoke-krea2-global-support-v1"
        ),
        "INVALID_REQUEST",
        "Anima regional composition profile is unsupported.",
    )
    captured = _capture(recipe, compiled_prompts)
    plan = _capture_command(command, captured, sampling_profile=sampling_profile, img2img=img2img)
    x, y, width, height = captured.bbox
    command = replace(
        command,
        bbox={"x": x, "y": y, "width": width, "height": height},
        positive_prompt=captured.prompts[0].compiled,
        negative_prompt=captured.prompts[1].compiled,
        sampling=plan,
    )
    _require(
        type(models) is LoadedAnimaModels,
        "INFERENCE_UNAVAILABLE",
        "Prepared original Anima models are required.",
    )
    with _reserve(
        (models.transformer, models.text_conditioner, models.qwen3_encoder, models.vae),
        _MODEL_OWNERS,
    ):
        torch, attentions = _model_profile(models, runtime, profile)
        parameter = next(models.transformer.parameters())
        if composition_profile is None:
            mask = _prepare_mask(captured, attentions, torch, parameter.device, parameter.dtype)
        else:
            mask = _prepare_mask(
                captured,
                attentions,
                torch,
                parameter.device,
                parameter.dtype,
                composition_profile=composition_profile,
            )
        with _vae_cache_scope(models.vae):
            owned_tokenizers = _owned_tokenizers(tokenizers)
            _preflight_prompt_weights(captured, owned_tokenizers, torch, parameter.dtype)
            source = validate_generation_target(
                staging_root=command.staging_root,
                target_path=command.target_path,
                output_path=command.output_path,
                target_sha256=command.target_sha256,
                target_byte_size=command.target_byte_size,
                width=command.width,
                height=command.height,
                img2img=img2img,
            )
            result = execute_captured_anima_plan(
                plan,
                anima_prompt_payload(captured.prompts[0].compiled),
                anima_prompt_payload(captured.prompts[1].compiled),
                models,
                tokenizers=owned_tokenizers,
                initial_sigma=plan.initial_sigma,
                progress=on_progress,
                prediction_factory=None
                if mask is None
                else _prediction_factory(captured, models, owned_tokenizers, mask),
                denoiser_factory=None
                if plan.scheduler == "euler"
                else lambda torch, device: create_anima_native_denoiser(
                    plan, torch, device, step_seed=plan.step_seed
                ),
                **cast(Any, {"source_image": source} if img2img else {}),
            )
        _require(
            result.total_steps == plan.total_steps,
            "GENERATION_WORKER_FAILED",
            "Anima regional execution count differs.",
        )
        return publish_generation_image(
            result.image,
            staging_root=command.staging_root,
            output_path=command.output_path,
            width=command.width,
            height=command.height,
            request_id=command.request_id,
            seed=plan.seed,
            output_mode="RGB",
        )
