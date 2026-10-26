"""Authored shared-readonly exact-TI contracts; ROOT owns all execution.

Only this file is authored here. No native imports, collection, tests, runtime
inspection, artifacts or semantic mutations are executed by its author.
The small fixtures exercise real CLIP/Compel/attention/Euler/four-stage-VAE/PNG
boundaries. Full fixtures opt in through IGS_FULL_CLIP_CONFIG and qualify the
full random CLIP architecture, with the same tiny native UNet and VAE.

ROOT mutation selectors (ordinary passing tests before mutation):
  test_shared_token_parameter_ownership_mutation_red
  test_legacy_full_copy_ownership_control_green
  test_shared_regional_vectors_mutation_red
  test_shared_single_resource_control_green
The first mutation maps source token Parameters into the copier memo; refusal
must occur at ownership, before metadata/loader writes. The second corrupts B's
regional rows AFTER normal installed-row verification; actual consumption must
turn RED while the single-resource control stays GREEN. No mutation is installed
by this module. No replacement resize, forward, output, loop or loader is used.

Frozen reusable helpers: _full_models(device: str, config_root: Path) and
_streaming_preserved(native). Hashing and observations are bounded: no full
source preservation clone or per-forward full token-table clone is permitted.
"""

from __future__ import annotations

import copy
import dataclasses
import hashlib
import importlib
import inspect
import json
import os
import sys
from collections import OrderedDict
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from enum import Enum
from functools import wraps
from pathlib import Path
from types import FunctionType, SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image

import test_illustrious_regional_embeddings as _embedding_tests
import test_illustrious_regional_output as _output_tests
from imagegen_worker import generation_artifacts
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.inference import build_sdxl_conditioning
from imagegen_worker.inference_config import verify_pinned_config
from imagegen_worker.inference_embeddings import EmbeddingConditioningInputs
from test_illustrious_regional_denoising import (
    _observe as _native_observe,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    LAYOUTS,
    REGIONS,
    _parameters,  # pyright: ignore[reportPrivateUsage]
    _recipe,  # pyright: ignore[reportPrivateUsage]
)

e: Any = _embedding_tests
o: Any = _output_tests

CPU_ENCODING = "ordinary-canvas-static-dualclip-exact-ti-shared-readonly-cpu-v1"
CUDA_ENCODING = "ordinary-canvas-static-dualclip-exact-ti-shared-readonly-cuda-fp16-v1"
MIB = 1024 * 1024
FIXED_ALLOWANCE = 104 * MIB
PRIVATE_LIMIT = 512 * MIB
SOURCE_LIMIT = 4 * 1024 * MIB
SCAN_ELEMENTS = 8 * MIB


def _owner() -> Any:
    return importlib.import_module("imagegen_worker.illustrious_regional_embeddings")


def _components(native: Any) -> tuple[Any, ...]:
    p = native.pipeline
    return p.tokenizer, p.tokenizer_2, p.text_encoder, p.text_encoder_2


def _registered(root: Any) -> Iterator[tuple[str, str, str, Any]]:
    for path, module in root.named_modules():
        for slot in ("_parameters", "_buffers"):
            for name, value in getattr(module, slot).items():
                if value is not None:
                    yield path, slot, name, value


def _storage(value: Any) -> tuple[str, int, int]:
    storage = value.untyped_storage()
    return str(value.device), storage.data_ptr(), storage.nbytes()


def _tensor_hash(native: Any, value: Any) -> str:
    """At most 8 Mi elements per transfer; never clone the complete source."""
    digest = hashlib.sha256()
    flat = value.detach().reshape(-1)
    for start in range(0, flat.numel(), SCAN_ELEMENTS):
        chunk = flat[start : start + SCAN_ELEMENTS].to(device="cpu").contiguous()
        digest.update(chunk.view(native.torch.uint8).numpy().tobytes())
    return digest.hexdigest()


def _graph_state(native: Any, roots: tuple[Any, ...]) -> tuple[Any, ...]:
    """Retain graph edges and scalar metadata, without cloning tensor payloads."""
    seen: set[int] = set()
    records: list[Any] = []

    def visit(value: Any) -> Any:
        cls = cast(Any, type(value))
        if value is None or cls in (bool, int, float, str, bytes):
            return cls, value
        if isinstance(value, Enum) or cls in (native.torch.dtype, native.torch.device, type):
            return cls, repr(value)
        identity = id(value)
        if identity in seen:
            return "ref", identity
        seen.add(identity)
        if isinstance(value, native.torch.Tensor):
            records.append(
                (
                    identity,
                    cls,
                    _storage(value),
                    value.data_ptr(),
                    value.storage_offset(),
                    tuple(value.shape),
                    value.stride(),
                    value.dtype,
                    value.device,
                    value.requires_grad,
                    id(value.grad),
                    tuple(value.__dict__.items()),
                )
            )
        elif cls in (dict, OrderedDict):
            records.append((identity, cls, tuple((visit(k), visit(v)) for k, v in value.items())))
        elif cls in (tuple, list, set, frozenset):
            items = tuple(visit(item) for item in value)
            records.append(
                (
                    identity,
                    cls,
                    tuple(sorted(items, key=repr)) if cls in (set, frozenset) else items,
                )
            )
        elif cls is FunctionType:
            records.append((identity, cls, id(value.__code__)))
        elif hasattr(value, "__dict__"):
            records.append((identity, cls, visit(vars(value))))
        else:
            records.append((identity, cls))
        return "ref", identity

    for root in roots:
        visit(root)
    return tuple(records)


@contextmanager
def _streaming_preserved(native: Any) -> Generator[None]:
    """ROOT may reuse this on full models: storage/value/metadata/RNG preservation."""
    p, torch = native.pipeline, native.torch
    roots = (p.text_encoder, p.text_encoder_2, p.unet, p.vae)
    tensors = tuple(value for root in roots for *_, value in _registered(root))
    hashes = tuple(_tensor_hash(native, value) for value in tensors)
    metadata_roots = (*_components(native), p, p.scheduler, p.unet, p.vae)
    graph = _graph_state(native, metadata_roots)
    tokenizers = tuple(
        (
            tokenizer,
            tokenizer.backend_tokenizer.to_str(),
            e._decoder_binding(tokenizer.backend_tokenizer),
        )
        for tokenizer in _components(native)[:2]
    )
    cpu_rng = torch.random.get_rng_state().clone()
    cuda_rng = torch.cuda.get_rng_state(0).clone() if native.device == "cuda" else None
    owners = dict(native.adapter._OWNERS)
    reservations = dict(native.recipe._RESERVATIONS)
    try:
        yield
    finally:
        assert _graph_state(native, metadata_roots) == graph, "borrowed native graph changed"
        for value, expected in zip(tensors, hashes, strict=True):
            assert _tensor_hash(native, value) == expected, "borrowed native tensor changed"
        for tokenizer, serialized, decoder in tokenizers:
            assert tokenizer.backend_tokenizer.to_str() == serialized
            current = e._decoder_binding(tokenizer.backend_tokenizer)
            assert current[0] is decoder[0] and current[1] is decoder[1]
        assert torch.equal(torch.random.get_rng_state(), cpu_rng)
        if cuda_rng is not None:
            assert torch.equal(torch.cuda.get_rng_state(0), cuda_rng)
        assert owners == native.adapter._OWNERS
        assert reservations == native.recipe._RESERVATIONS


@contextmanager
def _full_models(device: str, config_root: Path) -> Generator[Any]:
    """Fresh local random full CLIPs; explicit placement precedes warm/borrow."""
    root = verify_pinned_config(str(config_root))
    with e._models(device) as native:
        torch, transformers, p = native.torch, native.transformers, native.pipeline
        torch.manual_seed(251025)
        encoders: list[Any] = []
        tokenizers: list[Any] = []
        specifications = ((12, 768, 3072, 12, "quick_gelu"), (32, 1280, 5120, 20, "gelu"))
        for index, expected in enumerate(specifications):
            suffix = "" if index == 0 else "_2"
            config = transformers.CLIPTextConfig.from_dict(
                json.loads((root / f"text_encoder{suffix}" / "config.json").read_text())
            )
            assert (
                config.num_hidden_layers,
                config.hidden_size,
                config.intermediate_size,
                config.num_attention_heads,
                config.hidden_act,
            ) == expected
            assert config.vocab_size == 49408 and config.max_position_embeddings == 77
            tokenizer = transformers.CLIPTokenizer.from_pretrained(
                root / f"tokenizer{suffix}", local_files_only=True
            )
            assert len(tokenizer) == 49408 and tokenizer.model_max_length == 77
            cls = (
                transformers.CLIPTextModel
                if index == 0
                else transformers.CLIPTextModelWithProjection
            )
            # Pinned configs carry dtype=float16, honored DURING construction.
            # CPU must be explicitly converted to FP32 before the borrowed scope.
            encoder = (
                cls(config)
                .to(device="cuda:0" if device == "cuda" else "cpu", dtype=native.dtype)
                .eval()
            )
            assert all(value.dtype == native.dtype for value in encoder.parameters())
            assert all(value.device.type == device for value in encoder.parameters())
            encoders.append(encoder)
            tokenizers.append(tokenizer)
        p.text_encoder, p.text_encoder_2 = encoders
        p.tokenizer, p.tokenizer_2 = tokenizers
        build_sdxl_conditioning(
            _parameters("cat", "blur"),
            p,
            native.runtime,
            embedding_inputs=EmbeddingConditioningInputs(("cat", "blur"), (None, None)),
        )
        assert all(encoder.text_model._output_capturing_hooks_installed for encoder in encoders)
        native.full_architecture = True
        yield native


@pytest.fixture(scope="module")
def cpu() -> Iterator[Any]:
    with e._models("cpu") as native:
        yield native


@pytest.fixture(scope="module")
def cuda() -> Iterator[Any]:
    with e._models("cuda") as native:
        yield native


@pytest.fixture(scope="module", params=("cpu", "cuda"))
def lane(request: pytest.FixtureRequest) -> Any:
    return request.getfixturevalue(request.param)


def _mutable_ids(native: Any, roots: tuple[Any, ...]) -> set[int]:
    seen: set[int] = set()
    mutable: set[int] = set()

    def visit(value: Any) -> None:
        cls = cast(Any, type(value))
        if value is None or cls in (bool, int, float, str, bytes, type, FunctionType):
            return
        if isinstance(value, Enum) or cls in (native.torch.dtype, native.torch.device):
            return
        if id(value) in seen:
            return
        seen.add(id(value))
        if isinstance(value, native.torch.Tensor):
            mutable.add(id(value))
        elif cls in (tuple, frozenset, list, set, dict, OrderedDict):
            if cls in (list, set, dict, OrderedDict):
                mutable.add(id(value))
            if cls in (dict, OrderedDict):
                for key, child in value.items():
                    visit(key)
                    visit(child)
            else:
                for child in value:
                    visit(child)
        elif cls.__module__.startswith("tokenizers") or hasattr(value, "__dict__"):
            mutable.add(id(value))
            if hasattr(value, "__dict__"):
                visit(vars(value))

    for root in roots:
        visit(root)
    return mutable


def _ownership(native: Any, working: Any, *, shared: bool) -> None:
    original = _components(native)
    owned = (working.tokenizer, working.tokenizer_2, working.text_encoder, working.text_encoder_2)
    assert len({id(value) for value in owned}) == 4
    allowed: set[int] = set()
    source_storages: set[tuple[str, int, int]] = set()
    private_token_storages: set[tuple[str, int, int]] = set()
    for source, current in zip(original[2:], owned[2:], strict=True):
        source_modules, current_modules = (
            dict(source.named_modules()),
            dict(current.named_modules()),
        )
        assert source_modules.keys() == current_modules.keys()
        for path, source_module in source_modules.items():
            target = current_modules[path]
            assert target is not source_module and type(target) is type(source_module)
            assert target.training is source_module.training
            for slot in ("_parameters", "_buffers", "_modules"):
                assert getattr(target, slot) is not getattr(source_module, slot)
                assert getattr(target, slot).keys() == getattr(source_module, slot).keys()
            assert tuple(target._forward_hooks.items()) == tuple(
                source_module._forward_hooks.items()
            )
            assert target._non_persistent_buffers_set == source_module._non_persistent_buffers_set
            if hasattr(source_module, "config"):
                assert target.config is not source_module.config
            for slot in ("_parameters", "_buffers"):
                for name, value in getattr(source_module, slot).items():
                    copied = getattr(target, slot)[name]
                    if value is None:
                        assert copied is None
                        continue
                    source_storages.add(_storage(value))
                    token = source_module is source.get_input_embeddings() and name == "weight"
                    assert type(copied) is type(value)
                    assert copied.dtype == value.dtype and copied.device == value.device
                    assert copied.requires_grad is value.requires_grad
                    assert copied.__dict__ == value.__dict__
                    if shared and not token:
                        assert copied is value, (
                            "non-token registered tensors must be exact shared objects"
                        )
                        assert _storage(copied) == _storage(value)
                        allowed.add(id(value))
                    else:
                        assert copied is not value, "token Parameter must be privately owned"
                        assert _storage(copied) != _storage(value)
                        if token:
                            private_token_storages.add(_storage(copied))
                            assert _tensor_hash(native, copied[: value.shape[0]]) == _tensor_hash(
                                native, value
                            )
                        else:
                            assert native.torch.equal(copied, value)
        assert (source.config is source.text_model.config) == (
            current.config is current.text_model.config
        )
        assert current.get_input_embeddings().num_embeddings == current.config.vocab_size
    assert len(private_token_storages) == 2 and private_token_storages.isdisjoint(source_storages)
    assert _mutable_ids(native, original).intersection(_mutable_ids(native, owned)) == allowed
    for source, current in zip(original[:2], owned[:2], strict=True):
        assert source is not current and source.backend_tokenizer is not current.backend_tokenizer
        source_decode = e._decoder_binding(source.backend_tokenizer)
        owned_decode = e._decoder_binding(current.backend_tokenizer)
        assert source_decode[0] is not owned_decode[0] and source_decode[1] is not owned_decode[1]


@contextmanager
def _build_aliases(patch: pytest.MonkeyPatch, replacement: Any) -> Generator[None]:
    found = False
    for name, module in tuple(cast(dict[str, Any], sys.modules).items()):
        if name.startswith("imagegen_worker.") and module is not None:
            for key, value in tuple(cast(dict[str, Any], vars(module)).items()):
                if (
                    value is build_sdxl_conditioning
                    or getattr(value, "__wrapped__", None) is build_sdxl_conditioning
                ):
                    patch.setattr(module, key, replacement)
                    found = True
    assert found
    yield


@contextmanager
def _observe(
    native: Any, monkeypatch: pytest.MonkeyPatch, *, shared: bool = True
) -> Generator[Any]:
    """Observe originals; only selected alias rows are retained, even for full CLIP."""
    with (
        _native_observe(native.denoising, native, monkeypatch) as seen,
        monkeypatch.context() as patch,
    ):
        seen.loads, seen.encoder_calls, seen.pairs, seen.plans, seen.resizes = [], [], [], [], []
        seen.allocations = []
        seen.active_loader = None
        owner = _owner()
        prepare = owner.prepare_regional_embeddings
        loader_type = e._loader_mixin()
        loader = loader_type.load_textual_inversion
        pretrained = importlib.import_module("transformers.modeling_utils").PreTrainedModel
        resize = pretrained._get_resized_embeddings
        parameter_copy, tensor_copy = (
            native.torch.nn.Parameter.__deepcopy__,
            native.torch.Tensor.__deepcopy__,
        )
        source_ids = {
            id(value) for root in _components(native)[2:] for *_, value in _registered(root)
        }
        source_storages = {
            _storage(value) for root in _components(native)[2:] for *_, value in _registered(root)
        }
        parameter_new = native.torch.nn.Parameter.__new__
        tensor_clone = native.torch.Tensor.clone

        @wraps(parameter_new)
        def allocated(cls: Any, *args: Any, **kwargs: Any) -> Any:
            value = parameter_new(cls, *args, **kwargs)
            if shared:
                plan = seen.plans[-1]
                shapes = {
                    (len(vocab), width)
                    for vocab, (_, width) in zip(plan.prepared.vocabularies, e.WIDTHS, strict=True)
                }
                assert tuple(value.shape) in shapes, "allocated an old-sized/non-final Parameter"
                seen.allocations.append(value)
            return value

        @wraps(tensor_clone)
        def cloned(value: Any, *args: Any, **kwargs: Any) -> Any:
            if shared and not seen.loads:
                assert _storage(value) not in source_storages, (
                    "source tensor/old token table was cloned"
                )
            return tensor_clone(value, *args, **kwargs)

        @wraps(prepare)
        def prepare_original(*args: Any, **kwargs: Any) -> Any:
            plan = prepare(*args, **kwargs)
            seen.plans.append(plan)
            return plan

        @wraps(resize)
        def resized(current: Any, old: Any, *args: Any, **kwargs: Any) -> Any:
            bound = inspect.signature(resize).bind(current, old, *args, **kwargs)
            before = old, old.weight, _storage(old.weight)
            if shared:
                tokenizer, base_vocabulary, expected_rows = seen.active_loader
                assert tokenizer.get_vocab() == base_vocabulary, (
                    "native resize must precede alias addition"
                )
                assert bound.arguments["new_num_tokens"] == expected_rows
            result = resize(current, old, *args, **kwargs)
            seen.resizes.append((current, bound.arguments, before, result))
            if shared:
                assert bound.arguments["new_num_tokens"] == old.weight.shape[0]
                assert result is old and result.weight is before[1]
                assert _storage(result.weight) == before[2], "native resize must remain a no-op"
            return result

        @wraps(loader)
        def load(current: Any, *args: Any, **kwargs: Any) -> Any:
            tokenizer, encoder = kwargs["tokenizer"], kwargs["text_encoder"]
            _ownership(native, current, shared=shared)
            plan = seen.plans[-1]
            index = 0 if encoder is current.text_encoder else 1
            base_tokenizer, source_encoder = (
                _components(native)[index],
                _components(native)[index + 2],
            )
            assert tokenizer.get_vocab() == base_tokenizer.get_vocab(), (
                "execution loader requires BASE vocabulary"
            )
            assert tokenizer is not (plan.staged.tokenizer, plan.staged.tokenizer_2)[index]
            assert (
                tokenizer.backend_tokenizer
                is not (plan.staged.tokenizer, plan.staged.tokenizer_2)[index].backend_tokenizer
            )
            table, weight = encoder.get_input_embeddings(), encoder.get_input_embeddings().weight
            before = table, weight, _storage(weight)
            base_rows = source_encoder.get_input_embeddings().weight.shape[0]
            if shared:
                assert weight.shape[0] == len(plan.prepared.vocabularies[index])
                assert not bool(native.torch.count_nonzero(weight[base_rows:]).item())
                assert len(seen.allocations) == 2
                assert any(weight is value for value in seen.allocations)
                seen.active_loader = (
                    tokenizer,
                    dict(base_tokenizer.get_vocab()),
                    len(plan.prepared.vocabularies[index]),
                )
            result = loader(current, *args, **kwargs)
            seen.active_loader = None
            if shared:
                assert encoder.get_input_embeddings() is before[0]
                assert encoder.get_input_embeddings().weight is before[1]
                assert _storage(encoder.get_input_embeddings().weight) == before[2]
            aliases = {
                name: token_id
                for name, token_id in tokenizer.get_vocab().items()
                if token_id >= base_rows
            }
            ids = sorted(aliases.values())
            seen.loads.append(
                SimpleNamespace(
                    encoder=encoder,
                    tokenizer=tokenizer,
                    aliases=aliases,
                    rows=encoder.get_input_embeddings().weight[ids].detach().clone(),
                    ids=ids,
                    before=before,
                )
            )
            return result

        def copy_observer(original: Any) -> Any:
            @wraps(original)
            def copied(value: Any, memo: Any) -> Any:
                assert not shared or id(value) not in source_ids, (
                    "backbone/old token tensor was deepcopied"
                )
                return original(value, memo)

            return copied

        def forward_observer(original: Any) -> Any:
            @wraps(original)
            def forward(current: Any, *args: Any, **kwargs: Any) -> Any:
                bound = inspect.signature(original).bind(current, *args, **kwargs)
                ids = bound.arguments["input_ids"]
                source = (
                    native.pipeline.text_encoder
                    if type(current) is type(native.pipeline.text_encoder)
                    else native.pipeline.text_encoder_2
                )
                base_rows = source.get_input_embeddings().weight.shape[0]
                used = sorted(set(ids.reshape(-1).tolist()) - set(range(base_rows)))
                seen.encoder_calls.append(
                    SimpleNamespace(
                        encoder=current,
                        ids=ids.detach().clone(),
                        alias_ids=used,
                        rows=current.get_input_embeddings().weight[used].detach().clone(),
                    )
                )
                return original(current, *args, **kwargs)

            return forward

        @wraps(build_sdxl_conditioning)
        def build(parameters: Any, pipeline: Any, runtime: Any, **kwargs: Any) -> Any:
            result = build_sdxl_conditioning(parameters, pipeline, runtime, **kwargs)
            seen.pairs.append(
                SimpleNamespace(
                    parameters=parameters,
                    pipeline=pipeline,
                    inputs=kwargs["embedding_inputs"],
                    result=result,
                )
            )
            return result

        patch.setattr(loader_type, "load_textual_inversion", load)
        patch.setattr(pretrained, "_get_resized_embeddings", resized)
        patch.setattr(native.torch.nn.Parameter, "__deepcopy__", copy_observer(parameter_copy))
        patch.setattr(native.torch.Tensor, "__deepcopy__", copy_observer(tensor_copy))
        if shared:
            patch.setattr(native.torch.nn.Parameter, "__new__", staticmethod(allocated))
            patch.setattr(native.torch.Tensor, "clone", cloned)

            def no_mean(*_args: Any, **_kwargs: Any) -> Any:
                raise AssertionError("shared final tables must never invoke mean initialization")

            patch.setattr(pretrained, "_init_added_embeddings_weights_with_mean", no_mean)
        for cls in {
            cast(Any, type(native.pipeline.text_encoder)),
            cast(Any, type(native.pipeline.text_encoder_2)),
        }:
            patch.setattr(cls, "forward", forward_observer(cls.forward))
        with o._aliases(patch, prepare, prepare_original), _build_aliases(patch, build):
            yield seen


def _run(native: Any, recipe: Any, **changes: Any) -> Any:
    layout, steps = changes.pop("layout", LAYOUTS[0]), changes.pop("steps", 2)
    args = e._arguments(native, recipe, layout=layout, steps=steps)
    args["profile"] = CUDA_ENCODING if native.device == "cuda" else CPU_ENCODING
    args["denoising_profile"] = e.CUDA_EXECUTION if native.device == "cuda" else e.CPU_EXECUTION
    args.update(changes)
    before = copy.deepcopy(recipe)
    try:
        with _streaming_preserved(native):
            return native.denoising.run_current_canvas_regional_denoising(recipe, **args)
    finally:
        assert recipe == before


def _alias_rows(native: Any, seen: Any, pair_index: int, state: dict[str, Any]) -> None:
    pair = seen.pairs[pair_index]
    alias = pair.inputs.prompts[0]
    for index, (key, width) in enumerate(e.WIDTHS):
        tokenizer, encoder = (
            (pair.pipeline.tokenizer, pair.pipeline.tokenizer_2)[index],
            (pair.pipeline.text_encoder, pair.pipeline.text_encoder_2)[index],
        )
        expected = state[key].reshape(-1, width).to(device=encoder.device, dtype=encoder.dtype)
        ids = [
            tokenizer.convert_tokens_to_ids(alias if row == 0 else f"{alias}_{row}")
            for row in range(len(expected))
        ]
        assert len(set(ids)) == len(expected)
        loaded = next(record for record in seen.loads if record.encoder is encoder)
        selected = [loaded.ids.index(token_id) for token_id in ids]
        assert native.torch.equal(loaded.rows[selected], expected)
        assert (
            pair.inputs.managers[index].expand_textual_inversion_token_ids_if_necessary([ids[0]])
            == ids
        )
        calls = [
            record
            for record in seen.encoder_calls
            if record.encoder is encoder and set(record.alias_ids).intersection(ids)
        ]
        assert calls, "real CLIP never consumed the selected exact alias"
        covered: set[int] = set()
        for call in calls:
            for token_id, row in zip(ids, expected, strict=True):
                if token_id in call.alias_ids:
                    assert native.torch.equal(call.rows[call.alias_ids.index(token_id)], row), (
                        "actual CLIP consumed the wrong regional exact vector"
                    )
                    covered.add(token_id)
        assert covered == set(ids)


def _budget(native: Any, seen: Any) -> Any:
    plan = seen.plans[-1]
    budget = plan.budget
    assert (
        dataclasses.is_dataclass(cast(object, budget))
        and cast(Any, type(budget)).__dataclass_params__.frozen
    )
    original = _components(native)[2:]
    source_bytes = sum(
        value.numel() * value.element_size() for root in original for *_, value in _registered(root)
    )
    token_bytes = sum(
        root.get_input_embeddings().weight.numel()
        * root.get_input_embeddings().weight.element_size()
        for root in original
    )
    final_bytes = sum(
        len(vocab) * width * original[index].get_input_embeddings().weight.element_size()
        for index, (vocab, (_, width)) in enumerate(
            zip(plan.prepared.vocabularies, e.WIDTHS, strict=True)
        )
    )
    assert budget.borrowed_bytes == source_bytes
    assert budget.shared_bytes == source_bytes - token_bytes
    assert budget.final_table_bytes == final_bytes
    assert budget.fixed_allowance_bytes == FIXED_ALLOWANCE
    assert budget.total == final_bytes + FIXED_ALLOWANCE <= PRIVATE_LIMIT
    assert budget.borrowed_bytes <= SOURCE_LIMIT
    return budget


def _case(
    tmp_path: Path, native: Any, recipe: Any, *, name: str, layout: str = LAYOUTS[0], steps: int = 2
) -> Any:
    case = o._case(
        tmp_path, native, recipe=recipe, exact_ti=True, name=name, layout=layout, steps=steps
    )
    case.args["profile"] = CUDA_ENCODING if native.device == "cuda" else CPU_ENCODING
    return case


def _publish(native: Any, case: Any, output: Any) -> Any:
    recipe_before, command_before, target_before = (
        copy.deepcopy(case.recipe),
        copy.deepcopy(case.command),
        case.target.read_bytes(),
    )
    try:
        with _streaming_preserved(native):
            return output.generate_current_canvas_regional_txt2img(
                case.recipe, command=case.command, **case.args
            )
    finally:
        assert case.recipe == recipe_before and case.command == command_before
        assert case.target.read_bytes() == target_before


def _png(native: Any, case: Any, seen: Any, done: Any) -> bytes:
    original = seen.pipeline_results[0]
    expected = o._quantized_bytes(native, original.images)
    with Image.open(case.command.output_path) as image:
        image.load()
        assert image.mode == "RGB" and image.format == "PNG"
        assert image.size == (case.command.width, case.command.height)
        assert image.info["icc_profile"] == SRGB_ICC_PROFILE
        assert image.tobytes() == expected, (
            "reopened RGB differs from independently quantized native output"
        )
    assert done["outputPath"] == str(case.command.output_path)
    assert done["requestId"] == case.command.request_id and done["seed"] == case.command.seed
    assert not list(case.root.glob(".*.tmp"))
    return expected


@pytest.mark.parametrize("layout,steps", ((LAYOUTS[0], 2), (LAYOUTS[1], 1)))
def test_shared_matches_legacy_real_native_and_reopened_rgb(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch, layout: str, steps: int
) -> None:
    a, b = e._save(tmp_path, lane, 1), e._save(tmp_path, lane, 2)
    recipe = e._same_recipe(a, b)
    expected = (
        e._oracle(lane, "oracle_a", "blur", ("oracle_a", a.tensors)),
        e._oracle(lane, "oracle_b", "grain", ("oracle_b", b.tensors)),
    )
    output = importlib.import_module("imagegen_worker.illustrious_regional_output")
    images: list[Any] = []
    pixels: list[bytes] = []
    observations: list[Any] = []
    for shared in (False, True):
        case = _case(tmp_path, lane, recipe, name=f"parity-{shared}", layout=layout, steps=steps)
        case.args["negative_pooled_source_id"] = case.args["positive_pooled_source_id"] = REGIONS[0]
        if not shared:
            case.args["profile"] = e.CUDA_ENCODING if lane.device == "cuda" else e.CPU_ENCODING
        with _observe(lane, monkeypatch, shared=shared) as seen:
            done = _publish(lane, case, output)
        e._normal_result(lane, seen, seen.pipeline_results[0], steps)
        _alias_rows(lane, seen, 0, a.tensors)
        _alias_rows(lane, seen, 1, b.tensors)
        e._consumption(lane, seen, expected, layout=layout, negative_pool=1, positive_pool=1)
        if shared:
            _budget(lane, seen)
            assert len(seen.resizes) == 2
        pixels.append(_png(lane, case, seen, done))
        images.append(seen.pipeline_results[0].images)
        observations.append(seen)
    assert lane.torch.equal(images[0], images[1]) and pixels[0] == pixels[1]
    for field in ("contexts", "masks", "outputs"):
        assert all(
            lane.torch.equal(x, y)
            for x, y in zip(
                getattr(observations[0], field), getattr(observations[1], field), strict=True
            )
        )


def test_shared_token_parameter_ownership_mutation_red(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    a = e._save(tmp_path, lane, 1)
    with _observe(lane, monkeypatch) as seen:
        try:
            result = _run(lane, e._same_recipe(a))
        except ValueError as error:
            # Under ROOT's isolated memo mutation the intended RED is this
            # ownership refusal. _run's finally also proves source metadata and
            # weights unchanged; neither native loader nor resize may be reached.
            assert getattr(error, "code", None) == "PROFILE_INVALID"
            assert "own" in str(error).lower() or "shar" in str(error).lower()
            assert seen.loads == [] and seen.resizes == []
            raise
    e._normal_result(lane, seen, result, 2)
    _alias_rows(lane, seen, 0, a.tensors)
    _budget(lane, seen)
    assert len(seen.loads) == 2


def test_legacy_full_copy_ownership_control_green(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    a = e._save(tmp_path, lane, 1)
    with _observe(lane, monkeypatch, shared=False) as seen:
        result = _run(
            lane,
            e._same_recipe(a),
            profile=e.CUDA_ENCODING if lane.device == "cuda" else e.CPU_ENCODING,
        )
    e._normal_result(lane, seen, result, 2)
    _alias_rows(lane, seen, 0, a.tensors)
    _ownership(lane, seen.pairs[0].pipeline, shared=False)
    assert type(seen.plans[-1].budget) is _owner()._CopyBudget


def test_shared_regional_vectors_mutation_red(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    a, b = e._save(tmp_path, lane, 1), e._save(tmp_path, lane, 2)
    recipe = e._same_recipe(a, b)
    expected = (
        e._oracle(lane, "oracle_a", "blur", ("oracle_a", a.tensors)),
        e._oracle(lane, "oracle_b", "grain", ("oracle_b", b.tensors)),
    )
    output = importlib.import_module("imagegen_worker.illustrious_regional_output")
    observations, images, pixels = cast(list[Any], []), cast(list[Any], []), cast(list[bytes], [])
    for index, current in enumerate((recipe, e._same_recipe(a, a))):
        case = _case(tmp_path, lane, current, name=f"regional-{index}")
        with _observe(lane, monkeypatch) as seen:
            done = _publish(lane, case, output)
        e._normal_result(lane, seen, seen.pipeline_results[0], 2)
        # Installed snapshots prove the native loader was correct before the
        # isolated mutation; the decisive RED is actual CLIP/attention context.
        regional = b if index == 0 else a
        for pair_index, state in enumerate((a.tensors, regional.tensors)):
            _alias_rows(lane, seen, pair_index, state)
        streams = (
            expected
            if index == 0
            else (expected[0], e._oracle(lane, "oracle_a", "grain", ("oracle_a", a.tensors)))
        )
        e._consumption(lane, seen, streams)
        pixels.append(_png(lane, case, seen, done))
        observations.append(seen)
        images.append(seen.pipeline_results[0].images)
    first, second = observations
    assert lane.torch.equal(first.contexts[0][0], second.contexts[0][0])
    assert lane.torch.equal(first.contexts[0][1, :77], second.contexts[0][1, :77])
    assert not lane.torch.equal(first.contexts[0][1, 77:154], second.contexts[0][1, 77:154])
    assert lane.torch.equal(first.queries[0], second.queries[0])
    for left, right in zip(first.root_inputs, second.root_inputs, strict=True):
        for key in ("text_embeds", "time_ids"):
            assert lane.torch.equal(left["added_cond_kwargs"][key], right["added_cond_kwargs"][key])
    assert all(lane.torch.equal(x, y) for x, y in zip(first.masks, second.masks, strict=True))
    assert not lane.torch.equal(first.outputs[0], second.outputs[0])
    assert not lane.torch.equal(images[0], images[1]) and pixels[0] != pixels[1]


def test_shared_single_resource_control_green(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    a = e._save(tmp_path, lane, 1)
    expected = e._oracle(lane, "oracle_a", "blur", ("oracle_a", a.tensors))
    with _observe(lane, monkeypatch) as seen:
        result = _run(lane, e._same_recipe(a))
    e._normal_result(lane, seen, result, 2)
    _alias_rows(lane, seen, 0, a.tensors)
    e._consumption(lane, seen, (expected,))


STRUCTURAL_REFUSALS = (
    "input-parameter",
    "input-child",
    "input-buffer",
    "token-max-norm",
    "position-max-norm",
    "output-head",
    "expanded-ties",
    "submodel-ties",
    "cached-ties",
    "zero3",
    "quantization",
    "offload",
    "noncontiguous",
    "offset-view",
    "oversized-storage",
    "storage-alias",
    "duplicate-registration",
    "tensor-subclass",
    "custom-reducer",
    "custom-hook",
    "global-registration",
    "custom-gelu-act",
)


@contextmanager
def _before_private_work(native: Any, monkeypatch: pytest.MonkeyPatch) -> Generator[list[str]]:
    """A refusal must precede native work AND final Parameter construction."""
    hits: list[str] = []
    original = native.torch.nn.Parameter.__new__
    with monkeypatch.context() as patch:

        def no_parameter(cls: Any, *args: Any, **kwargs: Any) -> Any:
            hits.append("Parameter construction")
            raise AssertionError("preflight allocated a private table Parameter")

        patch.setattr(native.torch.nn.Parameter, "__new__", staticmethod(no_parameter))
        with e._no_native(native, patch):
            yield hits
    assert native.torch.nn.Parameter.__new__ is original
    assert hits == []


def _refuse(native: Any, recipe: Any, **changes: Any) -> Any:
    with pytest.raises((ValueError, DerivativeError)) as caught:
        _run(native, recipe, **changes)
    assert getattr(caught.value, "code", None) in e.LOCAL_CODES | e.DOWNSTREAM_CODES
    assert str(caught.value) and len(str(caught.value)) <= 4096
    return caught.value


@pytest.mark.parametrize("invalid", STRUCTURAL_REFUSALS)
def test_shared_graph_hazards_refuse_before_allocation_or_native_loader(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, invalid: str
) -> None:
    with e._models("cpu") as native, monkeypatch.context() as patch:
        torch, encoder = native.torch, native.pipeline.text_encoder_2
        table = encoder.get_input_embeddings()
        a = e._save(tmp_path, native, 1)
        handle = None
        called: list[str] = []

        def forbidden(*_args: Any, **_kwargs: Any) -> Any:
            called.append(invalid)
            raise AssertionError("unsupported source callback executed")

        if invalid == "input-parameter":
            table.register_parameter(
                "auxiliary", torch.nn.Parameter(torch.ones(2), requires_grad=False)
            )
        elif invalid == "input-child":
            table.add_module("auxiliary", torch.nn.Linear(2, 2).eval())
        elif invalid == "input-buffer":
            table.register_buffer("auxiliary", torch.ones(2), persistent=False)
        elif invalid.endswith("max-norm"):
            target = (
                table
                if invalid == "token-max-norm"
                else encoder.text_model.embeddings.position_embedding
            )
            target.max_norm = 0.01
        elif invalid == "output-head":
            patch.setattr(cast(Any, type(encoder)), "get_output_embeddings", lambda _self: table)  # pyright: ignore[reportUnknownLambdaType, reportUnknownArgumentType]
        elif invalid == "expanded-ties":
            original_expand = cast(Any, type(encoder)).get_expanded_tied_weights_keys

            @wraps(original_expand)
            def expanded(current: Any, *, all_submodels: bool = False) -> Any:
                result = original_expand(current, all_submodels=all_submodels)
                assert all_submodels is True
                return (
                    {"text_projection.weight": "text_model.embeddings.token_embedding.weight"}
                    if current is encoder
                    else result
                )

            patch.setattr(cast(Any, type(encoder)), "get_expanded_tied_weights_keys", expanded)
        elif invalid in ("submodel-ties", "cached-ties"):
            target = encoder.text_model if invalid == "submodel-ties" else encoder
            key = (
                "_dynamic_tied_weights_keys"
                if invalid == "cached-ties"
                else "all_tied_weights_keys"
            )
            patch.setattr(
                target,
                key,
                {"text_projection.weight": "text_model.embeddings.token_embedding.weight"},
                raising=False,
            )
        elif invalid == "zero3":
            patch.setattr(
                importlib.import_module("transformers.modeling_utils"),
                "is_deepspeed_zero3_enabled",
                lambda: True,
            )
        elif invalid == "quantization":
            patch.setattr(encoder, "is_quantized", True, raising=False)
        elif invalid == "offload":
            patch.setattr(encoder, "hf_device_map", {"text_model": "cpu"}, raising=False)
        elif invalid == "noncontiguous":
            encoder.register_buffer(
                "bad_stride",
                torch.arange(12, dtype=torch.float32).reshape(3, 4).t(),
                persistent=False,
            )
        elif invalid == "offset-view":
            encoder.register_buffer("bad_view", torch.ones(5)[1:], persistent=False)
        elif invalid == "oversized-storage":
            encoder.register_buffer("bad_storage", torch.ones(5)[:4], persistent=False)
        elif invalid == "storage-alias":
            encoder.register_buffer(
                "bad_alias", encoder.text_projection.weight.detach(), persistent=False
            )
        elif invalid == "duplicate-registration":
            encoder.register_parameter("duplicate", encoder.text_projection.weight)
        elif invalid == "tensor-subclass":

            class UnqualifiedTensor(torch.Tensor):
                pass

            encoder.register_buffer(
                "subclass", torch.ones(2).as_subclass(UnqualifiedTensor), persistent=False
            )
        elif invalid == "custom-reducer":
            patch.setattr(encoder, "__reduce_ex__", forbidden, raising=False)
        elif invalid == "custom-hook":
            handle = encoder.register_forward_pre_hook(forbidden)
        elif invalid == "global-registration":
            handle = importlib.import_module(
                "torch.nn.modules.module"
            ).register_module_parameter_registration_hook(forbidden)
        else:
            activations = importlib.import_module("transformers.activations")
            gelu = activations.GELUActivation().eval()
            gelu.act = forbidden
            encoder.text_model.encoder.layers[0].mlp.activation_fn = gelu
        try:
            with _before_private_work(native, patch):
                error = _refuse(native, e._same_recipe(a))
            assert getattr(error, "code", None) in ("PROFILE_INVALID", "UNSUPPORTED")
            assert called == []
        finally:
            if handle is not None:
                handle.remove()


@pytest.mark.parametrize("location", ("used", "unused", "nonpersistent"))
@pytest.mark.parametrize("nonfinite", (float("nan"), float("inf")))
def test_shared_every_registered_float_is_finite_before_table_allocation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, location: str, nonfinite: float
) -> None:
    with e._models("cpu") as native:
        a = e._save(tmp_path, native, 1)
        encoder = native.pipeline.text_encoder_2
        if location == "nonpersistent":
            encoder.register_buffer(
                "unused_nonfinite", native.torch.tensor([nonfinite]), persistent=False
            )
        elif location == "unused":
            encoder.register_parameter(
                "unused_float",
                native.torch.nn.Parameter(native.torch.tensor([nonfinite]), requires_grad=False),
            )
        else:
            weight = encoder.get_input_embeddings().weight
            weight[0, 0] = nonfinite
        with _before_private_work(native, monkeypatch):
            error = _refuse(native, e._same_recipe(a))
        assert getattr(error, "code", None) == "PROFILE_INVALID"


def test_shared_finiteness_uses_bounded_source_views(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    with e._models("cpu") as native:
        # Cross a real 8-Mi-element boundary with 32 MiB, without dummy GiB storage.
        buffer = native.torch.linspace(-0.7, 0.9, SCAN_ELEMENTS + 19)
        native.pipeline.text_encoder.register_buffer("scan_boundary", buffer, persistent=False)
        a = e._save(tmp_path, native, 1)
        original = native.torch.isfinite
        source_storages = {
            _storage(value) for root in _components(native)[2:] for *_, value in _registered(root)
        }
        checked: set[tuple[str, int, int]] = set()
        offsets: set[int] = set()

        @wraps(original)
        def finite(value: Any) -> Any:
            if _storage(value) in source_storages and value.is_floating_point():
                assert value.numel() <= SCAN_ELEMENTS
                assert value.is_contiguous()
                checked.add(_storage(value))
                if _storage(value) == _storage(buffer):
                    offsets.add(value.storage_offset())
            return original(value)

        with monkeypatch.context() as patch:
            patch.setattr(native.torch, "isfinite", finite)
            with _observe(native, patch) as seen:
                result = _run(native, e._same_recipe(a), steps=1)
        e._normal_result(native, seen, result, 1)
        expected = {
            _storage(value)
            for root in _components(native)[2:]
            for *_, value in _registered(root)
            if value.is_floating_point()
        }
        assert checked == expected and offsets == {0, SCAN_ELEMENTS}


def test_shared_native_gelu_succeeds_legacy_copy_still_refuses(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    with e._models("cpu") as native:
        activations = importlib.import_module("transformers.activations")
        gelu = activations.GELUActivation().eval()
        assert gelu.act is native.torch.nn.functional.gelu
        native.pipeline.text_encoder_2.text_model.encoder.layers[0].mlp.activation_fn = gelu
        a = e._save(tmp_path, native, 1)
        with _observe(native, monkeypatch) as seen:
            result = _run(native, e._same_recipe(a), steps=1)
        e._normal_result(native, seen, result, 1)
        with _before_private_work(native, monkeypatch):
            error = _refuse(native, e._same_recipe(a), profile=e.CPU_ENCODING)
        assert getattr(error, "code", None) == "PROFILE_INVALID"


@pytest.mark.parametrize("boundary", ("source", "private"))
def test_shared_source_and_table_plus_allowance_limits_precede_finite_scan_and_allocation(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch, boundary: str
) -> None:
    a = e._save(tmp_path, cpu, 1)
    owner = _owner()
    source_bytes = sum(
        value.numel() * value.element_size()
        for root in _components(cpu)[2:]
        for *_, value in _registered(root)
    )
    table_bytes = sum(
        (len(tokenizer) + 3)
        * encoder.config.hidden_size
        * encoder.get_input_embeddings().weight.element_size()
        for tokenizer, encoder in zip(_components(cpu)[:2], _components(cpu)[2:], strict=True)
    )
    key = "_MAX_BORROWED_BYTES" if boundary == "source" else "_MAX_COPY_BYTES"
    limit = source_bytes if boundary == "source" else table_bytes + FIXED_ALLOWANCE
    assert getattr(owner, key) == (SOURCE_LIMIT if boundary == "source" else PRIVATE_LIMIT)
    scanned: list[Any] = []
    finite = cpu.torch.isfinite
    source_storages = {
        _storage(value) for root in _components(cpu)[2:] for *_, value in _registered(root)
    }

    @wraps(finite)
    def no_source_scan(value: Any) -> Any:
        if _storage(value) in source_storages:
            scanned.append(value.shape)
            raise AssertionError("structural/budget rejection must precede source finite scratch")
        return finite(value)

    with monkeypatch.context() as patch:
        patch.setattr(owner, key, limit - 1)
        # Source admission always precedes scanning. Private admission depends
        # on final alias planning; source scans may legitimately precede it.
        if boundary == "source":
            patch.setattr(cpu.torch, "isfinite", no_source_scan)
        with _before_private_work(cpu, patch):
            error = _refuse(cpu, e._same_recipe(a))
        assert getattr(error, "code", None) == "LIMIT"
    assert scanned == []
    with monkeypatch.context() as patch:
        patch.setattr(owner, key, limit)
        with _observe(cpu, patch) as seen:
            result = _run(cpu, e._same_recipe(a), steps=1)
    e._normal_result(cpu, seen, result, 1)
    budget = _budget(cpu, seen)
    assert (budget.borrowed_bytes if boundary == "source" else budget.total) == limit


def test_shared_full_vocab_600_alias_budget_is_logical_not_rss() -> None:
    assert FIXED_ALLOWANCE == 2 * 32 * MIB + 4 * 8 * MIB + 8 * MIB
    cpu_tables = (49408 + 600) * (768 + 1280) * 4
    assert cpu_tables == 409665536
    assert FIXED_ALLOWANCE == 109051904
    assert cpu_tables + FIXED_ALLOWANCE <= PRIVATE_LIMIT
    assert cpu_tables // 2 + FIXED_ALLOWANCE <= PRIVATE_LIMIT
    assert cpu_tables + FIXED_ALLOWANCE > 494 * MIB


def test_legacy_copy_budget_arithmetic_and_512_mib_limit_unchanged(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner = _owner()
    a = e._save(tmp_path, cpu, 1)
    with _observe(cpu, monkeypatch, shared=False) as seen:
        result = _run(cpu, e._same_recipe(a), profile=e.CPU_ENCODING, steps=1)
    e._normal_result(cpu, seen, result, 1)
    budget = seen.plans[-1].budget
    assert owner._MAX_COPY_BYTES == PRIVATE_LIMIT
    assert tuple(field.name for field in dataclasses.fields(budget)) == (
        "parameter_buffer_bytes",
        "alias_growth_bytes",
        "replacement_scratch_bytes",
    )
    assert (
        budget.total
        == budget.parameter_buffer_bytes
        + budget.alias_growth_bytes
        + budget.replacement_scratch_bytes
    )
    assert budget.replacement_scratch_bytes > 0
    with monkeypatch.context() as patch:
        patch.setattr(owner, "_MAX_COPY_BYTES", budget.total - 1)
        with _before_private_work(cpu, patch):
            error = _refuse(cpu, e._same_recipe(a), profile=e.CPU_ENCODING)
    assert getattr(error, "code", None) == "LIMIT" and "scratch" in str(error).lower()


@pytest.mark.parametrize(
    "invalid",
    (
        "resource",
        "expanded-length",
        "support",
        "binding",
        "mask-budget",
        "tokenizer-size",
        "metadata-size",
    ),
)
def test_shared_complete_preflight_precedes_final_table_allocation(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch, invalid: str
) -> None:
    a = e._save(tmp_path, cpu, 1)
    recipe = e._same_recipe(a)
    changes: dict[str, Any] = {}
    with monkeypatch.context() as patch:
        if invalid == "resource":
            a.path.write_bytes(b"not the captured file")
        elif invalid == "expanded-length":
            recipe["globalPrompts"]["positive"]["text"] = recipe["item"]["prompts"]["positive"] = (
                "SAME " * 110
            )
        elif invalid == "support":
            changes["global_positive_coverage"] = e.Alpha8(e.Shape(2, 3), bytes(6))
        elif invalid == "binding":
            changes["bindings"] = ()
        elif invalid == "mask-budget":
            patch.setattr(cpu.adapter, "_MAX_MASK_ELEMENTS", 1)
        elif invalid == "tokenizer-size":
            patch.setattr(_owner(), "_MAX_TOKENIZER_BYTES", 1)
        else:
            patch.setattr(_owner(), "_MAX_METADATA_BYTES", 1)
        with (
            _before_private_work(cpu, patch),
            pytest.raises((ValueError, DerivativeError)) as caught,
        ):
            _run(cpu, recipe, **changes)
    assert str(caught.value)


@pytest.mark.parametrize("variant", ("unequal-vocabularies", "shared-source-tokenizer"))
def test_shared_separate_staging_and_execution_tokenizers(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, variant: str
) -> None:
    extras = (
        (("left_only",), ("right_only", "right_second"))
        if variant == "unequal-vocabularies"
        else ((), ())
    )
    with e._models("cpu", extra_vocab=extras) as native:
        if variant == "shared-source-tokenizer":
            native.pipeline.tokenizer_2 = native.pipeline.tokenizer
        a = e._save(tmp_path, native, 1)
        with _observe(native, monkeypatch) as seen:
            result = _run(native, e._same_recipe(a), steps=1)
        e._normal_result(native, seen, result, 1)
        _alias_rows(native, seen, 0, a.tensors)
        _budget(native, seen)
        working = seen.pairs[0].pipeline
        assert working.tokenizer is not working.tokenizer_2
        staged = seen.plans[-1].staged
        assert staged.tokenizer is not staged.tokenizer_2
        execution_ids = _mutable_ids(native, (working.tokenizer, working.tokenizer_2))
        assert execution_ids.isdisjoint(
            _mutable_ids(native, (staged.tokenizer, staged.tokenizer_2))
        )
        if variant == "unequal-vocabularies":
            assert len(working.tokenizer_2) == len(working.tokenizer) + 1


def test_shared_zero_effective_refs_keeps_original_text_path(
    cpu: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    recipe = e._with_resources(_recipe())
    with _observe(cpu, monkeypatch) as seen:
        result = _run(cpu, recipe, steps=1)
    e._normal_result(cpu, seen, result, 1)
    assert seen.loads == [] and seen.resizes == [] and seen.plans == [None]
    assert seen.pairs[0].pipeline is cpu.pipeline


@pytest.mark.parametrize("invalid", ("cross-profile", "autocast", "vae-policy"))
def test_shared_profile_selector_keeps_tensor_and_vae_restrictions(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch, invalid: str
) -> None:
    a = e._save(tmp_path, cpu, 1)
    changes: dict[str, Any] = {}
    if invalid == "cross-profile":
        changes["profile"] = CUDA_ENCODING
    elif invalid == "vae-policy":
        parameters = e._arguments(cpu, e._same_recipe(a))["parameters"]
        changes["parameters"] = dataclasses.replace(parameters, vae_precision="FP16")
    with _before_private_work(cpu, monkeypatch):
        if invalid == "autocast":
            with cpu.torch.autocast("cpu", dtype=cpu.torch.bfloat16):
                error = _refuse(cpu, e._same_recipe(a), **changes)
        else:
            error = _refuse(cpu, e._same_recipe(a), **changes)
    assert getattr(error, "code", None) in ("PROFILE_INVALID", "UNSUPPORTED")


@pytest.mark.parametrize(
    "failure", ("first-loader", "later-encoding", "second-unet", "decode", "publisher")
)
def test_shared_actual_failure_preserves_source_rng_and_allows_recovery(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    a, b = e._save(tmp_path, lane, 1), e._save(tmp_path, lane, 2)
    recipe = e._same_recipe(a, b)
    output = importlib.import_module("imagegen_worker.illustrious_regional_output")
    sentinel = DerivativeError(
        "GENERATION_EMBEDDING_UNSUPPORTED", "authored shared boundary failure: " + failure
    )
    if failure == "first-loader":
        cls, method, threshold = e._loader_mixin(), "load_textual_inversion", 1
    elif failure == "later-encoding":
        cls, method, threshold = cast(Any, type(lane.pipeline.text_encoder_2)), "forward", 1
    elif failure == "second-unet":
        cls, method, threshold = cast(Any, type(lane.pipeline.unet)), "forward", 2
    elif failure == "decode":
        cls, method, threshold = cast(Any, type(lane.pipeline.vae)), "decode", 1
    else:
        cls, method, threshold = generation_artifacts, "publish_generation_image", 1
    original = getattr(cls, method)
    calls: list[Any] = []

    @wraps(original)
    def fail_after_original(*args: Any, **kwargs: Any) -> Any:
        selected = True
        if failure == "later-encoding":
            current = args[0]
            ids = inspect.signature(original).bind(*args, **kwargs).arguments["input_ids"]
            expected = b.tensors["clip_g"][0].to(device=current.device, dtype=current.dtype)
            selected = bool(
                (current.get_input_embeddings().weight[ids] == expected).all(dim=-1).any().item()
            )
        result = original(*args, **kwargs)
        if selected:
            calls.append(result)
            if len(calls) == threshold:
                raise sentinel
        return result

    case = _case(tmp_path, lane, recipe, name="failure")
    with monkeypatch.context() as patch:
        if failure == "publisher":
            with (
                o._aliases(patch, original, fail_after_original),
                pytest.raises(DerivativeError) as caught,
            ):
                _publish(lane, case, output)
        else:
            patch.setattr(cls, method, fail_after_original)
            with pytest.raises(DerivativeError) as caught:
                _publish(lane, case, output)
    assert len(calls) == threshold
    assert caught.value is sentinel or caught.value.__cause__ is sentinel
    assert caught.value.__traceback__ is not None
    recovery = _case(tmp_path, lane, recipe, name="recovery")
    with _observe(lane, monkeypatch) as seen:
        done = _publish(lane, recovery, output)
    e._normal_result(lane, seen, seen.pipeline_results[0], 2)
    _alias_rows(lane, seen, 1, b.tensors)
    _png(lane, recovery, seen, done)


@pytest.mark.parametrize("device", ("cpu", "cuda"))
def test_full_shared_clip_architecture_three_real_native_png_requests(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, device: str
) -> None:
    configured = os.environ.get("IGS_FULL_CLIP_CONFIG")
    if configured is None:
        pytest.skip("ROOT opts into retained full CLIP config via IGS_FULL_CLIP_CONFIG")
    with _full_models(device, Path(configured)) as native:
        a, b = e._save(tmp_path, native, 1), e._save(tmp_path, native, 2)
        output = importlib.import_module("imagegen_worker.illustrious_regional_output")
        requests = (
            (e._same_recipe(a, b), LAYOUTS[0], 2),
            (e._same_recipe(a, a), LAYOUTS[0], 2),
            (e._same_recipe(a, b), LAYOUTS[1], 1),
        )
        summaries: list[Any] = []
        for index, (recipe, layout, steps) in enumerate(requests):
            case = _case(tmp_path, native, recipe, name=f"full-{index}", layout=layout, steps=steps)
            with _observe(native, monkeypatch) as seen:
                done = _publish(native, case, output)
            e._normal_result(native, seen, seen.pipeline_results[0], steps)
            _alias_rows(native, seen, 0, a.tensors)
            _alias_rows(native, seen, 1, (a if index == 1 else b).tensors)
            # Original real Compel results feed an independent bank/mask/dense
            # attention oracle. No second 3.27-GB model is retained as an oracle.
            e._consumption(native, seen, tuple(pair.result for pair in seen.pairs), layout=layout)
            budget = _budget(native, seen)
            assert budget.borrowed_bytes > 1024 * MIB
            assert budget.final_table_bytes == (49408 + 6) * 2048 * (2 if device == "cuda" else 4)
            pixels = _png(native, case, seen, done)
            # Retain bounded evidence only; release private tables/modules from
            # prior requests before allocating the next final table pair.
            summaries.append(
                SimpleNamespace(
                    context=seen.contexts[0],
                    query=seen.queries[0],
                    mask=seen.masks[0],
                    pools=seen.root_inputs[0]["added_cond_kwargs"]["text_embeds"],
                    attention=seen.outputs[0],
                    image=seen.pipeline_results[0].images,
                    pixels=pixels,
                )
            )
            del seen, budget
        first, neighbor, positive = summaries
        assert native.torch.equal(first.context[0], neighbor.context[0])
        assert native.torch.equal(first.context[1, :77], neighbor.context[1, :77])
        assert not native.torch.equal(first.context[1, 77:154], neighbor.context[1, 77:154])
        assert native.torch.equal(first.query, neighbor.query)
        assert native.torch.equal(first.mask, neighbor.mask)
        assert native.torch.equal(first.pools, neighbor.pools)
        assert not native.torch.equal(first.attention, neighbor.attention)
        assert not native.torch.equal(first.image, neighbor.image)
        assert first.pixels != neighbor.pixels
        assert positive.context.shape[0] == 1


def test_shared_one_shot_recipe_returns_original_native_unet_result(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    a, b = e._save(tmp_path, lane, 1), e._save(tmp_path, lane, 2)
    recipe = e._same_recipe(a, b)
    expected = (
        e._oracle(lane, "oracle_a", "blur", ("oracle_a", a.tensors)),
        e._oracle(lane, "oracle_b", "grain", ("oracle_b", b.tensors)),
    )
    args: dict[str, Any] = e._arguments(lane, recipe, steps=1)
    batch = 2
    device = "cuda:0" if lane.device == "cuda" else "cpu"
    args.update(
        profile=CUDA_ENCODING if lane.device == "cuda" else CPU_ENCODING,
        negative_pooled_source_id=REGIONS[0],
        positive_pooled_source_id=REGIONS[0],
        sample=lane.torch.linspace(-0.8, 0.9, batch * 4 * 6, device=device)
        .reshape(batch, 4, 2, 3)
        .to(dtype=lane.dtype),
        timestep=lane.torch.tensor(7.0, device=device),
        time_ids=lane.torch.tensor(
            [[1024.0, 1024.0, 0.0, 0.0, 1024.0, 1024.0]], device=device, dtype=lane.dtype
        ).repeat(batch, 1),
    )
    with _observe(lane, monkeypatch, shared=True) as seen, _streaming_preserved(lane):
        result = lane.recipe.run_current_canvas_regional_recipe(recipe, **args)
    e._normal_result(lane, seen, result, 1, one_shot=True)
    assert len(seen.root_inputs) == len(seen.unet_results) == len(seen.contexts) == 1
    assert result is seen.unet_results[0]
    assert seen.root_inputs[0]["self"] is lane.pipeline.unet
    assert seen.pipelines == seen.pipeline_inputs == seen.pipeline_results == []
    assert seen.decodes == seen.decode_results == seen.steps == []
    assert len(seen.pairs) == 2
    _alias_rows(lane, seen, 0, a.tensors)
    _alias_rows(lane, seen, 1, b.tensors)
    e._consumption(lane, seen, expected, negative_pool=1, positive_pool=1)
    _budget(lane, seen)


@pytest.mark.parametrize("refs", ("active", "empty"))
def test_shared_position_embedding_bag_refuses_before_allocation_or_forward(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, refs: str
) -> None:
    with e._models("cpu") as native:
        torch = native.torch
        a = e._save(tmp_path, native, 1)
        recipe = e._same_recipe(a) if refs == "active" else e._with_resources(_recipe())
        positions = native.pipeline.text_encoder_2.text_model.embeddings
        standard = positions.position_embedding
        assert type(standard) is torch.nn.Embedding and standard.max_norm is None
        bag = torch.nn.EmbeddingBag(
            standard.num_embeddings,
            standard.embedding_dim,
            max_norm=0.01,
            device=standard.weight.device,
            dtype=standard.weight.dtype,
        ).eval()
        bag.weight = standard.weight
        assert type(bag) is torch.nn.EmbeddingBag and bag.training is False
        assert bag.weight is standard.weight
        assert bag.weight.dtype == standard.weight.dtype
        assert bag.weight.device == standard.weight.device
        allocated: list[str] = []
        forwarded: list[Any] = []
        original_forward = torch.nn.EmbeddingBag.forward

        def no_parameter(cls: Any, *args: Any, **kwargs: Any) -> Any:
            allocated.append("private Parameter")
            raise AssertionError("EmbeddingBag passed preflight before private table allocation")

        @wraps(original_forward)
        def bag_forward(current: Any, *args: Any, **kwargs: Any) -> Any:
            forwarded.append(current)
            return original_forward(current, *args, **kwargs)

        # The outer scope preserves the original standard module graph. The
        # inner _run scope also hashes the installed Bag's real shared weight;
        # an unfixed empty-ref forward must expose renormalization, not a stub.
        with _streaming_preserved(native):
            positions.position_embedding = bag
            try:
                with monkeypatch.context() as patch:
                    patch.setattr(torch.nn.Parameter, "__new__", staticmethod(no_parameter))
                    patch.setattr(torch.nn.EmbeddingBag, "forward", bag_forward)
                    error = _refuse(native, recipe, steps=1)
                assert getattr(error, "code", None) == "PROFILE_INVALID"
                assert "EmbeddingBag" in str(error)
                assert allocated == [] and forwarded == []
            finally:
                positions.position_embedding = standard
        assert positions.position_embedding is standard
        expected = (
            e._oracle(native, "oracle_a", "blur", ("oracle_a", a.tensors))
            if refs == "active"
            else e._oracle(
                native,
                recipe["item"]["prompts"]["positive"],
                recipe["item"]["prompts"]["negative"],
            )
        )
        with _observe(native, monkeypatch, shared=True) as seen:
            result = _run(native, recipe, steps=1)
        e._normal_result(native, seen, result, 1)
        e._consumption(native, seen, (expected,))
        if refs == "active":
            _alias_rows(native, seen, 0, a.tensors)
            _budget(native, seen)
        else:
            assert seen.loads == [] and seen.resizes == [] and seen.plans == [None]
            assert seen.pairs[0].pipeline is native.pipeline


def test_shared_position_embedding_leaf_control_green(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    with e._models("cpu") as native:
        a = e._save(tmp_path, native, 1)
        recipe = e._same_recipe(a)
        position = native.pipeline.text_encoder_2.text_model.embeddings.position_embedding
        assert type(position) is native.torch.nn.Embedding
        assert position.max_norm is None and position.training is False
        expected = e._oracle(native, "oracle_a", "blur", ("oracle_a", a.tensors))
        with _observe(native, monkeypatch, shared=True) as seen:
            result = _run(native, recipe, steps=1)
        e._normal_result(native, seen, result, 1)
        _alias_rows(native, seen, 0, a.tensors)
        e._consumption(native, seen, (expected,))
        _budget(native, seen)
        working = seen.pairs[0].pipeline.text_encoder_2.text_model.embeddings.position_embedding
        assert type(working) is native.torch.nn.Embedding and working is not position
        assert working.weight is position.weight


@pytest.mark.parametrize("refs", ("active", "empty"))
def test_shared_instance_norm_refuses_before_allocation_or_forward(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, refs: str
) -> None:
    with e._models("cpu") as native:
        torch = native.torch
        a = e._save(tmp_path, native, 1)
        recipe = e._same_recipe(a) if refs == "active" else e._with_resources(_recipe())
        encoder = native.pipeline.text_encoder_2
        standard = encoder.text_model.final_layer_norm
        normalization = torch.nn.InstanceNorm1d(
            77,
            track_running_stats=True,
            momentum=1,
            device=encoder.device,
            dtype=encoder.dtype,
        ).eval()
        normalization.track_running_stats = False
        assert type(normalization) is torch.nn.InstanceNorm1d
        assert normalization.training is False and normalization.track_running_stats is False
        assert normalization.running_mean is not None and normalization.running_var is not None
        buffers = tuple(
            (name, value, _storage(value), _tensor_hash(native, value))
            for name, value in normalization.named_buffers()
        )
        allocated: list[str] = []
        forwarded: list[Any] = []

        def no_parameter(cls: Any, *args: Any, **kwargs: Any) -> Any:
            allocated.append("private Parameter")
            raise AssertionError("InstanceNorm1d passed preflight before private table allocation")

        def observe_forward(original: Any) -> Any:
            @wraps(original)
            def forward(current: Any, *args: Any, **kwargs: Any) -> Any:
                forwarded.append(current)
                return original(current, *args, **kwargs)

            return forward

        # An unfixed empty-ref call reaches the original native input-statistics
        # write. _run hashes these source buffers and must expose that mutation.
        with _streaming_preserved(native):
            encoder.text_model.final_layer_norm = normalization
            try:
                with monkeypatch.context() as patch:
                    patch.setattr(torch.nn.Parameter, "__new__", staticmethod(no_parameter))
                    for cls in {
                        cast(Any, type(native.pipeline.text_encoder)),
                        cast(Any, type(encoder)),
                        torch.nn.InstanceNorm1d,
                    }:
                        patch.setattr(cls, "forward", observe_forward(cls.forward))
                    error = _refuse(native, recipe, steps=1)
                assert getattr(error, "code", None) == "PROFILE_INVALID"
                assert "InstanceNorm1d" in str(error)
                assert allocated == [] and forwarded == []
                current_buffers = dict(normalization.named_buffers())
                for name, value, storage, digest in buffers:
                    assert current_buffers[name] is value and _storage(value) == storage
                    assert _tensor_hash(native, value) == digest
            finally:
                encoder.text_model.final_layer_norm = standard
        assert encoder.text_model.final_layer_norm is standard
        expected = (
            e._oracle(native, "oracle_a", "blur", ("oracle_a", a.tensors))
            if refs == "active"
            else e._oracle(
                native,
                recipe["item"]["prompts"]["positive"],
                recipe["item"]["prompts"]["negative"],
            )
        )
        with _observe(native, monkeypatch, shared=True) as seen:
            result = _run(native, recipe, steps=1)
        e._normal_result(native, seen, result, 1)
        e._consumption(native, seen, (expected,))
        if refs == "active":
            _alias_rows(native, seen, 0, a.tensors)
            _budget(native, seen)
        else:
            assert seen.loads == [] and seen.resizes == [] and seen.plans == [None]
            assert seen.pairs[0].pipeline is native.pipeline


def test_legacy_instance_norm_independent_copy_control_green(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    with e._models("cpu") as native:
        torch = native.torch
        a = e._save(tmp_path, native, 1)
        recipe = e._same_recipe(a)
        encoder = native.pipeline.text_encoder_2
        standard = encoder.text_model.final_layer_norm
        normalization = torch.nn.InstanceNorm1d(
            77,
            track_running_stats=True,
            momentum=1,
            device=encoder.device,
            dtype=encoder.dtype,
        ).eval()
        normalization.track_running_stats = False
        assert type(normalization) is torch.nn.InstanceNorm1d
        assert normalization.training is False and normalization.track_running_stats is False
        assert normalization.running_mean is not None and normalization.running_var is not None
        buffers = tuple(
            (name, value, _storage(value), _tensor_hash(native, value))
            for name, value in normalization.named_buffers()
        )
        original_forward = torch.nn.InstanceNorm1d.forward
        calls: list[Any] = []

        @wraps(original_forward)
        def forward(current: Any, *args: Any, **kwargs: Any) -> Any:
            inputs = inspect.signature(original_forward).bind(current, *args, **kwargs)
            prior = (
                _tensor_hash(native, current.running_mean),
                _tensor_hash(native, current.running_var),
            )
            result = original_forward(current, *args, **kwargs)
            calls.append(
                SimpleNamespace(
                    module=current,
                    shape=tuple(inputs.arguments["input"].shape),
                    before=prior,
                    after=(
                        _tensor_hash(native, current.running_mean),
                        _tensor_hash(native, current.running_var),
                    ),
                )
            )
            return result

        with _streaming_preserved(native):
            encoder.text_model.final_layer_norm = normalization
            try:
                with monkeypatch.context() as patch:
                    patch.setattr(torch.nn.InstanceNorm1d, "forward", forward)
                    with _observe(native, patch, shared=False) as seen:
                        result = _run(native, recipe, profile=e.CPU_ENCODING, steps=1)
                e._normal_result(native, seen, result, 1)
                _alias_rows(native, seen, 0, a.tensors)
                # This control intentionally uses the actual altered native
                # normalization; a standard LayerNorm oracle has different pools.
                e._consumption(native, seen, tuple(pair.result for pair in seen.pairs))
                working = seen.pairs[0].pipeline.text_encoder_2.text_model.final_layer_norm
                assert type(working) is torch.nn.InstanceNorm1d and working is not normalization
                assert working.training is False and working.track_running_stats is False
                assert calls and all(call.module is working for call in calls)
                assert any(call.shape == (1, 77, 1280) for call in calls)
                assert any(call.before != call.after for call in calls), (
                    "original native InstanceNorm1d did not exercise its running-statistics write"
                )
                source_buffers = dict(normalization.named_buffers())
                private_buffers = dict(working.named_buffers())
                assert source_buffers.keys() == private_buffers.keys()
                for name, value, storage, digest in buffers:
                    assert source_buffers[name] is value and _storage(value) == storage
                    assert _tensor_hash(native, value) == digest
                    assert private_buffers[name] is not value
                    assert _storage(private_buffers[name]) != storage
                assert any(
                    _tensor_hash(native, private_buffers[name]) != digest
                    for name, _, _, digest in buffers
                    if name in ("running_mean", "running_var")
                )
            finally:
                encoder.text_model.final_layer_norm = standard
        assert encoder.text_model.final_layer_norm is standard
