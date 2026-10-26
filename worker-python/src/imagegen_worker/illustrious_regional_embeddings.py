"""Finite exact-TI preparation for the private Current Canvas recipe reservation.

Only text-component graphs are copied. The shared-readonly strategy borrows
non-token registered tensors and owns only final token tables. Native UNet/Euler/
VAE ownership stays with existing consumers. External RNG writers, direct
forwards and registry/model mutation are outside this cooperative scope. No
global owned-model cache exists.
"""

from __future__ import annotations

import copy
import importlib
import math
import pickle
import re
import threading
import types
from collections import OrderedDict
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass, replace
from enum import Enum
from pathlib import Path
from typing import Any, Literal, cast

from .inference_embeddings import (
    EmbeddingConditioningInputs,
    PreparedEmbeddingBindings,
    _literal_ranges,  # pyright: ignore[reportPrivateUsage]
    _replace_ranges,  # pyright: ignore[reportPrivateUsage]
    install_prepared_embeddings,
    prepare_embedding_bindings,
    stage_embedding_aliases,
)
from .protocol import GenerationEmbedding, IllustriousInferenceParameters

_Code = Literal["INPUT_INVALID", "PROFILE_INVALID", "UNSUPPORTED", "LIMIT", "SCOPE_CONFLICT"]
_EmbeddingStrategy = Literal["independent-copy", "shared-readonly"]
_IDENTITY = (
    "kind",
    "localModelId",
    "localVersionId",
    "civitaiModelId",
    "civitaiVersionId",
    "civitaiFileId",
    "fileSha256",
    "baseModelFamily",
    "predictionType",
)
_MAX_DESCRIPTORS = 16
_MAX_SERIALIZED_BYTES = 64 * 1024 * 1024
_MAX_COPY_BYTES = 512 * 1024 * 1024
_MAX_TOKENIZER_BYTES = 8 * 1024 * 1024
_MAX_METADATA_BYTES = 32 * 1024 * 1024
_MAX_NODES = 1_000_000
_MAX_DEPTH = 64
_MAX_MODULES = 4096
_MAX_TENSORS = 16384
_MAX_VOCAB = 65536
_MAX_BORROWED_BYTES = 4 * 1024 * 1024 * 1024
_MAX_FINITE_ELEMENTS = 8 * 1024 * 1024
# Logical admission accounting only: two 32 MiB graph metadata ceilings,
# four 8 MiB tokenizer serialization ceilings and an 8 MiB plan allowance.
# This is neither a measurement nor a physical metadata/RSS/VRAM guarantee.
_SHARED_FIXED_ALLOWANCE_BYTES = 104 * 1024 * 1024
_RNG_LOCK = threading.Lock()


class IllustriousRegionalEmbeddingsError(ValueError):
    """Local preparation refusal; downstream embedding/native identities survive."""

    code: _Code

    def __init__(self, code: _Code, message: str) -> None:
        super().__init__(message)
        self.code = code


def _require(condition: bool, code: _Code, message: str) -> None:
    if not condition:
        raise IllustriousRegionalEmbeddingsError(code, message)


@dataclass(frozen=True, slots=True)
class RegionalEmbeddingResources:
    positive: tuple[GenerationEmbedding, ...]
    negative: tuple[GenerationEmbedding, ...]


def prompt_ref_keys(prompt: dict[str, Any]) -> tuple[tuple[Any, ...], ...]:
    """Names are display metadata; literals and exact source identities are binding data."""
    return tuple(
        (ref["token"], *(ref["resource"][key] for key in _IDENTITY))
        for ref in prompt["embeddingRefs"]
    )


def _ref_entries(refs: list[dict[str, Any]]) -> tuple[GenerationEmbedding, ...]:
    return tuple(
        GenerationEmbedding(ref["token"], Path("/"), ref["resource"]["fileSha256"], 1)
        for ref in refs
    )


def masked_ref_text(text: str, refs: list[dict[str, Any]]) -> str:
    # Structural reference validation belongs to the recipe parser. This adds
    # literal activity/uniqueness and the ordinary UTF-16 overlap priority.
    for ref in refs:
        token = ref["token"]
        _require("\x00" not in token, "INPUT_INVALID", "Embedding literals cannot contain NUL.")
        try:
            size = len(token.encode("utf-8", errors="strict"))
        except UnicodeEncodeError as error:
            raise IllustriousRegionalEmbeddingsError(
                "INPUT_INVALID", "Embedding literals must be valid UTF-8."
            ) from error
        _require(size <= 16 * 1024, "LIMIT", "An active literal exceeds 16 KiB UTF-8.")
        resource = ref["resource"]
        _require(
            resource["baseModelFamily"] == "illustrious"
            and resource["predictionType"] is None
            and all(
                type(resource[key]) is int
                for key in ("civitaiModelId", "civitaiVersionId", "civitaiFileId")
            ),
            "UNSUPPORTED",
            "Active exact TI requires complete Illustrious embedding identities "
            "and no prediction type.",
        )
    ranges = _literal_ranges(text, _ref_entries(refs))
    return _replace_ranges(text, ranges, ["igs_embedding"] * len(refs))


def validate_authored_selection(authored: dict[str, Any], effective: dict[str, Any]) -> None:
    """Validate only the active authored subset; dormant references never become resources."""
    refs = authored["embeddingRefs"]
    unique: dict[str, dict[str, Any]] = {}
    ambiguous: set[str] = set()
    for ref in refs:
        token = ref["token"]
        if token in unique:
            old = unique[token]
            if tuple(old["resource"][key] for key in _IDENTITY) != tuple(
                ref["resource"][key] for key in _IDENTITY
            ):
                ambiguous.add(token)
        else:
            unique[token] = ref
    candidates = list(unique.values())
    # Dormant literals may contain unsupported authored syntax. They are not
    # parsed or loaded. UTF-16 ranges still require valid strings, as in Main.
    try:
        ranges = _literal_ranges(authored["text"], _ref_entries(candidates), require_all=False)
    except UnicodeEncodeError as error:
        raise IllustriousRegionalEmbeddingsError(
            "INPUT_INVALID", "Authored embedding literal ranges must be valid UTF-16."
        ) from error
    active: dict[int, int] = {}
    for start, _, index in ranges:
        active.setdefault(index, start)
    selected = [candidates[index] for index in sorted(active, key=lambda item: active[item])]
    _require(
        not any(ref["token"] in ambiguous for ref in selected)
        and prompt_ref_keys({"embeddingRefs": selected}) == prompt_ref_keys(effective),
        "INPUT_INVALID",
        "Effective references must exactly equal the active authored bindings.",
    )


def recipe_embedding_resources(
    value: object, *, positive: dict[str, Any] | None, negative: dict[str, Any]
) -> RegionalEmbeddingResources:
    _require(
        type(value) is dict and value.keys() == {"positive", "negative"},
        "INPUT_INVALID",
        "Every TI pair requires exactly positive/negative resolved resources.",
    )
    resources = cast(dict[str, Any], value)
    signed: list[tuple[GenerationEmbedding, ...]] = []
    for sign, prompt in (("positive", positive), ("negative", negative)):
        values = resources[sign]
        refs: list[dict[str, Any]] = [] if prompt is None else prompt["embeddingRefs"]
        _require(
            type(values) is list and len(values) == len(refs),
            "INPUT_INVALID",
            "Resolved resources must exactly match the effective references of their sign.",
        )
        _require(len(values) <= _MAX_DESCRIPTORS, "LIMIT", "Too many active TI descriptors.")
        entries: list[GenerationEmbedding] = []
        for descriptor, ref in zip(cast(list[dict[str, Any]], values), refs, strict=True):
            _require(
                type(descriptor) is dict
                and descriptor.keys() == {"token", "byteSize", "managedPath", "reference"},
                "INPUT_INVALID",
                "Invalid frozen embedding descriptor fields.",
            )
            resource = cast(dict[str, Any], descriptor["reference"])
            _require(
                type(resource) is dict
                and resource.keys() == ref["resource"].keys()
                and all(type(key) is str for key in resource)
                and all(type(resource[key]) is type(ref["resource"][key]) for key in resource)
                and all(resource[key] == ref["resource"][key] for key in _IDENTITY)
                and all(
                    type(resource[key]) is str and bool(resource[key].strip())
                    for key in ("displayName", "versionName")
                )
                and type(descriptor["token"]) is str
                and descriptor["token"] == ref["token"],
                "INPUT_INVALID",
                "Resolved TI identity/literal disagrees with its effective reference.",
            )
            path, size = descriptor["managedPath"], descriptor["byteSize"]
            _require(
                type(path) is str
                and bool(path)
                and "\x00" not in path
                and Path(path).is_absolute()
                and type(size) is int
                and 1 <= size <= 2**53 - 1,
                "INPUT_INVALID",
                "TI descriptors require an absolute managed path and safe byte size.",
            )
            entries.append(
                GenerationEmbedding(
                    ref["token"], Path(cast(str, path)), resource["fileSha256"], cast(int, size)
                )
            )
        signed.append(tuple(entries))
    return RegionalEmbeddingResources(signed[0], signed[1])


def reject_ti_global_hooks() -> None:
    native = cast(Any, importlib.import_module("torch.nn.modules.module"))
    _require(
        all(
            not getattr(native, key)
            for key in (
                "_global_forward_pre_hooks",
                "_global_forward_hooks",
                "_global_parameter_registration_hooks",
                "_global_buffer_registration_hooks",
                "_global_module_registration_hooks",
            )
        ),
        "PROFILE_INVALID",
        "TI copying/loading refuses global forward and registration hooks.",
    )


def bounded_ti_module_tree(root: Any) -> tuple[Any, ...]:
    """Bound the native CLIP tree before the existing profile walkers materialize it."""
    modules: list[Any] = []
    seen: set[int] = set()
    pending = [root]
    while pending:
        module = pending.pop()
        _require(
            id(module) not in seen, "PROFILE_INVALID", "Shared/cyclic CLIP modules are unsupported."
        )
        seen.add(id(module))
        modules.append(module)
        children = module.__dict__.get("_modules")
        _require(
            type(children) in (dict, OrderedDict),
            "PROFILE_INVALID",
            "Invalid native CLIP registry.",
        )
        _require(
            len(modules) + len(pending) + len(children) <= _MAX_MODULES,
            "LIMIT",
            "Native CLIP module count exceeds 4,096.",
        )
        pending.extend(child for child in children.values() if child is not None)
    return tuple(modules)


def _capture_hooks(modules: tuple[Any, ...]) -> frozenset[int]:
    _require(
        len({id(module) for module in modules}) == len(modules),
        "PROFILE_INVALID",
        "The two native CLIP trees must not share modules.",
    )
    native = cast(Any, importlib.import_module("transformers.utils.output_capturing"))
    clip = cast(Any, importlib.import_module("transformers.models.clip.modeling_clip"))
    codes = tuple(
        value
        for value in native.install_output_capuring_hook.__code__.co_consts
        if type(value) is types.CodeType and value.co_name == "output_capturing_hook"
    )
    _require(len(codes) == 1, "PROFILE_INVALID", "Unsupported native capture hook implementation.")
    allowed: set[int] = set()
    for module in modules:
        _require(
            not module._forward_pre_hooks
            and not module._forward_pre_hooks_with_kwargs
            and not module._forward_hooks_with_kwargs
            and not module._forward_hooks_always_called
            and not module._backward_hooks
            and not module._backward_pre_hooks
            and not module._state_dict_hooks
            and not module._state_dict_pre_hooks
            and not module._load_state_dict_pre_hooks
            and not module._load_state_dict_post_hooks,
            "PROFILE_INVALID",
            "TI permits only pinned native local output-capture hooks.",
        )
        expected = (
            ("hidden_states", 0)
            if type(module) is clip.CLIPEncoderLayer
            else ("attentions", 1)
            if type(module) is clip.CLIPAttention
            else None
        )
        actual: list[tuple[Any, Any]] = []
        for hook in module._forward_hooks.values():
            _require(
                type(hook) is types.FunctionType
                and hook.__code__ is codes[0]
                and hook.__globals__ is native.__dict__
                and not hook.__dict__
                and hook.__defaults__ is None
                and hook.__kwdefaults__ is None
                and hook.__code__.co_freevars == ("index", "key")
                and hook.__closure__ is not None
                and len(hook.__closure__) == 2,
                "PROFILE_INVALID",
                "Custom capture closures are outside the exact TI profile.",
            )
            try:
                index, key = (
                    cell.cell_contents for cell in cast(tuple[Any, ...], hook.__closure__)
                )
            except ValueError as error:
                raise IllustriousRegionalEmbeddingsError(
                    "PROFILE_INVALID", "Native capture hook closure cells must be populated."
                ) from error
            _require(
                type(index) is int and type(key) is str and (key, index) == expected,
                "PROFILE_INVALID",
                "Native capture hooks must retain their original key/index owners.",
            )
            actual.append((key, index))
            allowed.add(id(hook))
        _require(
            actual == ([] if expected is None else [expected]),
            "PROFILE_INVALID",
            "Both warmed CLIPs require their complete original native capture hooks.",
        )
    return frozenset(allowed)


@dataclass(frozen=True, slots=True)
class _State:
    mutable: frozenset[int]
    storages: frozenset[tuple[str, int]]
    tensor_bytes: int


def _native_backend_decode_state(backend: Any) -> types.FunctionType | None:
    """Admit only CLIP's pinned decoder wrapper around this exact native backend.

    Its only mutable closure owner is the builtin decode method's backend. The
    wrapper is deliberately not copied as a generic Python callable: native
    Tokenizer deepcopy drops Python instance attributes, and the owned wrapper
    is installed separately after verifying that native copy behavior.
    """
    state = cast(dict[str, Any], getattr(backend, "__dict__", {}))
    if not state:
        return None
    _require(
        type(state) is dict and state.keys() == {"decode"},
        "PROFILE_INVALID",
        "Custom tokenizer state.",
    )
    native = cast(Any, importlib.import_module("transformers.models.clip.tokenization_clip"))
    helper = native.CLIPTokenizer._wrap_decode_method_backend_tokenizer
    codes = tuple(
        value
        for value in helper.__code__.co_consts
        if type(value) is types.CodeType and value.co_name == "new_decode_method"
    )
    _require(len(codes) == 1, "PROFILE_INVALID", "Unsupported native CLIP decode helper.")
    callback = state["decode"]
    _require(
        type(callback) is types.FunctionType
        and callback.__code__ is codes[0]
        and callback.__globals__ is native.__dict__
        and not callback.__dict__
        and callback.__defaults__ is None
        and callback.__kwdefaults__ is None
        and callback.__code__.co_freevars == ("end_of_word_suffix", "orig_decode_method")
        and callback.__closure__ is not None
        and len(callback.__closure__) == 2,
        "PROFILE_INVALID",
        "Custom CLIP decode shadows are unsupported.",
    )
    try:
        suffix, original = (
            cell.cell_contents for cell in cast(tuple[Any, ...], callback.__closure__)
        )
    except ValueError as error:
        raise IllustriousRegionalEmbeddingsError(
            "PROFILE_INVALID", "Native CLIP decode closure cells must be populated."
        ) from error
    _require(
        type(suffix) is str
        and suffix == "</w>" == backend.model.end_of_word_suffix
        and type(original) is types.BuiltinMethodType
        and original.__self__ is backend
        and original.__name__ == "decode",
        "PROFILE_INVALID",
        "Native CLIP decode must close only its own builtin and pinned suffix.",
    )
    return callback


def _rebind_owned_tokenizer_decode(source: Any, owned: Any) -> None:
    source_backend = source.backend_tokenizer
    source_wrapper = _native_backend_decode_state(source_backend)
    backend = owned.backend_tokenizer
    _require(
        backend is not source_backend
        and not getattr(backend, "__dict__", {})
        and type(backend.decode) is types.BuiltinMethodType
        and backend.decode.__self__ is backend
        and backend.decode.__name__ == "decode",
        "PROFILE_INVALID",
        "Native tokenizer deepcopy must restore its own builtin decoder.",
    )
    if source_wrapper is not None:
        native = cast(Any, importlib.import_module("transformers.models.clip.tokenization_clip"))
        # The observed native copy has already restored the builtin. Apply the
        # primary native helper once, to this owned tokenizer alone.
        native.CLIPTokenizer._wrap_decode_method_backend_tokenizer(owned)
        wrapper = _native_backend_decode_state(backend)
        _require(
            wrapper is not None and wrapper is not source_wrapper,
            "PROFILE_INVALID",
            "Owned CLIP decode must have a fresh independently bound wrapper.",
        )


def _bounded_native_state(
    roots: tuple[Any, ...],
    torch: Any,
    hooks: frozenset[int],
    *,
    shared_readonly: bool = False,
) -> _State:
    """Refuse opaque/custom copy state before invoking any deepcopy/reducer.

    Only exact pinned native objects, standard containers and immutable leaves
    enter the copier. Namespace membership alone never admits a Python class.
    """
    transformers = cast(Any, importlib.import_module("transformers"))
    tokenizers = cast(Any, importlib.import_module("tokenizers"))
    activations: Any = (
        cast(Any, importlib.import_module("transformers.activations")) if shared_readonly else None
    )
    allowed_objects = {
        transformers.CLIPTokenizer,
        transformers.CLIPTokenizerFast,
        transformers.CLIPTextConfig,
    }
    # Do not import optional slow-tokenizer modules unless such an exact native
    # object is actually present in the already configured tokenizer's state.
    metadata_classes = {
        ("transformers.tokenization_utils", "Trie"),
        ("transformers.models.bert.tokenization_bert", "BasicTokenizer"),
    }
    regex = cast(Any, importlib.import_module("regex"))
    patterns: tuple[type[Any], type[Any]] = (
        type(re.compile("")),
        cast(type[Any], type(regex.compile(""))),
    )
    seen: set[int] = set()
    mutable: set[int] = set()
    storages: set[tuple[str, int]] = set()
    metadata_bytes = nodes = modules = tensors = tensor_bytes = 0
    registered_modules = {
        id(module): module
        for root in roots
        if isinstance(root, torch.nn.Module)
        for module in bounded_ti_module_tree(root)
    }
    tensor_registrations = tuple(
        id(tensor)
        for module in registered_modules.values()
        for registry in (module._parameters, module._buffers)
        for tensor in registry.values()
        if tensor is not None
    )
    registered_tensors = set(tensor_registrations)
    _require(
        len(registered_tensors) <= _MAX_TENSORS, "LIMIT", "Native tensor count exceeds 16,384."
    )
    _require(
        len(registered_tensors) == len(tensor_registrations),
        "PROFILE_INVALID",
        "Native CLIP tensors must have distinct registration owners.",
    )

    def visit(value: Any, depth: int) -> None:
        nonlocal metadata_bytes, nodes, modules, tensors, tensor_bytes
        nodes += 1
        _require(
            nodes <= _MAX_NODES and depth <= _MAX_DEPTH, "LIMIT", "Native copy graph is too large."
        )
        cls = cast(Any, type(value))
        if value is None or cls in (bool, int, float, str, bytes):
            if cls is float:
                _require(
                    math.isfinite(cast(float, value)),
                    "PROFILE_INVALID",
                    "Nonfinite native copy metadata.",
                )
            metadata_bytes += (
                len(cast(str, value).encode("utf-8"))
                if cls is str
                else len(cast(bytes, value))
                if cls is bytes
                else 8
            )
            _require(
                metadata_bytes <= _MAX_METADATA_BYTES,
                "LIMIT",
                "Native copy metadata exceeds 32 MiB.",
            )
            return
        if cls in (torch.dtype, torch.device) or cls in patterns:
            return
        if shared_readonly and value is torch.nn.functional.gelu:
            # Only the exact pure native builtin used by GELUActivation. No
            # Python GELU branch, partial, bound method or arbitrary callable.
            return
        if cls is types.FunctionType:
            _require(
                id(value) in hooks, "PROFILE_INVALID", "Opaque callable copy state is unsupported."
            )
            return
        if isinstance(value, Enum):
            _require(
                cls.__module__
                in ("transformers.tokenization_utils_base", "transformers.utils.generic")
                and cls.__members__.get(value.name) is value,
                "PROFILE_INVALID",
                "Unsupported native metadata enum.",
            )
            return
        if id(value) in seen:
            return
        seen.add(id(value))
        if cls in (tuple, frozenset, list, set, dict, OrderedDict):
            if cls in (list, set, dict, OrderedDict):
                mutable.add(id(value))
            _require(
                len(value) <= _MAX_NODES - nodes, "LIMIT", "Native copy container is too large."
            )
            for item in value.items() if cls in (dict, OrderedDict) else value:
                if cls in (dict, OrderedDict):
                    visit(item[0], depth + 1)
                    visit(item[1], depth + 1)
                else:
                    visit(item, depth + 1)
            return
        if cls in (torch.Tensor, torch.nn.Parameter):
            tensors += 1
            _require(
                tensors <= _MAX_TENSORS
                and id(value) in registered_tensors
                and value.layout == torch.strided
                and value.is_leaf
                and value.grad is None
                and value.__dict__.keys() <= {"_is_hf_initialized"}
                and all(type(item) is bool for item in value.__dict__.values())
                and not getattr(value, "_backward_hooks", None),
                "PROFILE_INVALID",
                "Custom tensor/copy state or tensor gradients are unsupported.",
            )
            size = value.numel() * value.element_size()
            storage = value.untyped_storage()
            _require(
                value.storage_offset() == 0 and storage.nbytes() == size,
                "PROFILE_INVALID",
                "Native tensor copy state must have bounded exact storage.",
            )
            identity = (str(value.device), storage.data_ptr())
            _require(
                size == 0 or identity not in storages,
                "PROFILE_INVALID",
                "Shared native tensor storage is outside the owned TI profile.",
            )
            if size:
                storages.add(identity)
            tensor_bytes += size
            mutable.add(id(value))
            return
        if cls is tokenizers.Tokenizer or cls is tokenizers.AddedToken:
            if cls is tokenizers.Tokenizer:
                _native_backend_decode_state(value)
                mutable.add(id(value.__dict__))
                _require(
                    value.get_vocab_size() <= _MAX_VOCAB,
                    "LIMIT",
                    "Native tokenizer vocabulary exceeds 65,536 tokens.",
                )
                try:
                    serialized_size = len(value.to_str().encode("utf-8"))
                except Exception as error:
                    raise IllustriousRegionalEmbeddingsError(
                        "PROFILE_INVALID", "Opaque/custom tokenizer backends cannot be copied."
                    ) from error
                _require(
                    serialized_size <= _MAX_TOKENIZER_BYTES,
                    "LIMIT",
                    "Serialized tokenizer backend exceeds 8 MiB.",
                )
            else:
                _require(
                    not getattr(value, "__dict__", {}), "PROFILE_INVALID", "Custom tokenizer state."
                )
            mutable.add(id(value))
            return
        is_module = isinstance(value, torch.nn.Module)
        if is_module:
            modules += 1
            _require(modules <= _MAX_MODULES, "LIMIT", "Native CLIP module count exceeds 4,096.")
            _require(
                id(value) in registered_modules
                and (
                    cls.__module__.startswith(("torch.nn.", "transformers.models.clip."))
                    or (
                        cls.__module__ == "transformers.activations"
                        and cls.__name__ == "QuickGELUActivation"
                    )
                    or (shared_readonly and cls is activations.GELUActivation)
                ),
                "PROFILE_INVALID",
                "Unsupported native CLIP copy class.",
            )
            if shared_readonly and cls is activations.GELUActivation:
                _require(
                    value.act is torch.nn.functional.gelu,
                    "PROFILE_INVALID",
                    "Shared native GELU requires its exact pure builtin activation.",
                )
        _require(
            (
                is_module
                or cls in allowed_objects
                or (cls.__module__, cls.__name__) in metadata_classes
            )
            and getattr(importlib.import_module(cls.__module__), cls.__name__, None) is cls,
            "PROFILE_INVALID",
            "Opaque native copy state is unsupported.",
        )
        for name in (
            "__deepcopy__",
            "__copy__",
            "__reduce__",
            "__reduce_ex__",
            "__getstate__",
            "__setstate__",
        ):
            method = getattr(cls, name, None)
            _require(
                method is None
                or method is getattr(object, name, None)
                or (
                    getattr(method, "__module__", "").startswith(("torch.nn.", "transformers."))
                    and (name != "__deepcopy__" or cls in allowed_objects)
                ),
                "PROFILE_INVALID",
                "Custom native copy/reduction behavior is unsupported.",
            )
        state = cast(dict[str, Any], value.__dict__)
        _require(
            type(state) is dict
            and all(type(key) is str and not callable(getattr(cls, key, None)) for key in state)
            and not any(key.startswith("__") for key in state),
            "PROFILE_INVALID",
            "Native copy objects must not shadow methods or copy protocols.",
        )
        mutable.add(id(value))
        visit(state, depth + 1)

    for root in roots:
        visit(root, 0)
    return _State(frozenset(mutable), frozenset(storages), tensor_bytes)


class _TokenizerSize:
    size: int = 0

    def write(self, data: bytes) -> int:
        self.size += len(data)
        _require(
            self.size <= _MAX_TOKENIZER_BYTES,
            "LIMIT",
            "Serialized tokenizer state exceeds 8 MiB.",
        )
        return len(data)


def _tokenizer_sizes(tokenizers: tuple[Any, Any]) -> None:
    for tokenizer in tokenizers:
        _require(len(tokenizer) <= _MAX_VOCAB, "LIMIT", "Tokenizer exceeds 65,536 tokens.")
        # Every reachable reducer was qualified before this bounded in-memory serialization.
        pickle.Pickler(_TokenizerSize(), protocol=5).dump(tokenizer)


@dataclass(frozen=True, slots=True)
class _CopyBudget:
    parameter_buffer_bytes: int
    alias_growth_bytes: int
    replacement_scratch_bytes: int

    @property
    def total(self) -> int:
        return (
            self.parameter_buffer_bytes + self.alias_growth_bytes + self.replacement_scratch_bytes
        )


def _copy_budget(state: _State, encoders: tuple[Any, Any], vectors: int) -> _CopyBudget:
    growth = 0
    scratch: list[int] = []
    for encoder in encoders:
        weight = encoder.get_input_embeddings().weight
        rows, width = weight.shape
        item = weight.element_size()
        growth += vectors * width * item
        # One replacement table plus conservative float32 old/centered tables,
        # covariance/factorization buffers and sampled rows. Native workspaces,
        # tokenizer/config metadata and allocator overhead are separate lifetimes.
        scratch.append(
            (rows + vectors) * width * item
            + 2 * rows * width * 4
            + 8 * width * width * 4
            + 4 * (vectors + 1) * width * 4
        )
    budget = _CopyBudget(state.tensor_bytes, growth, max(scratch))
    _require(
        budget.total <= _MAX_COPY_BYTES,
        "LIMIT",
        f"Owned CLIP payload {budget.parameter_buffer_bytes} + alias growth {growth} + "
        f"replacement scratch {budget.replacement_scratch_bytes} = {budget.total} bytes "
        f"exceeds private {_MAX_COPY_BYTES}-byte copy ceiling (not RSS/VRAM).",
    )
    return budget


def _independent_copy(roots: tuple[Any, ...], torch: Any, hooks: frozenset[int]) -> tuple[Any, ...]:
    before = _bounded_native_state(roots, torch, hooks)
    # A caller may legitimately use the same base tokenizer for both CLIPs.
    # Give each execution tokenizer its own native copy/memo, while preserving
    # each encoder's internal config/module relationships within that copy.
    owned = tuple(copy.deepcopy(root) for root in roots)
    for source, current in zip(roots, owned, strict=True):
        if not isinstance(source, torch.nn.Module):
            _rebind_owned_tokenizer_decode(source, current)
    after = _bounded_native_state(owned, torch, hooks)
    _require(
        before.mutable.isdisjoint(after.mutable)
        and before.storages.isdisjoint(after.storages)
        and before.tensor_bytes == after.tensor_bytes,
        "PROFILE_INVALID",
        "Native deepcopy did not independently own all mutable state and storage.",
    )
    for source, clone in zip(roots, owned, strict=True):
        _require(
            type(source) is type(clone),
            "PROFILE_INVALID",
            "Native deepcopy changed a component type.",
        )
        if isinstance(source, torch.nn.Module):
            originals, copies = tuple(source.modules()), tuple(clone.modules())
            _require(
                len(originals) == len(copies),
                "PROFILE_INVALID",
                "Native deepcopy changed the module tree.",
            )
            for original, current in zip(originals, copies, strict=True):
                _require(
                    type(original) is type(current)
                    and original.training is current.training
                    and tuple(original._forward_hooks.items())
                    == tuple(current._forward_hooks.items()),
                    "PROFILE_INVALID",
                    "Native deepcopy changed module state or native capture registries.",
                )
                for key in ("_parameters", "_buffers"):
                    left, right = getattr(original, key), getattr(current, key)
                    _require(
                        left.keys() == right.keys(),
                        "PROFILE_INVALID",
                        "Native copy changed tensor keys.",
                    )
                    for name, value in left.items():
                        copied = right[name]
                        _require(
                            copied is None
                            if value is None
                            else (
                                type(value) is type(copied)
                                and value.device == copied.device
                                and value.dtype == copied.dtype
                                and value.shape == copied.shape
                                and value.requires_grad is copied.requires_grad
                                and torch.equal(value, copied)
                            ),
                            "PROFILE_INVALID",
                            "Native deepcopy changed a parameter or buffer.",
                        )
        else:
            _require(
                source.get_vocab() == clone.get_vocab()
                and source.get_added_vocab() == clone.get_added_vocab(),
                "PROFILE_INVALID",
                "Native deepcopy changed a tokenizer vocabulary.",
            )
    return owned


@dataclass(frozen=True, slots=True)
class _SharedReadonlyBudget:
    """Source residency is separate from the logical private admission charge."""

    borrowed_bytes: int
    shared_bytes: int
    final_table_bytes: int
    fixed_allowance_bytes: int = _SHARED_FIXED_ALLOWANCE_BYTES

    @property
    def total(self) -> int:
        return self.final_table_bytes + self.fixed_allowance_bytes


def _registered_tensors(encoders: tuple[Any, ...]) -> tuple[Any, ...]:
    return tuple(
        tensor
        for encoder in encoders
        for module in bounded_ti_module_tree(encoder)
        for registry in (module._parameters, module._buffers)
        for tensor in registry.values()
        if tensor is not None
    )


def _shared_native_profile(encoders: tuple[Any, ...], torch: Any) -> None:
    """Qualify every native resize/forward branch that could write borrowed weights."""
    native = cast(Any, importlib.import_module("transformers.modeling_utils"))
    clip = cast(Any, importlib.import_module("transformers.models.clip.modeling_clip"))
    activations = cast(Any, importlib.import_module("transformers.activations"))
    # Namespace/native identity alone does not imply readonly forwards: native
    # normalization and embedding consumers can write registered buffers/weights.
    # Admit only the exact classes used by the qualified dual-CLIP text graph.
    allowed_modules = {
        clip.CLIPTextModel,
        clip.CLIPTextModelWithProjection,
        clip.CLIPTextTransformer,
        clip.CLIPTextEmbeddings,
        clip.CLIPEncoder,
        clip.CLIPEncoderLayer,
        clip.CLIPAttention,
        clip.CLIPMLP,
        torch.nn.Embedding,
        torch.nn.LayerNorm,
        torch.nn.Linear,
        torch.nn.ModuleList,
        activations.QuickGELUActivation,
        activations.GELUActivation,
    }
    _require(
        not native.is_deepspeed_zero3_enabled(),
        "PROFILE_INVALID",
        "Shared readonly TI refuses native DeepSpeed ZeRO-3 resizing.",
    )
    for encoder in encoders:
        table = encoder.get_input_embeddings()
        _require(
            type(table) is torch.nn.Embedding
            and table._parameters.keys() == {"weight"}
            and type(table.weight) is torch.nn.Parameter
            and not table._buffers
            and not table._modules
            and type(table.num_embeddings) is int
            and type(table.embedding_dim) is int
            and tuple(table.weight.shape) == (table.num_embeddings, table.embedding_dim),
            "PROFILE_INVALID",
            "Shared TI requires a standard leaf input Embedding containing only its weight.",
        )
        for module in bounded_ti_module_tree(encoder):
            _require(
                not isinstance(module, torch.nn.EmbeddingBag),
                "PROFILE_INVALID",
                "Shared readonly TI refuses native EmbeddingBag consumers.",
            )
            kind = cast(Any, type(module))
            _require(
                kind in allowed_modules,
                "PROFILE_INVALID",
                f"Shared readonly TI refuses unqualified CLIP consumer {kind.__name__}.",
            )
            _require(
                not isinstance(module, torch.nn.Embedding) or module.max_norm is None,
                "PROFILE_INVALID",
                "Shared readonly TI refuses max_norm on every embedding, including positions.",
            )
            config = getattr(module, "config", None)
            _require(
                not getattr(module, "is_quantized", False)
                and not getattr(module, "is_loaded_in_4bit", False)
                and not getattr(module, "is_loaded_in_8bit", False)
                and getattr(module, "hf_quantizer", None) is None
                and getattr(module, "quantization_method", None) is None
                and getattr(config, "quantization_config", None) is None
                and not getattr(module, "hf_device_map", None)
                and not hasattr(module, "_hf_hook")
                and not getattr(module, "_all_hooks", ())
                and getattr(module, "final_offload_hook", None) is None,
                "PROFILE_INVALID",
                "Shared readonly TI refuses quantization and offload state.",
            )
            _require(
                not getattr(module, "all_tied_weights_keys", None)
                and not getattr(module, "_dynamic_tied_weights_keys", None),
                "PROFILE_INVALID",
                "Shared readonly TI refuses cached tied-weight metadata.",
            )
            if isinstance(module, native.PreTrainedModel):
                _require(
                    module.get_output_embeddings() is None,
                    "PROFILE_INVALID",
                    "Shared readonly TI refuses native output embeddings.",
                )
                try:
                    ties = module.get_expanded_tied_weights_keys(all_submodels=True)
                except Exception as error:
                    raise IllustriousRegionalEmbeddingsError(
                        "PROFILE_INVALID", "Native tied-weight expansion could not be qualified."
                    ) from error
                _require(
                    type(ties) is dict and not ties,
                    "PROFILE_INVALID",
                    "Shared readonly TI requires empty effective ties across all submodels.",
                )


def _shared_source_state(roots: tuple[Any, ...], torch: Any, hooks: frozenset[int]) -> _State:
    state = _bounded_native_state(roots, torch, hooks, shared_readonly=True)
    _require(
        state.tensor_bytes <= _MAX_BORROWED_BYTES,
        "LIMIT",
        f"Borrowed CLIP registered payload {state.tensor_bytes} exceeds the separate "
        f"{_MAX_BORROWED_BYTES}-byte source ceiling (including input tables).",
    )
    _shared_native_profile(roots[2:], torch)
    for tensor in _registered_tensors(roots[2:]):
        _require(
            tensor.is_contiguous() and not tensor.is_conj() and not tensor.is_neg(),
            "PROFILE_INVALID",
            "Shared source tensors require contiguous exact storage "
            "without conjugate/negative views.",
        )
        # Native position_ids is an arange(...).expand((1, -1)) full-storage
        # view. A _base is permitted only within the already qualified zero-
        # offset, exact-storage and distinct-registration/storage contract.
    return state


def _shared_readonly_budget(
    state: _State, encoders: tuple[Any, ...], prepared: PreparedEmbeddingBindings
) -> _SharedReadonlyBudget:
    base_tables = final_tables = 0
    for encoder, vocabulary in zip(encoders, prepared.vocabularies, strict=True):
        weight = encoder.get_input_embeddings().weight
        rows, width = weight.shape
        _require(
            rows + sum(prepared.counts) == len(vocabulary) <= _MAX_VOCAB,
            "LIMIT",
            "Shared final vocabulary must fit the complete bounded alias expansion.",
        )
        base_tables += weight.numel() * weight.element_size()
        final_tables += len(vocabulary) * width * weight.element_size()
    budget = _SharedReadonlyBudget(
        state.tensor_bytes, state.tensor_bytes - base_tables, final_tables
    )
    _require(
        budget.total <= _MAX_COPY_BYTES,
        "LIMIT",
        f"Shared readonly final tables {budget.final_table_bytes} + fixed logical metadata/"
        f"scratch allowance {budget.fixed_allowance_bytes} = {budget.total} bytes exceeds "
        f"private {_MAX_COPY_BYTES}-byte admission ceiling (not RSS/VRAM); borrowed "
        f"registered payload {budget.borrowed_bytes}, shared subset {budget.shared_bytes}.",
    )
    return budget


def _finite_shared_source(encoders: tuple[Any, ...], torch: Any) -> None:
    # All graph, storage and budget checks precede this scan. Contiguous views
    # make each finite-check temporary at most eight Mi elements, without a
    # source clone or a whole-table comparison that could conceal NaNs.
    for tensor in _registered_tensors(encoders):
        if tensor.is_floating_point():
            flat = tensor.view(-1)
            for start in range(0, tensor.numel(), _MAX_FINITE_ELEMENTS):
                _require(
                    bool(torch.isfinite(flat[start : start + _MAX_FINITE_ELEMENTS]).all().item()),
                    "PROFILE_INVALID",
                    "Every shared source floating parameter/buffer must be finite.",
                )


def _shared_storage_ids(tensors: tuple[Any, ...]) -> frozenset[tuple[str, int]]:
    return frozenset(
        (str(tensor.device), tensor.untyped_storage().data_ptr())
        for tensor in tensors
        if tensor.numel()
    )


def _verify_shared_ownership(
    before: _State,
    roots: tuple[Any, ...],
    owned: tuple[Any, ...],
    replacements: dict[int, Any],
    memos: tuple[dict[int, Any], ...],
    torch: Any,
    hooks: frozenset[int],
) -> None:
    """Compare the complete qualified graph before changing any copied metadata."""
    after = _bounded_native_state(owned, torch, hooks, shared_readonly=True)
    shared = tuple(t for t in _registered_tensors(roots[2:]) if id(t) not in replacements)
    shared_ids = frozenset(id(tensor) for tensor in shared)
    shared_storages = _shared_storage_ids(shared)
    final_storages = _shared_storage_ids(tuple(replacements.values()))
    _require(
        before.mutable & after.mutable == shared_ids
        and before.storages & after.storages == shared_storages
        and len(final_storages) == len(replacements)
        and final_storages.isdisjoint(before.storages)
        and after.storages == shared_storages | final_storages
        and after.tensor_bytes
        == sum(t.numel() * t.element_size() for t in (*shared, *replacements.values())),
        "PROFILE_INVALID",
        "Shared copy must borrow exactly the planned non-token tensors "
        "and own final token storage.",
    )
    native_tokenizers = cast(Any, importlib.import_module("tokenizers"))
    # Each tokenizer deliberately has its own memo, even if the base is reused.
    # Both encoders use one memo so cross-module/config relationships survive.
    associations: dict[int, tuple[dict[int, int], dict[int, int]]] = {}

    def compare(source: Any, current: Any, memo: dict[int, Any]) -> None:
        cls = cast(Any, type(source))
        _require(cls is type(current), "PROFILE_INVALID", "Shared copy changed a graph type.")
        if source is None or cls in (bool, int, float, str, bytes, torch.dtype, torch.device):
            _require(source == current, "PROFILE_INVALID", "Shared copy changed native metadata.")
            return
        if cls in (torch.Tensor, torch.nn.Parameter):
            expected = replacements.get(id(source), source)
            _require(
                current is expected
                and source.dtype == current.dtype
                and source.device == current.device
                and source.requires_grad is current.requires_grad
                and source.__dict__ == current.__dict__
                and current.grad is None
                and current.is_leaf
                and current.is_contiguous()
                and (
                    source.shape == current.shape
                    if expected is source
                    else source.shape[1:] == current.shape[1:]
                    and torch.equal(source, current[: source.shape[0]])
                ),
                "PROFILE_INVALID",
                "Shared copy changed a registered tensor, profile, flags or base token prefix.",
            )
            return
        forward, reverse = associations.setdefault(id(memo), ({}, {}))
        if id(source) in forward:
            _require(
                forward[id(source)] == id(current),
                "PROFILE_INVALID",
                "Shared copy broke an internal graph relationship.",
            )
            return
        _require(
            id(current) not in reverse,
            "PROFILE_INVALID",
            "Shared copy merged distinct graph owners.",
        )
        forward[id(source)] = id(current)
        reverse[id(current)] = id(source)
        if id(source) in before.mutable:
            _require(
                source is not current, "PROFILE_INVALID", "Shared copy borrowed mutable metadata."
            )
        if cls is native_tokenizers.Tokenizer:
            _require(
                source.to_str() == current.to_str(),
                "PROFILE_INVALID",
                "Shared copy changed native tokenizer backend state.",
            )
        elif cls is native_tokenizers.AddedToken:
            _require(
                source.__getstate__() == current.__getstate__(),
                "PROFILE_INVALID",
                "Shared copy changed native added-token state.",
            )
        elif cls in (dict, OrderedDict):
            _require(
                len(source) == len(current), "PROFILE_INVALID", "Shared copy changed graph keys."
            )
            for (key, value), (other_key, other_value) in zip(
                source.items(), current.items(), strict=True
            ):
                compare(key, other_key, memo)
                compare(value, other_value, memo)
        elif cls in (tuple, list):
            _require(
                len(source) == len(current), "PROFILE_INVALID", "Shared copy changed a sequence."
            )
            for left, right in zip(source, current, strict=True):
                compare(left, right, memo)
        elif cls in (set, frozenset):
            _require(len(source) == len(current), "PROFILE_INVALID", "Shared copy changed a set.")
            for value in source:
                expected = memo.get(id(value), value)
                _require(
                    any(item is expected for item in current),
                    "PROFILE_INVALID",
                    "Shared copy changed set members.",
                )
                compare(value, expected, memo)
        elif hasattr(source, "__dict__") and not isinstance(source, (types.FunctionType, Enum)):
            compare(source.__dict__, current.__dict__, memo)
        else:
            # Qualified regexes, enums, native capture functions and the one
            # permitted GELU builtin are immutable leaves of native deepcopy.
            _require(source is current, "PROFILE_INVALID", "Shared copy changed an immutable leaf.")

    for source, current, memo in zip(roots, owned, memos, strict=True):
        compare(source, current, memo)


def _shared_readonly_copy(
    roots: tuple[Any, ...], plan: RegionalEmbeddingPlan, torch: Any
) -> tuple[Any, ...]:
    before = _shared_source_state(roots, torch, plan.hooks)
    _require(
        _shared_readonly_budget(before, roots[2:], plan.prepared) == plan.budget,
        "PROFILE_INVALID",
        "Shared source no longer matches the admitted payload/table budget.",
    )
    # Rebound staging tokenizers may have acquired native parser caches during
    # real Compel length checks. Requalify their bounds before final allocation.
    staged = (plan.staged.tokenizer, plan.staged.tokenizer_2)
    staged_state = _bounded_native_state(
        (*staged, *roots[2:]), torch, plan.hooks, shared_readonly=True
    )
    _tokenizer_sizes(staged)
    _finite_shared_source(roots[2:], torch)
    tokenizer_memos: tuple[dict[int, Any], dict[int, Any]] = ({}, {})
    tokenizers = tuple(
        copy.deepcopy(tokenizer, memo)
        for tokenizer, memo in zip(roots[:2], tokenizer_memos, strict=True)
    )
    for source, current in zip(roots[:2], tokenizers, strict=True):
        _rebind_owned_tokenizer_decode(source, current)
    execution_state = _bounded_native_state(tokenizers, torch, plan.hooks, shared_readonly=True)
    _tokenizer_sizes(cast(tuple[Any, Any], tokenizers))
    tokenizer_states = tuple(
        _bounded_native_state((tokenizer,), torch, plan.hooks, shared_readonly=True)
        for tokenizer in tokenizers
    )
    _require(
        execution_state.mutable.isdisjoint(before.mutable | staged_state.mutable)
        and tokenizer_states[0].mutable.isdisjoint(tokenizer_states[1].mutable),
        "PROFILE_INVALID",
        "Execution tokenizers must independently own base state, separate from source and staging.",
    )
    replacements: dict[int, Any] = {}
    for encoder, vocabulary in zip(roots[2:], plan.prepared.vocabularies, strict=True):
        source = encoder.get_input_embeddings().weight
        # Allocate the final Parameter directly: no old-sized clone, resize
        # replacement, random initialization or mean/covariance scratch.
        final = torch.nn.Parameter(
            torch.empty(
                (len(vocabulary), source.shape[1]), dtype=source.dtype, device=source.device
            ),
            requires_grad=source.requires_grad,
        )
        final[source.shape[0] :].zero_()
        final[: source.shape[0]].copy_(source)
        final.__dict__.update(source.__dict__)
        replacements[id(source)] = final
    memo = {id(tensor): tensor for tensor in _registered_tensors(roots[2:])}
    memo.update(replacements)
    encoders = copy.deepcopy(roots[2:], memo)
    owned = (*tokenizers, *encoders)
    _verify_shared_ownership(
        before, roots, owned, replacements, (*tokenizer_memos, memo, memo), torch, plan.hooks
    )
    for encoder, vocabulary in zip(encoders, plan.prepared.vocabularies, strict=True):
        encoder.get_input_embeddings().num_embeddings = len(vocabulary)
        encoder.config.get_text_config().vocab_size = len(vocabulary)
        encoder.vocab_size = len(vocabulary)
    return owned


def _shared_loader_entry(
    roots: tuple[Any, ...], owned: tuple[Any, ...], plan: RegionalEmbeddingPlan, torch: Any
) -> tuple[tuple[Any, Any, Any], ...]:
    """The original loader sees BASE tokenizers and already final-sized tables."""
    _shared_native_profile(owned[2:], torch)
    tables: list[tuple[Any, Any, Any]] = []
    for source, tokenizer, encoder, vocabulary in zip(
        roots[:2], owned[:2], owned[2:], plan.prepared.vocabularies, strict=True
    ):
        table = encoder.get_input_embeddings()
        _require(
            tokenizer is not source
            and tokenizer.get_vocab() == source.get_vocab()
            and tokenizer.get_added_vocab() == source.get_added_vocab()
            and len(tokenizer) + sum(plan.prepared.counts) == len(vocabulary)
            and table.weight.shape[0] == table.num_embeddings == len(vocabulary)
            and encoder.config.get_text_config().vocab_size
            == encoder.vocab_size
            == len(vocabulary),
            "PROFILE_INVALID",
            "Native shared TI entry requires base vocabulary "
            "plus final-table no-op resize conditions.",
        )
        tables.append((table, table.weight, table.weight.untyped_storage()))
    return tuple(tables)


def _verify_shared_loaded(
    roots: tuple[Any, ...],
    owned: tuple[Any, ...],
    plan: RegionalEmbeddingPlan,
    tables: tuple[tuple[Any, Any, Any], ...],
    torch: Any,
) -> None:
    _shared_native_profile(owned[2:], torch)
    _bounded_native_state(owned, torch, plan.hooks, shared_readonly=True)
    for source, encoder, vocabulary, (table, weight, storage) in zip(
        roots[2:], owned[2:], plan.prepared.vocabularies, tables, strict=True
    ):
        original = source.get_input_embeddings().weight
        _require(
            encoder.get_input_embeddings() is table
            and table.weight is weight
            and weight.untyped_storage() is storage
            and storage.nbytes() == weight.numel() * weight.element_size()
            and table.num_embeddings == weight.shape[0] == len(vocabulary)
            and encoder.config.get_text_config().vocab_size == encoder.vocab_size == len(vocabulary)
            and torch.equal(original, weight[: original.shape[0]]),
            "PROFILE_INVALID",
            "Native shared TI load replaced final table/Parameter/storage "
            "or changed the base prefix.",
        )
    # The unchanged installer has already verified both complete vocabularies,
    # every expanded alias ID/row and the exact final tensor/gradient profiles.


class _TextPipeline:
    """Private native-loader/encoder view; contains no borrowed UNet or VAE."""

    def __init__(self, components: tuple[Any, ...]) -> None:
        self.tokenizer, self.tokenizer_2, self.text_encoder, self.text_encoder_2 = components
        self.hf_device_map = None
        self.components = {"text_encoder": self.text_encoder, "text_encoder_2": self.text_encoder_2}

    @staticmethod
    def _loader() -> Any:
        return cast(
            Any, importlib.import_module("diffusers.loaders.textual_inversion")
        ).TextualInversionLoaderMixin

    def load_textual_inversion(self, *args: Any, **kwargs: Any) -> None:
        self._loader().load_textual_inversion(self, *args, **kwargs)

    def _check_text_inv_inputs(self, *args: Any, **kwargs: Any) -> None:
        self._loader()._check_text_inv_inputs(self, *args, **kwargs)

    def _retrieve_tokens_and_embeddings(self, *args: Any, **kwargs: Any) -> Any:
        return self._loader()._retrieve_tokens_and_embeddings(*args, **kwargs)

    def _extend_tokens_and_embeddings(self, *args: Any, **kwargs: Any) -> Any:
        return self._loader()._extend_tokens_and_embeddings(*args, **kwargs)


@dataclass(frozen=True, slots=True)
class RegionalEmbeddingPlan:
    prepared: PreparedEmbeddingBindings
    commands: tuple[IllustriousInferenceParameters, ...]
    staged: _TextPipeline
    inputs: tuple[EmbeddingConditioningInputs, ...]
    hooks: frozenset[int]
    budget: _CopyBudget | _SharedReadonlyBudget
    strategy: _EmbeddingStrategy = "independent-copy"


def _inputs(
    prepared: PreparedEmbeddingBindings, managers: tuple[Any, Any]
) -> tuple[EmbeddingConditioningInputs, ...]:
    return tuple(
        EmbeddingConditioningInputs(
            (prepared.prompts[index], prepared.prompts[index + 1]), managers
        )
        for index in range(0, len(prepared.prompts), 2)
    )


def prepare_regional_embeddings(
    resources: tuple[RegionalEmbeddingResources, ...],
    texts: tuple[tuple[str, str], ...],
    parameters: IllustriousInferenceParameters,
    pipeline: Any,
    torch: Any,
    clip_modules: tuple[Any, ...],
    *,
    strategy: _EmbeddingStrategy = "independent-copy",
) -> RegionalEmbeddingPlan | None:
    """Run inside the original reservation, after original model/adapter ownership checks."""
    reject_ti_global_hooks()
    _require(
        strategy in ("independent-copy", "shared-readonly"),
        "PROFILE_INVALID",
        "Unsupported private TI ownership strategy.",
    )
    hooks = _capture_hooks(clip_modules)
    entries = tuple(
        entry for pair in resources for sign in (pair.positive, pair.negative) for entry in sign
    )
    _require(
        len(entries) <= _MAX_DESCRIPTORS,
        "LIMIT",
        "At most 16 active binding descriptors are supported.",
    )
    # Declared sizes are checked for the complete exact-path set before any file reads.
    unique = {
        (str(entry.path), entry.sha256, entry.byte_size): entry.byte_size for entry in entries
    }
    _require(
        sum(unique.values()) <= _MAX_SERIALIZED_BYTES,
        "LIMIT",
        "Unique serialized TI inputs exceed 64 MiB.",
    )
    if not entries and strategy == "independent-copy":
        return None
    original = (
        pipeline.tokenizer,
        pipeline.tokenizer_2,
        pipeline.text_encoder,
        pipeline.text_encoder_2,
    )
    state = (
        _shared_source_state(original, torch, hooks)
        if strategy == "shared-readonly"
        else _bounded_native_state(original, torch, hooks)
    )
    _tokenizer_sizes(original[:2])
    if not entries:
        # This lane forwards borrowed originals when there is nothing to load.
        # Its readonly contract still forbids renormalization/nonfinite state;
        # no execution copy, final table or native loader is needed.
        _finite_shared_source(original[2:], torch)
        return None
    commands = tuple(
        replace(
            parameters,
            positive_prompt=text[0],
            negative_prompt=text[1],
            positive_embeddings=pair.positive,
            negative_embeddings=pair.negative,
        )
        for pair, text in zip(resources, texts, strict=True)
    )
    prepared = prepare_embedding_bindings(
        tuple(
            signed
            for command in commands
            for signed in (
                (command.positive_prompt, command.positive_embeddings),
                (command.negative_prompt, command.negative_embeddings),
            )
        ),
        pipeline,
        torch,
        max_alias_attempts=4096,
    )
    positive = sum(prepared.signed_vectors[0::2])
    negative = sum(prepared.signed_vectors[1::2])
    _require(
        positive <= 300 and negative <= 300 and positive + negative <= 600,
        "LIMIT",
        "Active binding vectors exceed 300 per emitted sign / 600 total.",
    )
    budget = (
        _shared_readonly_budget(state, original[2:], prepared)
        if strategy == "shared-readonly"
        else _copy_budget(state, original[2:], sum(prepared.counts))
    )
    staged_tokenizers = _independent_copy(original[:2], torch, hooks)
    managers = stage_embedding_aliases(prepared, cast(tuple[Any, Any], staged_tokenizers))
    if strategy == "shared-readonly":
        _bounded_native_state(
            (*staged_tokenizers, *original[2:]), torch, hooks, shared_readonly=True
        )
    _tokenizer_sizes(cast(tuple[Any, Any], staged_tokenizers))
    staged = _TextPipeline((*staged_tokenizers, *original[2:]))
    return RegionalEmbeddingPlan(
        prepared, commands, staged, _inputs(prepared, managers), hooks, budget, strategy
    )


@contextmanager
def installed_regional_embeddings(
    plan: RegionalEmbeddingPlan, pipeline: Any, torch: Any, *, cuda: bool
) -> Generator[tuple[_TextPipeline, tuple[EmbeddingConditioningInputs, ...]]]:
    """Copy only after all length/geometry/adapter budgets pass; discard on every exit.

    The lock participates only in the RNG interval. Disjoint consumers refuse
    instead of nesting fork_rng snapshots. No claim covers unrelated RNG writers.
    Exception tracebacks may retain private locals; allocator reclamation is not promised.
    """
    reject_ti_global_hooks()
    original = (
        pipeline.tokenizer,
        pipeline.tokenizer_2,
        pipeline.text_encoder,
        pipeline.text_encoder_2,
    )
    owned = (
        _shared_readonly_copy(original, plan, torch)
        if plan.strategy == "shared-readonly"
        else _independent_copy(original, torch, plan.hooks)
    )
    tables = (
        _shared_loader_entry(original, owned, plan, torch)
        if plan.strategy == "shared-readonly"
        else ()
    )
    working = _TextPipeline(owned)
    _require(
        _RNG_LOCK.acquire(blocking=False), "SCOPE_CONFLICT", "Another TI RNG interval is active."
    )
    try:
        with torch.random.fork_rng(devices=[0] if cuda else []):
            managers = install_prepared_embeddings(
                plan.prepared, working, torch, exact_vocabulary=True
            )
    finally:
        _RNG_LOCK.release()
    if plan.strategy == "shared-readonly":
        _verify_shared_loaded(original, owned, plan, tables, torch)
    _tokenizer_sizes(cast(tuple[Any, Any], owned[:2]))
    try:
        yield working, _inputs(plan.prepared, managers)
    finally:
        # No restoration or repair of borrowed text components is needed or allowed.
        del working, owned
