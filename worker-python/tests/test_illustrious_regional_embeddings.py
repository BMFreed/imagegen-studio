"""Authored exact-TI contracts; ROOT alone imports, runs, reviews and mutates.

Only the two settled recipe entry points are subjects. Independently invoked
native fixture generators own every source model, including CUDA placement.
Authored safetensors are local, nonconstant mechanical vectors, never trained
weights. Main's real ProjectService/ModelService proof belongs to ROOT.

ROOT's decisive mutation installs valid global A vectors into ONLY regional B's
alias AFTER correct descriptor validation. Text is literally SAME in both
positive sources. Keep all other streams, ranges, masks, pools and seed intact.
test_regional_exact_vectors_mutation_red must fail at real loaded rows/context/
native attention; test_single_exact_resource_mutation_control_green stays green.
No mutation, replacement model result, alternate denoising loop, download,
allocator policy, retained artifact or public-readiness claim is supplied here.

The broad refusal matrix runs on CPU. Both lanes cover actual one/two Euler
steps, both layouts, native VAE, exact resources and failure recovery. Base CI
may skip optional native packages/hardware; ROOT's qualification needs zero skips.
"""

from __future__ import annotations

import copy
import dataclasses
import hashlib
import importlib
import inspect
import os
import re
import sys
import threading
import time
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from functools import wraps
from pathlib import Path
from types import BuiltinMethodType, CellType, FunctionType, SimpleNamespace
from typing import Any, cast

import pytest

from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.illustrious_regional_attention import Alpha8, Everywhere, Shape
from imagegen_worker.inference import build_sdxl_conditioning
from imagegen_worker.inference_embeddings import EmbeddingConditioningInputs
from test_illustrious_regional_conditioning import (
    _assert_ranges,  # pyright: ignore[reportPrivateUsage]
    _bindings,  # pyright: ignore[reportPrivateUsage]
    _dense_native_oracle,  # pyright: ignore[reportPrivateUsage]
    _first_attention,  # pyright: ignore[reportPrivateUsage]
    _mask,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_conditioning import native as _source_builder
from test_illustrious_regional_denoising import (
    _observe as _native_observer,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_denoising import (
    _preserved as _borrowed_preserved,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    LAYOUTS,
    LOCAL_VISIBLE,
    REGIONS,
    _literal_masks,  # pyright: ignore[reportPrivateUsage]
    _parameters,  # pyright: ignore[reportPrivateUsage]
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
)

CPU_ENCODING = "ordinary-canvas-static-dualclip-exact-ti-cpu-v1"
CUDA_ENCODING = "ordinary-canvas-static-dualclip-exact-ti-cuda-fp16-v1"
CPU_EXECUTION = "ordinary-canvas-euler-txt2img-cpu-v1"
CUDA_EXECUTION = "ordinary-canvas-euler-txt2img-cuda-fp16-v1"
LOCAL_CODES = frozenset(
    {"INPUT_INVALID", "PROFILE_INVALID", "UNSUPPORTED", "LIMIT", "SCOPE_CONFLICT"}
)
DOWNSTREAM_CODES = frozenset(
    {
        "GENERATION_INPUT_CHANGED",
        "GENERATION_EMBEDDING_UNSUPPORTED",
        "GENERATION_PROMPT_UNSUPPORTED",
        "INVALID_PATH",
    }
)
WIDTHS = (("clip_l", 768), ("clip_g", 1280))
MIB = 1024 * 1024


@contextmanager
def _models(
    device: str, *, extra_vocab: tuple[tuple[str, ...], tuple[str, ...]] = ((), ())
) -> Generator[Any]:
    """A fresh invocation, never a cached CPU fixture moved to another device."""
    torch = pytest.importorskip("torch")
    if device == "cuda" and not torch.cuda.is_available():
        pytest.skip("optional native CUDA hardware unavailable")
    devices = (
        list(range(torch.cuda.device_count()))
        if device == "cuda" or torch.cuda.is_initialized()
        else []
    )
    with torch.random.fork_rng(devices=devices), torch.no_grad():
        builder: Generator[Any] = cast(Any, _source_builder).__wrapped__()
        base = next(builder)
        try:
            tokenizers = [base.pipeline.tokenizer, base.pipeline.tokenizer_2]
            encoders = [base.pipeline.text_encoder, base.pipeline.text_encoder_2]
            for index, extra in enumerate(extra_vocab):
                if extra:
                    vocab = dict(tokenizers[index].get_vocab())
                    for token in extra:
                        vocab.setdefault(token, len(vocab))
                    tokenizers[index] = base.transformers.CLIPTokenizer(
                        vocab=vocab, merges=[], model_max_length=77
                    )
                    encoders[index].resize_token_embeddings(len(vocab), mean_resizing=False)
            vae = base.diffusers.AutoencoderKL(
                in_channels=3,
                out_channels=3,
                down_block_types=("DownEncoderBlock2D",) * 4,
                up_block_types=("UpDecoderBlock2D",) * 4,
                block_out_channels=(8, 8, 8, 8),
                layers_per_block=1,
                latent_channels=4,
                norm_num_groups=4,
                sample_size=16,
                force_upcast=False,
            ).eval()
            pipeline = base.diffusers.StableDiffusionXLPipeline(
                vae=vae,
                text_encoder=encoders[0],
                text_encoder_2=encoders[1],
                tokenizer=tokenizers[0],
                tokenizer_2=tokenizers[1],
                unet=base.pipeline.unet,
                scheduler=base.pipeline.scheduler,
                add_watermarker=False,
            )
            dtype = torch.float16 if device == "cuda" else torch.float32
            for model in (*encoders, pipeline.unet, vae):
                model.to(device="cuda:0" if device == "cuda" else "cpu", dtype=dtype).eval()
            pipeline.set_progress_bar_config(disable=True)
            native = SimpleNamespace(
                **{
                    **vars(base),
                    "pipeline": pipeline,
                    "recipe": importlib.import_module(
                        "imagegen_worker.illustrious_regional_recipe"
                    ),
                    "denoising": importlib.import_module(
                        "imagegen_worker.illustrious_regional_denoising"
                    ),
                    "device": device,
                    "dtype": dtype,
                    "extra_vocab": extra_vocab,
                }
            )
            build_sdxl_conditioning(
                _parameters("cat", "blur"),
                pipeline,
                native.runtime,
                embedding_inputs=EmbeddingConditioningInputs(("cat", "blur"), (None, None)),
            )
            for encoder in encoders:
                assert encoder.text_model._output_capturing_hooks_installed is True
            yield native
        finally:
            builder.close()


@pytest.fixture(scope="module")
def cpu() -> Iterator[Any]:
    with _models("cpu") as native:
        yield native


@pytest.fixture(scope="module")
def cuda() -> Iterator[Any]:
    with _models("cuda") as native:
        yield native


@pytest.fixture(scope="module", params=("cpu", "cuda"))
def lane(request: pytest.FixtureRequest) -> Any:
    return request.getfixturevalue(request.param)


def _decoder_binding(backend: Any) -> tuple[FunctionType, BuiltinMethodType, str]:
    """Read actual callback closure ownership without implementation helpers."""
    callback = backend.decode
    assert type(callback) is FunctionType
    assert callback.__closure__ is not None
    contents = tuple(cell.cell_contents for cell in callback.__closure__)
    builtins = tuple(value for value in contents if type(value) is BuiltinMethodType)
    suffixes = tuple(value for value in contents if type(value) is str)
    assert len(builtins) == 1
    assert suffixes == ("</w>",)
    assert builtins[0].__self__ is backend
    assert builtins[0].__name__ == "decode"
    assert backend.model.end_of_word_suffix == "</w>"
    return callback, builtins[0], suffixes[0]


@contextmanager
def _preserved(native: Any) -> Generator[None]:
    """Value equality alone misses native resize's Parameter.data mutation."""
    torch, pipeline = native.torch, native.pipeline
    roots = (pipeline.text_encoder, pipeline.text_encoder_2, pipeline.unet, pipeline.vae)
    tensors = tuple(
        (
            module,
            mapping,
            name,
            tensor,
            tensor.untyped_storage().data_ptr(),
            tensor.data_ptr(),
            tensor.storage_offset(),
            tensor.shape,
            tensor.stride(),
            tensor.dtype,
            tensor.device,
            tensor.detach().clone(),
        )
        for root in roots
        for module in root.modules()
        for mapping in ("_parameters", "_buffers")
        for name, tensor in getattr(module, mapping).items()
        if tensor is not None
    )
    nonpersistent = tuple(
        (module, frozenset(module._non_persistent_buffers_set))
        for root in roots
        for module in root.modules()
    )
    gradient_flags = tuple((record[3], record[3].requires_grad) for record in tensors)
    tokenizer_state = tuple(
        (tokenizer, tokenizer.backend_tokenizer.to_str())
        for tokenizer in (pipeline.tokenizer, pipeline.tokenizer_2)
    )
    decoder_state = tuple(
        (
            tokenizer.backend_tokenizer,
            tokenizer.backend_tokenizer.decode,
            tuple(
                (cell, cell.cell_contents)
                for cell in (getattr(tokenizer.backend_tokenizer.decode, "__closure__", None) or ())
            ),
        )
        for tokenizer in (pipeline.tokenizer, pipeline.tokenizer_2)
    )
    # CPU qualification does not initialize or require CUDA.
    cuda_rng = torch.cuda.get_rng_state_all() if torch.cuda.is_initialized() else None
    with _borrowed_preserved(native):
        try:
            yield
        finally:
            for record in tensors:
                (
                    module,
                    mapping,
                    name,
                    original,
                    storage,
                    data,
                    offset,
                    shape,
                    stride,
                    dtype,
                    dev,
                    value,
                ) = record
                actual = getattr(module, mapping)[name]
                assert actual is original
                assert actual.untyped_storage().data_ptr() == storage
                assert actual.data_ptr() == data and actual.storage_offset() == offset
                assert actual.shape == shape and actual.stride() == stride
                assert actual.dtype == dtype and actual.device == dev
                assert torch.equal(actual, value)
            for module, names in nonpersistent:
                assert frozenset(module._non_persistent_buffers_set) == names
            for tensor, requires_grad in gradient_flags:
                assert tensor.requires_grad is requires_grad
            for tokenizer, state in tokenizer_state:
                assert tokenizer.backend_tokenizer.to_str() == state
            for backend, callback, cells in decoder_state:
                assert backend.decode is callback
                actual_cells = getattr(callback, "__closure__", None) or ()
                assert len(actual_cells) == len(cells)
                for actual, (cell, value) in zip(actual_cells, cells, strict=True):
                    assert actual is cell and actual.cell_contents is value
            if cuda_rng is not None:
                assert all(
                    torch.equal(actual, prior)
                    for actual, prior in zip(torch.cuda.get_rng_state_all(), cuda_rng, strict=True)
                )


def _vectors(native: Any, marker: int, count: int = 3, *, dtype: Any = None) -> dict[str, Any]:
    torch = native.torch
    # A row/column-dependent phase and slope prevent constants, row swaps and
    # replacing all rows with a single vector from satisfying the oracle.
    return {
        key: (
            torch.sin(torch.arange(count * width).reshape(count, width) * (0.013 + marker * 0.003))
            * (0.2 + marker * 0.07)
            + torch.arange(count).reshape(count, 1) * 0.021
        ).to(dtype=dtype or torch.float32)
        for key, width in WIDTHS
    }


def _resource(path: Path, token: str, data: bytes, marker: int) -> dict[str, Any]:
    return {
        "token": token,
        "byteSize": len(data),
        "managedPath": str(path),
        "reference": {
            "baseModelFamily": "illustrious",
            "civitaiFileId": 100 + marker,
            "civitaiModelId": 200 + marker,
            "civitaiVersionId": 300 + marker,
            "displayName": f"authored vectors {marker}",
            "fileSha256": hashlib.sha256(data).hexdigest(),
            "kind": "embedding",
            "localModelId": f"local-fixture-{marker}",
            "localVersionId": f"local-version-{marker}",
            "predictionType": None,
            "versionName": "local nontrained fixture",
        },
    }


def _save(
    tmp_path: Path,
    native: Any,
    marker: int,
    *,
    token: str = "SAME",
    count: int = 3,
    tensors: dict[str, Any] | None = None,
    dtype: Any = None,
) -> Any:
    safetensors = pytest.importorskip("safetensors.torch")
    state = _vectors(native, marker, count, dtype=dtype) if tensors is None else tensors
    path = tmp_path / f"authored-{marker}.safetensors"
    safetensors.save_file(state, str(path))
    data = path.read_bytes()
    return SimpleNamespace(
        descriptor=_resource(path, token, data, marker), tensors=state, path=path
    )


def _empty_pair() -> dict[str, Any]:
    return {"negative": [], "positive": []}


def _with_resources(recipe: dict[str, Any]) -> dict[str, Any]:
    recipe["globalEmbeddings"] = _empty_pair()
    for region in recipe["regions"]:
        region["embeddings"] = _empty_pair()
    return recipe


def _bind(recipe: Any, index: int | None, sign: str, *resources: Any) -> None:
    if index is None:
        prompt = recipe["globalPrompts"][sign]
        pair = recipe["globalEmbeddings"]
    else:
        region = recipe["regions"][index]
        prompt = region["positive"] if sign == "positive" else region["negative"]["prompt"]
        pair = region["embeddings"]
    prompt["embeddingRefs"] = [
        {
            "token": resource.descriptor["token"],
            "resource": copy.deepcopy(resource.descriptor["reference"]),
        }
        for resource in resources
    ]
    pair[sign] = [copy.deepcopy(resource.descriptor) for resource in resources]
    if index is not None:
        authored = recipe["regions"][index]["authoredPrompts"]
        if sign == "positive" or not authored["useGlobalNegativePrompt"]:
            authored[sign] = copy.deepcopy(prompt)


def _same_recipe(a: Any, b: Any | None = None) -> dict[str, Any]:
    recipe = _with_resources(
        _recipe(*(() if b is None else (_region(positive="SAME"),)), positive="SAME")
    )
    _bind(recipe, None, "positive", a)
    if b is not None:
        _bind(recipe, 0, "positive", b)
    return recipe


def _arguments(
    native: Any, recipe: Any, *, layout: str = LAYOUTS[0], steps: int = 2
) -> dict[str, Any]:
    item = recipe["item"]
    return {
        "pipeline": native.pipeline,
        "runtime": native.runtime,
        "parameters": _parameters(
            item["prompts"]["positive"],
            item["prompts"]["negative"],
            seed=item["seed"],
            steps=steps,
            scheduler="euler",
            cfg_scale=5.0 if layout == LAYOUTS[0] else 1.0,
            vae_precision="FP16" if native.device == "cuda" else "FP32",
        ),
        "profile": CUDA_ENCODING if native.device == "cuda" else CPU_ENCODING,
        "global_negative_coverage": Everywhere(),
        "global_positive_coverage": Everywhere(),
        "negative_pooled_source_id": "current-canvas",
        "positive_pooled_source_id": "current-canvas",
        "bindings": _bindings(native, native.pipeline.unet),
        "layout": layout,
    }


def _call(native: Any, recipe: Any, *, one_shot: bool = False, **changes: Any) -> Any:
    layout, steps = changes.pop("layout", LAYOUTS[0]), changes.pop("steps", 2)
    args = _arguments(native, recipe, layout=layout, steps=steps)
    # Ordinary frontend parameters carry no resources. Explicit malformed
    # parameter overrides below remain available to the refusal cases.
    assert args["parameters"].positive_embeddings == args["parameters"].negative_embeddings == ()
    args.update(changes)
    with _preserved(native):
        if one_shot:
            batch = 2 if layout == LAYOUTS[0] else 1
            device = "cuda:0" if native.device == "cuda" else "cpu"
            args.update(
                sample=native.torch.linspace(-0.8, 0.9, batch * 4 * 6, device=device)
                .reshape(batch, 4, 2, 3)
                .to(dtype=native.dtype),
                timestep=native.torch.tensor(7.0, device=device),
                time_ids=native.torch.tensor(
                    [[1024.0, 1024.0, 0.0, 0.0, 1024.0, 1024.0]], device=device, dtype=native.dtype
                ).repeat(batch, 1),
            )
            return native.recipe.run_current_canvas_regional_recipe(recipe, **args)
        args["denoising_profile"] = CUDA_EXECUTION if native.device == "cuda" else CPU_EXECUTION
        return native.denoising.run_current_canvas_regional_denoising(recipe, **args)


def _loader_mixin() -> Any:
    return importlib.import_module(
        "diffusers.loaders.textual_inversion"
    ).TextualInversionLoaderMixin


@contextmanager
def _observe(native: Any, monkeypatch: pytest.MonkeyPatch) -> Generator[Any]:
    """Classes are observed before admission; every native result is delegated."""
    with (
        _native_observer(native.denoising, native, monkeypatch) as seen,
        monkeypatch.context() as patch,
    ):
        seen.loads, seen.encoder_calls, seen.pairs = [], [], []
        seen.source_decoders = tuple(
            _decoder_binding(tokenizer.backend_tokenizer)
            for tokenizer in (native.pipeline.tokenizer, native.pipeline.tokenizer_2)
        )
        loader_type = _loader_mixin()
        loader = loader_type.load_textual_inversion

        @wraps(loader)
        def load(current: Any, *args: Any, **kwargs: Any) -> Any:
            result = loader(current, *args, **kwargs)
            tokenizer, encoder = kwargs["tokenizer"], kwargs["text_encoder"]
            seen.loads.append(
                SimpleNamespace(
                    pipeline=current,
                    tokenizer=tokenizer,
                    encoder=encoder,
                    vocab=dict(tokenizer.get_vocab()),
                    rows=encoder.get_input_embeddings().weight.detach().clone(),
                )
            )
            return result

        patch.setattr(loader_type, "load_textual_inversion", load)
        for cls in {
            cast(Any, type(native.pipeline.text_encoder)),
            cast(Any, type(native.pipeline.text_encoder_2)),
        }:
            original_forward = cls.forward

            def observer(original: Any) -> Any:
                @wraps(original)
                def forward(current: Any, *args: Any, **kwargs: Any) -> Any:
                    bound = inspect.signature(original).bind(current, *args, **kwargs)
                    seen.encoder_calls.append(
                        SimpleNamespace(
                            encoder=current,
                            ids=bound.arguments["input_ids"].detach().clone(),
                            rows=current.get_input_embeddings().weight.detach().clone(),
                        )
                    )
                    return original(current, *args, **kwargs)

                return forward

            patch.setattr(cls, "forward", observer(original_forward))

        @wraps(build_sdxl_conditioning)
        def build(parameters: Any, pipeline: Any, runtime: Any, **kwargs: Any) -> Any:
            inputs = kwargs["embedding_inputs"]
            assert type(inputs) is EmbeddingConditioningInputs
            manager_type = importlib.import_module(
                "compel.embeddings_provider"
            ).BaseTextualInversionManager
            for tokenizer, encoder, manager, borrowed_tokenizer, borrowed_encoder in (
                (
                    pipeline.tokenizer,
                    pipeline.text_encoder,
                    inputs.managers[0],
                    native.pipeline.tokenizer,
                    native.pipeline.text_encoder,
                ),
                (
                    pipeline.tokenizer_2,
                    pipeline.text_encoder_2,
                    inputs.managers[1],
                    native.pipeline.tokenizer_2,
                    native.pipeline.text_encoder_2,
                ),
            ):
                assert tokenizer is not borrowed_tokenizer and encoder is not borrowed_encoder
                assert manager is None or isinstance(manager, manager_type)
                if parameters.positive_embeddings or parameters.negative_embeddings:
                    assert manager is not None
                    assert any(loaded.encoder is encoder for loaded in seen.loads)
            result = build_sdxl_conditioning(parameters, pipeline, runtime, **kwargs)
            seen.pairs.append(
                SimpleNamespace(
                    parameters=parameters, pipeline=pipeline, inputs=inputs, result=result
                )
            )
            return result

        # Follow aliases of the existing producer by object identity, without
        # inventing a new implementation helper, module or signature.
        for module_name, module in tuple(sys.modules.items()):
            if module_name.startswith("imagegen_worker.") and cast(Any, module) is not None:
                for name, value in tuple(vars(module).items()):
                    if (
                        value is build_sdxl_conditioning
                        or getattr(value, "__wrapped__", None) is build_sdxl_conditioning
                    ):
                        patch.setattr(module, name, build)
        yield seen


def _oracle(
    native: Any,
    positive: str,
    negative: str,
    *bindings: tuple[str, Any],
) -> Any:
    """Original Compel on independently constructed CLIPs, with native expansion.

    Callers author explicit expected alias text. Diffusers expands multivectors
    into actual added-token strings; no worker literal matcher, alias planner,
    manager, encoder helper or conditioning builder supplies the expected data.
    """
    torch, compel = native.torch, native.runtime.compel
    with _models(native.device, extra_vocab=native.extra_vocab) as independent:
        pipeline = independent.pipeline
        signed: list[list[Any]] = [[], []]
        pools: list[Any] = []
        for key, tokenizer, encoder, pooled in (
            ("clip_l", pipeline.tokenizer, pipeline.text_encoder, False),
            ("clip_g", pipeline.tokenizer_2, pipeline.text_encoder_2, True),
        ):
            if bindings:
                pipeline.load_textual_inversion(
                    [
                        state[key].reshape(-1, dict(WIDTHS)[key]).to(dtype=encoder.dtype)
                        for _, state in bindings
                    ],
                    token=[alias for alias, _ in bindings],
                    tokenizer=tokenizer,
                    text_encoder=encoder,
                    local_files_only=True,
                )
            builder = compel.Compel(
                tokenizer=tokenizer,
                text_encoder=encoder,
                returned_embeddings_type=compel.ReturnedEmbeddingsType.PENULTIMATE_HIDDEN_STATES_NON_NORMALIZED,
                truncate_long_prompts=False,
                split_long_text_mode=compel.SplitLongTextMode.SENTENCES,
                requires_pooled=pooled,
                textual_inversion_manager=None,
            )
            for index, text in enumerate((positive, negative)):
                if not text:
                    hidden = torch.zeros(
                        (1, 77, encoder.config.hidden_size),
                        device=encoder.device,
                        dtype=encoder.dtype,
                    )
                    pool = torch.zeros((1, 1280), device=encoder.device, dtype=encoder.dtype)
                else:
                    result = builder(pipeline.maybe_convert_prompt(text, tokenizer))
                    hidden, pool = result if pooled else (result, None)
                signed[index].append(hidden.detach().clone())
                if pooled:
                    pools.append(cast(Any, pool).detach().clone())
        values: list[Any] = []
        for clips in signed:
            length = max(value.shape[1] for value in clips)
            values.append(
                torch.cat(
                    [
                        torch.nn.functional.pad(value, (0, 0, 0, length - value.shape[1]))
                        for value in clips
                    ],
                    dim=-1,
                )
            )
        return SimpleNamespace(
            positive=values[0],
            negative=values[1],
            positive_pooled=pools[0],
            negative_pooled=pools[1],
            positive_length=values[0].shape[1],
            negative_length=values[1].shape[1],
        )


def _bank(native: Any, streams: tuple[Any, ...], sign: str, keys: int) -> Any:
    bank = native.torch.zeros(
        (1, keys, 2048), device=native.pipeline.unet.device, dtype=native.dtype
    )
    cursor = 0
    for stream in streams:
        if stream is not None:
            value = getattr(stream, sign)
            bank[:, cursor : cursor + value.shape[1]] = value
            cursor += value.shape[1]
    return bank


def _consumption(
    native: Any,
    seen: Any,
    streams: tuple[Any, ...],
    *,
    layout: str = LAYOUTS[0],
    positive_present: tuple[bool, ...] | None = None,
    negative_pool: int = 0,
    positive_pool: int = 0,
    visibility: tuple[tuple[bool, ...], ...] | None = None,
) -> Any:
    present = (True,) * len(streams) if positive_present is None else positive_present
    negative_lengths = tuple(stream.negative_length for stream in streams)
    positive_lengths = tuple(
        stream.positive_length if yes else 0 for stream, yes in zip(streams, present, strict=True)
    )
    keys = max(sum(negative_lengths), sum(positive_lengths))
    context = native.torch.cat(
        (
            _bank(native, streams, "negative", keys),
            _bank(
                native,
                tuple(
                    stream if yes else None for stream, yes in zip(streams, present, strict=True)
                ),
                "positive",
                keys,
            ),
        )
    )
    pools = native.torch.cat(
        (streams[negative_pool].negative_pooled, streams[positive_pool].positive_pooled)
    )
    if layout == LAYOUTS[1]:
        context, pools = context[1:2], pools[1:2]
    permissions = _literal_masks(
        native,
        negative_lengths=negative_lengths,
        positive_lengths=positive_lengths,
        visibility=(LOCAL_VISIBLE,) * (len(streams) - 1) if visibility is None else visibility,
        layout=layout,
    ).to(device=context.device)
    for index, actual in enumerate(seen.contexts):
        assert native.torch.equal(actual, context), (
            "actual native attention has the wrong exact resource stream"
        )
        assert native.torch.equal(
            _mask(native, seen.masks[index], len(context), 6, keys), permissions
        )
        actual_kwargs = seen.root_inputs[index]["added_cond_kwargs"]
        assert native.torch.equal(actual_kwargs["text_embeds"], pools)
        assert native.torch.equal(
            actual_kwargs["time_ids"],
            native.torch.tensor(
                [[1024, 1024, 0, 0, 1024, 1024]], device=context.device, dtype=native.dtype
            ).repeat(len(context), 1),
        )
        expected = _dense_native_oracle(
            native,
            _first_attention(native, native.pipeline.unet),
            seen.queries[index],
            context,
            permissions,
        )
        tolerance = 0.004 if native.device == "cuda" else 2e-6
        assert native.torch.allclose(seen.outputs[index], expected, atol=tolerance, rtol=tolerance)
    assert seen.contexts
    plan = seen.scopes[0].plan
    identities = ("current-canvas",) + REGIONS[: len(streams) - 1]
    for sign, lengths in (("negative", negative_lengths), ("positive", positive_lengths)):
        ranges: list[tuple[str, int, int]] = []
        cursor = 0
        for identity, length in zip(identities, lengths, strict=True):
            if length:
                ranges.append((identity, cursor, cursor + length))
                cursor += length
        _assert_ranges(plan, sign, tuple(ranges))
    return context


def _rows(native: Any, seen: Any, pair_index: int, sign: str, state: dict[str, Any]) -> None:
    pair = seen.pairs[pair_index]
    alias = pair.inputs.prompts[0 if sign == "positive" else 1]
    assert re.fullmatch(r"igs_ti_private_\d+", alias), alias
    count = state["clip_l"].reshape(-1, 768).shape[0]
    if seen.pipelines:
        assert seen.pipelines[0].unet is native.pipeline.unet
        assert seen.pipelines[0].vae is native.pipeline.vae
    else:
        assert seen.root_inputs[0]["self"] is native.pipeline.unet
    for index, (key, width) in enumerate(WIDTHS):
        tokenizer = (pair.pipeline.tokenizer, pair.pipeline.tokenizer_2)[index]
        encoder = (pair.pipeline.text_encoder, pair.pipeline.text_encoder_2)[index]
        assert encoder is not (native.pipeline.text_encoder, native.pipeline.text_encoder_2)[index]
        assert tokenizer is not (native.pipeline.tokenizer, native.pipeline.tokenizer_2)[index]
        source_tokenizer = (native.pipeline.tokenizer, native.pipeline.tokenizer_2)[index]
        source_callback, source_builtin, source_suffix = _decoder_binding(
            source_tokenizer.backend_tokenizer
        )
        prior_callback, prior_builtin, prior_suffix = seen.source_decoders[index]
        assert source_callback is prior_callback and source_builtin is prior_builtin
        assert source_builtin.__self__ is source_tokenizer.backend_tokenizer
        assert source_suffix == prior_suffix == "</w>"
        assert tokenizer.backend_tokenizer is not source_tokenizer.backend_tokenizer
        owned_callback, owned_builtin, owned_suffix = _decoder_binding(tokenizer.backend_tokenizer)
        assert owned_callback is not source_callback
        assert owned_builtin is not source_builtin
        assert owned_builtin.__self__ is tokenizer.backend_tokenizer
        assert owned_suffix == "</w>"
        source_encoder = (native.pipeline.text_encoder, native.pipeline.text_encoder_2)[index]
        original_modules: dict[str, Any] = dict(source_encoder.named_modules())
        copied_modules: dict[str, Any] = dict(encoder.named_modules())
        assert original_modules.keys() == copied_modules.keys()
        for name, source_module in original_modules.items():
            copied = copied_modules[name]
            assert copied is not source_module and type(copied) is type(source_module)
            for slot in ("_parameters", "_buffers"):
                original_state, copied_state = getattr(source_module, slot), getattr(copied, slot)
                assert original_state.keys() == copied_state.keys()
                for field, source_tensor in original_state.items():
                    owned = copied_state[field]
                    if source_tensor is None:
                        assert owned is None
                        continue
                    assert owned is not source_tensor
                    assert (
                        owned.untyped_storage().data_ptr()
                        != source_tensor.untyped_storage().data_ptr()
                    )
                    assert (
                        owned.dtype == source_tensor.dtype and owned.device == source_tensor.device
                    )
                    assert owned.requires_grad == source_tensor.requires_grad
                    if source_module is source_encoder.get_input_embeddings() and field == "weight":
                        assert native.torch.equal(owned[: source_tensor.shape[0]], source_tensor)
                    else:
                        assert native.torch.equal(owned, source_tensor)
        ids = [
            tokenizer.convert_tokens_to_ids(alias if row == 0 else f"{alias}_{row}")
            for row in range(count)
        ]
        assert len(set(ids)) == count
        loads = [loaded for loaded in seen.loads if loaded.encoder is encoder]
        assert loads, "the private encoder bypassed the original native TI loader"
        assert loads[-1].vocab == tokenizer.get_vocab()
        manager = pair.inputs.managers[index]
        assert manager.expand_textual_inversion_token_ids_if_necessary([ids[0]]) == ids
        expected = state[key].reshape(-1, width).to(device=encoder.device, dtype=encoder.dtype)
        assert native.torch.equal(loads[-1].rows[ids], expected)
        assert native.torch.equal(encoder.get_input_embeddings().weight[ids], expected)
        alias_ids: set[int] = set(ids)
        special_ids: set[int | None] = {
            tokenizer.bos_token_id,
            tokenizer.eos_token_id,
            tokenizer.pad_token_id,
        }
        consumed = [
            call
            for call in seen.encoder_calls
            if call.encoder is encoder and not alias_ids.isdisjoint(call.ids.reshape(-1).tolist())
        ]
        assert consumed, "the real CLIP never consumed the bound alias"
        covered: set[int] = set()
        for call in consumed:
            assert native.torch.equal(call.rows[ids], expected), (
                "wrong rows at the actual native CLIP call"
            )
            flat: list[int] = call.ids.reshape(-1).tolist()
            portion = [token for token in flat if token not in special_ids]
            assert portion and portion[0] in alias_ids
            start = ids.index(portion[0])
            assert portion == ids[start : start + len(portion)]
            covered.update(portion)
        assert covered == alias_ids


def _normal_result(
    native: Any, seen: Any, result: Any, steps: int, *, one_shot: bool = False
) -> None:
    if one_shot:
        assert result is seen.unet_results[0]
        tensor = result.sample
        assert tensor.shape == (2, 4, 2, 3)
    else:
        output = importlib.import_module("diffusers.pipelines.stable_diffusion_xl.pipeline_output")
        assert type(result) is output.StableDiffusionXLPipelineOutput
        assert len(seen.pipeline_results) == 1 and result is seen.pipeline_results[0]
        tensor = result.images
        assert tensor.shape == (1, 3, 16, 24)
        assert len(seen.steps) == len(seen.unet_results) == steps
        assert len(seen.decodes) == len(seen.decode_results) == 1
        assert seen.pipelines[0] is not native.pipeline
        assert seen.pipelines[0].unet is native.pipeline.unet
        assert seen.pipelines[0].vae is native.pipeline.vae
        assert seen.schedulers[0] is not native.pipeline.scheduler
        assert type(seen.schedulers[0]) is native.diffusers.EulerDiscreteScheduler
        config = seen.schedulers[0].config
        assert config.beta_schedule == "scaled_linear" and config.prediction_type == "epsilon"
        assert config.timestep_spacing == "linspace" and config.rescale_betas_zero_snr is False
        assert seen.generators[0].device.type == "cpu" and seen.generators[0].initial_seed() == 42
    assert tensor.dtype == native.dtype
    assert tensor.device.type == native.device
    assert native.torch.isfinite(tensor).all()
    for root, result in zip(seen.root_inputs, seen.unet_results, strict=True):
        prediction = cast(Any, result)[0] if isinstance(result, tuple) else result.sample
        for value in (
            root["sample"],
            root["encoder_hidden_states"],
            prediction,
            *root["added_cond_kwargs"].values(),
        ):
            assert value.dtype == native.dtype and value.device == tensor.device
            assert not value.requires_grad and native.torch.isfinite(value).all()
        assert root["timestep"].dtype == native.torch.float32
        assert root["timestep"].device == tensor.device and root["timestep"].ndim == 0
    for transition in seen.steps:
        assert transition["model_output"].dtype == native.dtype
        assert transition["model_output"].device == tensor.device
    for value in seen.decodes:
        assert value.dtype == native.dtype and value.device == tensor.device


@pytest.mark.parametrize("layout", LAYOUTS)
@pytest.mark.parametrize("steps", (1, 2))
def test_exact_same_positive_sources_real_euler_vae_and_nonfirst_pools(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch, layout: str, steps: int
) -> None:
    a, b = _save(tmp_path, lane, 1), _save(tmp_path, lane, 2)
    recipe = _same_recipe(a, b)
    expected = (
        _oracle(lane, "oracle_a", "blur", ("oracle_a", a.tensors)),
        _oracle(lane, "oracle_b", "grain", ("oracle_b", b.tensors)),
    )
    with _observe(lane, monkeypatch) as seen:
        result = _call(
            lane,
            recipe,
            layout=layout,
            steps=steps,
            negative_pooled_source_id=REGIONS[0],
            positive_pooled_source_id=REGIONS[0],
        )
    _normal_result(lane, seen, result, steps)
    assert len(seen.pairs) == 2  # independent of native denoising step count
    for field in ("text_encoder", "text_encoder_2", "tokenizer", "tokenizer_2"):
        assert len({id(getattr(pair.pipeline, field)) for pair in seen.pairs}) == 1
    assert [
        (pair.parameters.positive_prompt, pair.parameters.negative_prompt) for pair in seen.pairs
    ] == [("SAME", "blur"), ("SAME", "grain")]
    _rows(lane, seen, 0, "positive", a.tensors)
    _rows(lane, seen, 1, "positive", b.tensors)
    assert seen.pairs[0].inputs.prompts[0] != seen.pairs[1].inputs.prompts[0]
    _consumption(lane, seen, expected, layout=layout, negative_pool=1, positive_pool=1)


def test_regional_exact_vectors_mutation_red(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    a, b = _save(tmp_path, lane, 1), _save(tmp_path, lane, 2)
    original = _same_recipe(a, b)
    assert (
        original["globalPrompts"]["positive"]["text"]
        == original["regions"][0]["positive"]["text"]
        == "SAME"
    )
    assert a.descriptor["reference"]["fileSha256"] != b.descriptor["reference"]["fileSha256"]
    global_expected = _oracle(lane, "oracle_a", "blur", ("oracle_a", a.tensors))
    regional_expected = _oracle(lane, "oracle_b", "grain", ("oracle_b", b.tensors))
    with _observe(lane, monkeypatch) as exact:
        result = _call(lane, original)
    _normal_result(lane, exact, result, 2)
    _rows(lane, exact, 0, "positive", a.tensors)
    _rows(lane, exact, 1, "positive", b.tensors)
    _consumption(lane, exact, (global_expected, regional_expected))
    # A legitimate single-variable neighbor replaces B's descriptor AND refs.
    # The ROOT mutation instead changes installed vectors after validation.
    with _observe(lane, monkeypatch) as neighbor:
        changed = _call(lane, _same_recipe(a, a))
    assert lane.torch.equal(exact.contexts[0][0], neighbor.contexts[0][0])
    assert lane.torch.equal(exact.contexts[0][1, :77], neighbor.contexts[0][1, :77])
    assert not lane.torch.equal(exact.contexts[0][1, 77:154], neighbor.contexts[0][1, 77:154])
    assert not lane.torch.equal(exact.outputs[0], neighbor.outputs[0])
    assert not lane.torch.equal(result.images, changed.images)


def test_single_exact_resource_mutation_control_green(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    a = _save(tmp_path, lane, 1)
    expected = _oracle(lane, "oracle_a", "blur", ("oracle_a", a.tensors))
    with _observe(lane, monkeypatch) as seen:
        result = _call(lane, _same_recipe(a))
    _normal_result(lane, seen, result, 2)
    _rows(lane, seen, 0, "positive", a.tensors)
    _consumption(lane, seen, (expected,))


def test_same_seed_repeat_and_negative_only_resource_change_positive_only(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    a, b, c = (_save(tmp_path, lane, index) for index in (1, 2, 3))
    recipe = _same_recipe(a, b)
    recipe["regions"][0]["negative"]["prompt"]["text"] = "SAME"
    _bind(recipe, 0, "negative", a)
    observations: list[Any] = []
    results: list[Any] = []
    for candidate in (recipe, copy.deepcopy(recipe), copy.deepcopy(recipe)):
        if len(results) == 2:
            _bind(candidate, 0, "negative", c)
        with _observe(lane, monkeypatch) as seen:
            result = _call(lane, candidate, layout=LAYOUTS[1])
        _normal_result(lane, seen, result, 2)
        _rows(lane, seen, 1, "negative", c.tensors if len(results) == 2 else a.tensors)
        observations.append(seen)
        results.append(result.images)
    assert all(lane.torch.equal(results[0], result) for result in results[1:])
    assert all(len(seen.pairs) == 2 for seen in observations)
    for seen in observations[1:]:
        assert lane.torch.equal(observations[0].contexts[0], seen.contexts[0])
        assert lane.torch.equal(observations[0].outputs[0], seen.outputs[0])
        assert lane.torch.equal(
            observations[0].steps[0]["model_output"], seen.steps[0]["model_output"]
        )


def test_one_shot_entry_returns_original_native_unet_result(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    a, b = _save(tmp_path, lane, 1), _save(tmp_path, lane, 2)
    expected = (
        _oracle(lane, "oracle_a", "blur", ("oracle_a", a.tensors)),
        _oracle(lane, "oracle_b", "grain", ("oracle_b", b.tensors)),
    )
    with _observe(lane, monkeypatch) as seen:
        result = _call(lane, _same_recipe(a, b), one_shot=True)
    _normal_result(lane, seen, result, 1, one_shot=True)
    _rows(lane, seen, 1, "positive", b.tensors)
    _consumption(lane, seen, expected)


def test_absence_empty_inherited_local_and_dormant_refs_keep_distinct_ownership(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    a, b, c = (_save(tmp_path, cpu, index) for index in (1, 2, 3))
    recipe = _with_resources(
        _recipe(
            _region(0, positive=None, negative="SAME", inherited=True),
            _region(1, positive="", negative=""),
            _region(2, positive="SAME", negative="SAME", kind="intersecting-empty"),
            positive="SAME",
            negative="SAME",
        )
    )
    _bind(recipe, None, "positive", a)
    _bind(recipe, None, "negative", c)
    _bind(recipe, 0, "negative", c)
    _bind(recipe, 2, "positive", b)
    _bind(recipe, 2, "negative", a)
    dormant = copy.deepcopy(c.descriptor["reference"])
    dormant["fileSha256"] = "f" * 64
    recipe["regions"][0]["authoredPrompts"]["negative"] = {
        "text": "dormant SAME {unused}",
        "embeddingRefs": [{"token": "SAME", "resource": dormant}],
    }
    streams = (
        _oracle(cpu, "oracle_a", "oracle_c", ("oracle_a", a.tensors), ("oracle_c", c.tensors)),
        _oracle(cpu, "", "oracle_c", ("oracle_c", c.tensors)),
        _oracle(cpu, "", ""),
        _oracle(cpu, "oracle_b", "oracle_a", ("oracle_b", b.tensors), ("oracle_a", a.tensors)),
    )
    with _observe(cpu, monkeypatch) as seen:
        result = _call(
            cpu, recipe, negative_pooled_source_id=REGIONS[0], positive_pooled_source_id=REGIONS[2]
        )
    _normal_result(cpu, seen, result, 2)
    assert len(seen.pairs) == 4
    assert seen.pairs[1].parameters.positive_prompt == ""
    assert seen.pairs[1].parameters.negative_prompt == "SAME"
    _rows(cpu, seen, 1, "negative", c.tensors)
    _rows(cpu, seen, 3, "negative", a.tensors)
    context = _consumption(
        cpu,
        seen,
        streams,
        positive_present=(True, False, True, True),
        negative_pool=1,
        positive_pool=3,
        visibility=(LOCAL_VISIBLE, LOCAL_VISIBLE, (False,) * 6),
    )
    assert cpu.torch.count_nonzero(context[1, 77:154]) == 0
    assert not cpu.torch.equal(streams[0].positive_pooled, streams[3].positive_pooled)
    # Dormant authored refs neither open a file nor alter any active stream.
    changed = copy.deepcopy(recipe)
    changed["regions"][0]["authoredPrompts"]["negative"] = {
        "text": "other dormant",
        "embeddingRefs": [],
    }
    unchanged = _call(
        cpu, changed, negative_pooled_source_id=REGIONS[0], positive_pooled_source_id=REGIONS[2]
    )
    assert cpu.torch.equal(unchanged.images, result.images)


@pytest.mark.parametrize(
    "collision", ("later-normalized-text", "first-vocab-suffix", "second-vocab-base")
)
def test_alias_planning_sees_every_source_and_both_native_vocabularies(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, collision: str
) -> None:
    extras = (
        (("igs_ti_private_0_1",), ())
        if collision == "first-vocab-suffix"
        else ((), ("igs_ti_private_0",))
        if collision == "second-vocab-base"
        else ((), ())
    )
    with _models("cpu", extra_vocab=extras) as native:
        a = _save(tmp_path, native, 1)
        later = (
            "IGS_TI_PRIVATE_0 igs_ti_private_1_1" if collision == "later-normalized-text" else "cat"
        )
        recipe = _with_resources(_recipe(_region(positive="dog", negative=later), positive="SAME"))
        _bind(recipe, None, "positive", a)
        streams = (
            _oracle(native, "oracle_a", "blur", ("oracle_a", a.tensors)),
            _oracle(native, "dog", later),
        )
        with _observe(native, monkeypatch) as seen:
            result = _call(native, recipe)
        _normal_result(native, seen, result, 2)
        _rows(native, seen, 0, "positive", a.tensors)
        alias = seen.pairs[0].inputs.prompts[0]
        assert alias != "igs_ti_private_0"
        if collision == "later-normalized-text":
            assert alias != "igs_ti_private_1"
        assert seen.pairs[1].inputs.prompts[1] == later
        _consumption(native, seen, streams)


@pytest.mark.parametrize("syntax", ("case-boundary", "longest-crossing", "weighted-repeated"))
def test_real_literal_matching_weights_and_multivector_repetition(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch, syntax: str
) -> None:
    a = _save(tmp_path, cpu, 1, token="ab:" if syntax == "longest-crossing" else "SAME")
    b = _save(tmp_path, cpu, 2, token=":cde")
    text, expected_text = {
        "case-boundary": ("SAMEish same SAME SAME", "SAMEish same oracle_a oracle_a"),
        "longest-crossing": ("ab:cde ab: :cde", "aboracle_b oracle_a oracle_b"),
        "weighted-repeated": ("portrait (SAME:1.4) SAME", "portrait (oracle_a)1.4 oracle_a"),
    }[syntax]
    recipe = _with_resources(_recipe(positive=text))
    _bind(recipe, None, "positive", *((a, b) if syntax == "longest-crossing" else (a,)))
    bindings = (
        (("oracle_a", a.tensors), ("oracle_b", b.tensors))
        if syntax == "longest-crossing"
        else (("oracle_a", a.tensors),)
    )
    expected = _oracle(cpu, expected_text, "blur", *bindings)
    with _observe(cpu, monkeypatch) as seen:
        result = _call(cpu, recipe)
    _normal_result(cpu, seen, result, 2)
    _consumption(cpu, seen, (expected,))
    for index, (_, width) in enumerate(WIDTHS):
        tokenizer = (seen.pairs[0].pipeline.tokenizer, seen.pairs[0].pipeline.tokenizer_2)[index]
        aliases = re.findall(r"igs_ti_private_\d+(?![\d_])", seen.pairs[0].inputs.prompts[0])
        assert len(aliases) == (3 if syntax == "longest-crossing" else 2)
        ids = [
            tokenizer.convert_tokens_to_ids(aliases[-1] if row == 0 else f"{aliases[-1]}_{row}")
            for row in range(3)
        ]
        calls = [
            call
            for call in seen.encoder_calls
            if call.encoder.config.hidden_size == width and ids[0] in call.ids
        ]
        assert calls
        assert sum(call.ids.reshape(-1).tolist().count(ids[0]) for call in calls) >= (
            1 if syntax == "longest-crossing" else 2
        )


@contextmanager
def _no_native(
    native: Any,
    monkeypatch: pytest.MonkeyPatch,
    *,
    no_reads: bool = False,
    allow_model_copy: bool = False,
) -> Generator[list[str]]:
    """Observe the copy, loader, table and forward preflight boundaries.

    Tokenizer-only staging may copy a tokenizer to run real Compel preflight.
    State/dtype checks need only precede native loading. Structural/cap checks
    also prohibit model copying; read-free cases prohibit resource opens.
    """
    hits: list[str] = []

    def deny(label: str, original: Any = None) -> Any:
        def forbidden(*_args: Any, **_kwargs: Any) -> Any:
            hits.append(label)
            raise AssertionError("premature native work: " + label)

        return wraps(original)(forbidden) if original is not None else forbidden

    deepcopy = copy.deepcopy

    def contains_model(value: Any, depth: int = 0) -> bool:
        if isinstance(value, native.torch.nn.Module):
            return True
        if depth < 4 and type(value) in (tuple, list):
            return any(
                contains_model(item, depth + 1) for item in cast(tuple[Any, ...] | list[Any], value)
            )
        if depth < 4 and type(value) is dict:
            return any(
                contains_model(item, depth + 1) for item in cast(dict[Any, Any], value).values()
            )
        return False

    @wraps(deepcopy)
    def no_copy(value: Any, *args: Any, **kwargs: Any) -> Any:
        if not allow_model_copy and contains_model(value):
            deny("owned model deepcopy")()
        return deepcopy(value, *args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(copy, "deepcopy", no_copy)
        loader_type = _loader_mixin()
        patch.setattr(
            loader_type,
            "load_textual_inversion",
            deny("native TI loader", loader_type.load_textual_inversion),
        )
        for root in (
            native.pipeline.text_encoder,
            native.pipeline.text_encoder_2,
            native.pipeline.unet,
        ):
            patch.setattr(
                cast(Any, type(root)),
                "forward",
                deny("native forward", cast(Any, type(root)).forward),
            )
        patch.setattr(
            cast(Any, type(native.pipeline.vae)),
            "decode",
            deny("native decode", cast(Any, type(native.pipeline.vae)).decode),
        )
        patch.setattr(
            native.torch.nn.Embedding,
            "__init__",
            deny("embedding table construction", native.torch.nn.Embedding.__init__),
        )
        for method in ("register_forward_hook", "register_forward_pre_hook"):
            patch.setattr(
                native.torch.nn.Module,
                method,
                deny(method, getattr(native.torch.nn.Module, method)),
            )
        attention_type = cast(Any, type(_first_attention(native, native.pipeline.unet)))
        patch.setattr(
            attention_type,
            "set_processor",
            deny("attention processor install", attention_type.set_processor),
        )
        if no_reads:
            patch.setattr(os, "open", deny("resource open", os.open))
        yield hits
    assert hits == []


def _refuse(native: Any, recipe: Any, **changes: Any) -> Any:
    with pytest.raises((ValueError, DerivativeError)) as caught:
        _call(native, recipe, **changes)
    assert getattr(caught.value, "code", None) in LOCAL_CODES | DOWNSTREAM_CODES
    assert str(caught.value) and len(str(caught.value)) <= 4096
    return caught.value


@pytest.mark.parametrize(
    "overflow",
    ("repeated-vectors", "weighted-vectors", "ordinary-text", "late-negative-positive-only"),
)
def test_real_expanded_aggregate_refuses_before_any_encoder_table_or_clip(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch, overflow: str
) -> None:
    a = _save(tmp_path, cpu, 1, count=100)
    if overflow == "ordinary-text":
        recipe = _same_recipe(a, a)
        recipe["regions"][0]["positive"]["text"] = "SAME " + " ".join(["cat"] * 80)
        recipe["regions"][0]["authoredPrompts"]["positive"] = copy.deepcopy(
            recipe["regions"][0]["positive"]
        )
    elif overflow == "late-negative-positive-only":
        recipe = _with_resources(_recipe(_region(negative="SAME SAME SAME")))
        _bind(recipe, 0, "negative", a)
    else:
        text = (
            "SAME SAME SAME SAME" if overflow == "repeated-vectors" else "(SAME:1.7) SAME SAME SAME"
        )
        recipe = _with_resources(_recipe(positive=text))
        _bind(recipe, None, "positive", a)
    with _no_native(cpu, monkeypatch):
        _refuse(
            cpu,
            recipe,
            layout=LAYOUTS[1] if overflow == "late-negative-positive-only" else LAYOUTS[0],
        )


INVALID_DESCRIPTORS = (
    "missing-global-pair",
    "missing-regional-pair",
    "missing-empty-sign",
    "missing-descriptor",
    "extra-pair-key",
    "extra-descriptor-key",
    "tuple-descriptors",
    "bool-size",
    "relative-path",
    "wrong-token",
    "wrong-sign",
    "extra-descriptor",
    "unmatched-active-ref",
    "stale-inactive-ref",
    "identity-local-model",
    "identity-local-version",
    "identity-civitai-file",
    "identity-civitai-model",
    "identity-civitai-version",
    "identity-sha",
    "wrong-family",
    "wrong-kind",
    "wrong-prediction",
    "inherited-text",
    "inherited-resource",
    "absent-positive-resource",
)


@pytest.mark.parametrize("invalid", INVALID_DESCRIPTORS)
def test_late_frozen_binding_shape_identity_and_inheritance_preflight(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch, invalid: str
) -> None:
    a, b = _save(tmp_path, cpu, 1), _save(tmp_path, cpu, 2)
    recipe = _with_resources(
        _recipe(*(_region(index, positive="SAME") for index in range(3)), positive="SAME")
    )
    _bind(recipe, None, "positive", a)
    for index in range(3):
        _bind(recipe, index, "positive", b)
    last = recipe["regions"][-1]
    descriptor = last["embeddings"]["positive"][0]
    if invalid == "missing-global-pair":
        del recipe["globalEmbeddings"]
    elif invalid == "missing-regional-pair":
        del last["embeddings"]
    elif invalid == "missing-empty-sign":
        del last["embeddings"]["negative"]
    elif invalid == "missing-descriptor":
        last["embeddings"]["positive"] = []
    elif invalid == "extra-pair-key":
        last["embeddings"]["resolved"] = True
    elif invalid == "extra-descriptor-key":
        descriptor["sha256"] = descriptor["reference"]["fileSha256"]
    elif invalid == "tuple-descriptors":
        last["embeddings"]["positive"] = (descriptor,)
    elif invalid == "bool-size":
        descriptor["byteSize"] = True
    elif invalid == "relative-path":
        descriptor["managedPath"] = "relative.safetensors"
    elif invalid == "wrong-token":
        descriptor["token"] = "OTHER"
    elif invalid == "wrong-sign":
        last["embeddings"]["positive"], last["embeddings"]["negative"] = [], [descriptor]
    elif invalid == "extra-descriptor":
        last["embeddings"]["positive"].append(copy.deepcopy(a.descriptor))
    elif invalid == "unmatched-active-ref":
        last["positive"]["embeddingRefs"][0]["resource"] = copy.deepcopy(a.descriptor["reference"])
        last["authoredPrompts"]["positive"] = copy.deepcopy(last["positive"])
    elif invalid == "stale-inactive-ref":
        last["positive"]["text"] = "ordinary text"
        last["authoredPrompts"]["positive"] = copy.deepcopy(last["positive"])
    elif invalid.startswith("identity-"):
        field = {
            "local-model": "localModelId",
            "local-version": "localVersionId",
            "civitai-file": "civitaiFileId",
            "civitai-model": "civitaiModelId",
            "civitai-version": "civitaiVersionId",
            "sha": "fileSha256",
        }[invalid.removeprefix("identity-")]
        descriptor["reference"][field] = (
            99999
            if field.startswith("civitai")
            else "e" * 64
            if field == "fileSha256"
            else "different-owned-id"
        )
    elif invalid in ("wrong-family", "wrong-kind", "wrong-prediction"):
        field, value = {
            "wrong-family": ("baseModelFamily", "anima"),
            "wrong-kind": ("kind", "checkpoint"),
            "wrong-prediction": ("predictionType", "epsilon"),
        }[invalid]
        descriptor["reference"][field] = value
        last["positive"]["embeddingRefs"][0]["resource"][field] = value
        last["authoredPrompts"]["positive"] = copy.deepcopy(last["positive"])
    elif invalid.startswith("inherited-"):
        recipe["globalPrompts"]["negative"]["text"] = "SAME"
        recipe["item"]["prompts"]["negative"] = "SAME"
        _bind(recipe, None, "negative", a)
        last["negative"]["source"] = "current-canvas"
        last["negative"]["prompt"]["text"] = "OTHER" if invalid == "inherited-text" else "SAME"
        last["authoredPrompts"]["useGlobalNegativePrompt"] = True
        _bind(recipe, 2, "negative", a if invalid == "inherited-text" else b)
    elif invalid == "absent-positive-resource":
        last["positive"] = last["authoredPrompts"]["positive"] = None
    else:
        raise AssertionError(invalid)
    with _no_native(cpu, monkeypatch, no_reads=True):
        _refuse(cpu, recipe, layout=LAYOUTS[1])


def test_copied_display_and_version_names_do_not_change_resource_identity(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    a, b = _save(tmp_path, cpu, 1), _save(tmp_path, cpu, 2)
    recipe = _same_recipe(a, b)
    descriptor = recipe["regions"][0]["embeddings"]["positive"][0]
    descriptor["reference"]["displayName"] = "new display label"
    descriptor["reference"]["versionName"] = "renamed copied label"
    with _observe(cpu, monkeypatch) as seen:
        result = _call(cpu, recipe)
    _normal_result(cpu, seen, result, 2)
    _rows(cpu, seen, 1, "positive", b.tensors)


@pytest.mark.parametrize("field", ("positive_embeddings", "negative_embeddings", "loras"))
def test_parameters_never_supply_resources_to_exact_recipe(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch, field: str
) -> None:
    a = _save(tmp_path, cpu, 1)
    recipe = _same_recipe(a)
    parameters = dataclasses.replace(_arguments(cpu, recipe)["parameters"], **{field: (object(),)})
    with _no_native(cpu, monkeypatch, no_reads=True):
        _refuse(cpu, recipe, parameters=parameters)


@pytest.mark.parametrize("one_shot", (False, True))
@pytest.mark.parametrize(
    "extra", ("embedding_inputs", "managers", "aliases", "context", "plan", "callback_on_step_end")
)
def test_entry_points_have_no_external_resource_or_conditioning_override(
    cpu: Any, monkeypatch: pytest.MonkeyPatch, one_shot: bool, extra: str
) -> None:
    with _no_native(cpu, monkeypatch, no_reads=True), pytest.raises(TypeError):
        _call(cpu, _with_resources(_recipe()), one_shot=one_shot, **{extra: object()})


@pytest.mark.parametrize("resource", ("resolved-fields", "active-refs", "preloaded-ti"))
def test_plain_profiles_keep_refusing_every_resource_channel(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch, resource: str
) -> None:
    plain_profile = (
        "ordinary-canvas-static-dualclip-cuda-fp16-v1"
        if lane.device == "cuda"
        else "ordinary-canvas-static-dualclip-cpu-v1"
    )
    a = _save(tmp_path, lane, 1)
    recipe = _same_recipe(a)
    if resource != "resolved-fields":
        del recipe["globalEmbeddings"]
    if resource == "preloaded-ti":
        # A separate native source owns this setup; no borrowed fixture repair.
        with _models(lane.device) as native:
            native.pipeline.load_textual_inversion(
                a.tensors["clip_l"],
                token="preloaded",
                tokenizer=native.pipeline.tokenizer,
                text_encoder=native.pipeline.text_encoder,
                local_files_only=True,
            )
            with _no_native(native, monkeypatch):
                _refuse(native, _recipe(), profile=plain_profile)
        return
    with _no_native(lane, monkeypatch, no_reads=True):
        _refuse(lane, recipe, profile=plain_profile)


FILE_FAILURES = (
    "missing",
    "changed",
    "size",
    "symlink",
    "corrupt-header",
    "duplicate-header",
    "unpaired-count",
    "wrong-width",
    "unsupported-dtype",
    "nan-clip-l",
    "inf-clip-g",
)


@pytest.mark.parametrize("failure", FILE_FAILURES)
def test_late_file_and_native_tensor_failures_precede_table_load_and_first_clip(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    a = _save(tmp_path, cpu, 1)
    state = _vectors(cpu, 2)
    if failure == "unpaired-count":
        state["clip_g"] = state["clip_g"][:2].contiguous()
    elif failure == "wrong-width":
        state["clip_g"] = state["clip_g"][:, :1279].contiguous()
    elif failure == "unsupported-dtype":
        state = {key: value.to(dtype=cpu.torch.float64) for key, value in state.items()}
    elif failure in ("nan-clip-l", "inf-clip-g"):
        state["clip_l" if failure == "nan-clip-l" else "clip_g"][1, 17] = (
            float("nan") if failure == "nan-clip-l" else float("inf")
        )
    b = _save(tmp_path, cpu, 2, tensors=state)
    if failure == "missing":
        b.path.unlink()
    elif failure == "changed":
        data = bytearray(b.path.read_bytes())
        data[-1] ^= 1
        b.path.write_bytes(data)
    elif failure == "size":
        b.descriptor["byteSize"] += 1
    elif failure == "symlink":
        target = tmp_path / "real-target.safetensors"
        b.path.rename(target)
        b.path.symlink_to(target)
    elif failure in ("corrupt-header", "duplicate-header"):
        if failure == "corrupt-header":
            data = (2**63).to_bytes(8, "little") + b"broken"
        else:
            item = '{"dtype":"F32","shape":[1,768],"data_offsets":[0,3072]}'
            header = ('{"clip_l":' + item + ',"clip_l":' + item + "}").encode()
            data = len(header).to_bytes(8, "little") + header + bytes(3072)
        b.path.write_bytes(data)
        b.descriptor = _resource(b.path, "SAME", data, 2)
    recipe = _same_recipe(a, b)
    # The malformed file is late and negative, even when only positive output is used.
    recipe["regions"][0]["positive"] = copy.deepcopy(recipe["globalPrompts"]["positive"])
    _bind(recipe, 0, "positive", a)
    recipe["regions"][0]["negative"]["prompt"]["text"] = "SAME"
    _bind(recipe, 0, "negative", b)
    with _no_native(cpu, monkeypatch, allow_model_copy=True):
        error = _refuse(cpu, recipe, layout=LAYOUTS[1])
    if failure == "symlink":
        assert error.code == "INVALID_PATH"
    elif failure in ("missing", "changed", "size"):
        assert error.code == "GENERATION_INPUT_CHANGED"


@pytest.mark.parametrize("dtype", ("float16", "bfloat16", "float32"))
@pytest.mark.parametrize("rank", (1, 2))
def test_real_native_singleton_storage_formats(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch, dtype: str, rank: int
) -> None:
    state = _vectors(cpu, 1, 1, dtype=getattr(cpu.torch, dtype))
    if rank == 1:
        state = {key: value.squeeze(0) for key, value in state.items()}
    a = _save(tmp_path, cpu, 1, tensors=state)
    expected = _oracle(cpu, "oracle_a", "blur", ("oracle_a", state))
    with _observe(cpu, monkeypatch) as seen:
        result = _call(cpu, _same_recipe(a))
    _normal_result(cpu, seen, result, 2)
    _rows(cpu, seen, 0, "positive", state)
    _consumption(cpu, seen, (expected,))


@pytest.mark.parametrize("encoder", ("clip_l", "clip_g"))
def test_both_encoder_dtype_overflows_refuse_before_first_native_load(
    tmp_path: Path, cuda: Any, monkeypatch: pytest.MonkeyPatch, encoder: str
) -> None:
    a = _save(tmp_path, cuda, 1)
    state = _vectors(cuda, 2)
    state[encoder][2, 15] = 70_000.0  # F32 finite, FP16 nonfinite.
    b = _save(tmp_path, cuda, 2, tensors=state)
    recipe = _same_recipe(a, b)
    with _no_native(cuda, monkeypatch, allow_model_copy=True):
        _refuse(cuda, recipe)


def test_verified_bytes_read_once_and_native_loader_never_reopens_managed_paths(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    a = _save(tmp_path, cpu, 1)
    recipe = _same_recipe(a, a)
    recipe["globalPrompts"]["negative"]["text"] = recipe["item"]["prompts"]["negative"] = "SAME"
    _bind(recipe, None, "negative", a)
    safetensors = pytest.importorskip("safetensors.torch")
    original = safetensors.load
    calls: list[str] = []

    @wraps(original)
    def consume_snapshot(data: bytes) -> Any:
        assert type(data) is bytes
        calls.append(hashlib.sha256(data).hexdigest())
        result = original(data)
        a.path.write_bytes(b"path changed after exact byte snapshot")
        return result

    opened: list[Any] = []
    open_original = os.open

    @wraps(open_original)
    def opened_path(path: Any, flags: int, *args: Any, **kwargs: Any) -> Any:
        if Path(path) == a.path:
            opened.append(flags)
        return open_original(path, flags, *args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(safetensors, "load", consume_snapshot)
        patch.setattr(os, "open", opened_path)
        with _observe(cpu, patch) as seen:
            result = _call(cpu, recipe)
    _normal_result(cpu, seen, result, 2)
    assert calls == [a.descriptor["reference"]["fileSha256"]]
    assert len(opened) == 1
    _rows(cpu, seen, 0, "positive", a.tensors)
    _rows(cpu, seen, 0, "negative", a.tensors)
    _rows(cpu, seen, 1, "positive", a.tensors)
    # A second call verifies bytes anew, rather than reuse a global cache.
    with _no_native(cpu, monkeypatch):
        error = _refuse(cpu, recipe)
    assert error.code == "GENERATION_INPUT_CHANGED"


@pytest.mark.parametrize(
    "budget", ("descriptors-inherited-duplicates", "unique-file-bytes", "binding-vectors-per-sign")
)
def test_binding_count_and_byte_caps_precede_owned_model_mutation(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch, budget: str
) -> None:
    if budget == "descriptors-inherited-duplicates":
        resources = [_save(tmp_path, cpu, index + 1, token=f"NEG_{index}") for index in range(5)]
        text = " ".join(resource.descriptor["token"] for resource in resources)
        recipe = _with_resources(
            _recipe(
                *(
                    _region(index, positive=None, negative=text, inherited=True)
                    for index in range(3)
                ),
                negative=text,
            )
        )
        _bind(recipe, None, "negative", *resources)
        for index in range(3):
            _bind(recipe, index, "negative", *resources)
        # Five unique bindings, twenty active descriptors including inheritance.
        assert (
            sum(
                len(pair["negative"])
                for pair in [
                    recipe["globalEmbeddings"],
                    *(region["embeddings"] for region in recipe["regions"]),
                ]
            )
            == 20
        )
    elif budget == "unique-file-bytes":
        resources = [_save(tmp_path, cpu, index + 1, token=f"TI_{index}") for index in range(3)]
        for resource in resources:
            resource.descriptor["byteSize"] = 23 * MIB
        recipe = _with_resources(_recipe(positive="TI_0 TI_1 TI_2"))
        _bind(recipe, None, "positive", *resources)
    else:
        a, b = _save(tmp_path, cpu, 1, count=151), _save(tmp_path, cpu, 2, count=150)
        recipe = _same_recipe(a, b)
    with _no_native(cpu, monkeypatch, no_reads=budget != "binding-vectors-per-sign"):
        error = _refuse(cpu, recipe)
    assert error.code in {"LIMIT", "GENERATION_EMBEDDING_UNSUPPORTED"}


def test_exact_vector_boundaries_allow_300_per_sign_600_total(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    a = _save(tmp_path, cpu, 1, count=300)
    recipe = _same_recipe(a)
    recipe["globalPrompts"]["negative"]["text"] = recipe["item"]["prompts"]["negative"] = "SAME"
    _bind(recipe, None, "negative", a)
    expected = _oracle(
        cpu, "oracle_a", "oracle_n", ("oracle_a", a.tensors), ("oracle_n", a.tensors)
    )
    assert expected.positive_length == expected.negative_length == 308
    with _observe(cpu, monkeypatch) as seen:
        result = _call(cpu, recipe, steps=1)
    _normal_result(cpu, seen, result, 1)
    _rows(cpu, seen, 0, "positive", a.tensors)
    _rows(cpu, seen, 0, "negative", a.tensors)
    _consumption(cpu, seen, (expected,))


def test_exact_16_descriptors_including_inherited_duplicates_are_accepted(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    a, b, c, d = (
        _save(tmp_path, cpu, index, token=token)
        for index, token in enumerate(("P0", "P1", "N0", "N1"), start=1)
    )
    recipe = _with_resources(
        _recipe(
            *(
                _region(index, positive="P0 P1", negative="N0 N1", inherited=True)
                for index in range(3)
            ),
            positive="P0 P1",
            negative="N0 N1",
        )
    )
    _bind(recipe, None, "positive", a, b)
    _bind(recipe, None, "negative", c, d)
    for index in range(3):
        _bind(recipe, index, "positive", a, b)
        _bind(recipe, index, "negative", c, d)
    expected = _oracle(
        cpu,
        "oracle_a oracle_b",
        "oracle_c oracle_d",
        ("oracle_a", a.tensors),
        ("oracle_b", b.tensors),
        ("oracle_c", c.tensors),
        ("oracle_d", d.tensors),
    )
    with _observe(cpu, monkeypatch) as seen:
        result = _call(cpu, recipe, steps=1)
    _normal_result(cpu, seen, result, 1)
    assert len(seen.pairs) == 4
    _consumption(cpu, seen, (expected,) * 4)


def test_actual_all_masked_support_refuses_before_clip_copy_or_table_load(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    a, b = _save(tmp_path, cpu, 1), _save(tmp_path, cpu, 2)
    with (
        _no_native(cpu, monkeypatch),
        pytest.raises(cpu.adapter.IllustriousRegionalAdapterError) as caught,
    ):
        _call(cpu, _same_recipe(a, b), global_positive_coverage=Alpha8(Shape(2, 3), bytes(6)))
    assert caught.value.code == "ALL_MASKED"


@pytest.mark.parametrize(
    "budget", ("copy-payload", "replacement-table-scratch", "tokenizer-state", "alias-candidates")
)
def test_complete_copy_growth_scratch_tokenizer_and_alias_caps(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, budget: str
) -> None:
    extras = (
        ((), tuple(f"igs_ti_private_{index}" for index in range(4096)))
        if budget == "alias-candidates"
        else ((), ())
    )
    with _models("cpu", extra_vocab=extras) as native:
        a = _save(tmp_path, native, 1)
        if budget in ("copy-payload", "replacement-table-scratch"):
            roots = (native.pipeline.text_encoder, native.pipeline.text_encoder_2)
            original_bytes = sum(
                value.numel() * value.element_size()
                for root in roots
                for module in root.modules()
                for mapping in (module._parameters, module._buffers)
                for value in mapping.values()
                if value is not None
            )
            target = 513 * MIB if budget == "copy-payload" else 511 * MIB
            elements = (target - original_bytes) // 4 + 1
            # Actual contiguous storage reaches the budget after storage checks.
            # The 511 MiB case fits payload alone and fails only once alias
            # growth + largest replacement-table scratch count.
            native.pipeline.text_encoder.register_buffer(
                "test_copy_bound", native.torch.zeros(elements), persistent=False
            )
        elif budget == "tokenizer-state":
            normalizers = importlib.import_module("tokenizers.normalizers")
            backend = native.pipeline.tokenizer_2.backend_tokenizer
            backend.normalizer = normalizers.Sequence(
                [backend.normalizer, normalizers.Replace("x" * (8 * MIB + 1), "")]
            )
        recipe = _same_recipe(a)
        # Do not snapshot/clone the deliberate huge contiguous test buffer.
        finite = native.torch.isfinite

        @wraps(finite)
        def bounded_finite(value: Any) -> Any:
            assert value.numel() * value.element_size() <= 64 * MIB, (
                "copy cap must precede huge finite-check scratch"
            )
            return finite(value)

        with monkeypatch.context() as patch:
            patch.setattr(native.torch, "isfinite", bounded_finite)
            with _no_native(native, patch), pytest.raises((ValueError, DerivativeError)) as caught:
                args = _arguments(native, recipe)
                native.denoising.run_current_canvas_regional_denoising(
                    recipe, **args, denoising_profile=CPU_EXECUTION
                )
        if budget == "alias-candidates":
            assert getattr(caught.value, "code", None) == "GENERATION_EMBEDDING_UNSUPPORTED"
            assert str(caught.value) == "Embedding alias planning exceeded its candidate budget."
        else:
            assert getattr(caught.value, "code", None) == "LIMIT"


HOOK_AND_SHADOW_CASES = (
    "clip-pre-hook",
    "clip-post-hook",
    "unet-hook",
    "vae-hook",
    "adapter",
    "preloaded-ti",
    "encoder-deepcopy",
    "tokenizer-deepcopy",
    "encoder-reduce",
    "tokenizer-getstate",
    "global-forward-pre",
    "global-forward-post",
    "global-parameter",
    "global-module",
    "global-buffer",
)


@pytest.mark.parametrize("unsupported", HOOK_AND_SHADOW_CASES)
def test_source_hooks_copy_shadows_adapters_and_global_registration_refuse_before_setup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, unsupported: str
) -> None:
    with _models("cpu") as native:
        a = _save(tmp_path, native, 1)
        called: list[str] = []
        handles: list[Any] = []

        def callback(*_args: Any, **_kwargs: Any) -> Any:
            called.append(unsupported)
            raise AssertionError("unsupported source callback was executed")

        try:
            with monkeypatch.context() as patch:
                if unsupported in ("clip-pre-hook", "clip-post-hook", "unet-hook", "vae-hook"):
                    root = (
                        native.pipeline.text_encoder
                        if unsupported.startswith("clip")
                        else native.pipeline.unet
                        if unsupported == "unet-hook"
                        else native.pipeline.vae
                    )
                    method = (
                        root.register_forward_pre_hook
                        if unsupported == "clip-pre-hook"
                        else root.register_forward_hook
                    )
                    handles.append(method(callback))
                elif unsupported == "adapter":
                    patch.setattr(
                        native.pipeline.text_encoder, "_hf_peft_config_loaded", True, raising=False
                    )
                elif unsupported == "preloaded-ti":
                    native.pipeline.load_textual_inversion(
                        a.tensors["clip_g"],
                        token="preloaded",
                        tokenizer=native.pipeline.tokenizer_2,
                        text_encoder=native.pipeline.text_encoder_2,
                        local_files_only=True,
                    )
                elif unsupported in (
                    "encoder-deepcopy",
                    "tokenizer-deepcopy",
                    "encoder-reduce",
                    "tokenizer-getstate",
                ):
                    root = (
                        native.pipeline.tokenizer
                        if unsupported.startswith("tokenizer")
                        else native.pipeline.text_encoder
                    )
                    slot = (
                        "__deepcopy__"
                        if unsupported.endswith("deepcopy")
                        else "__reduce_ex__"
                        if unsupported == "encoder-reduce"
                        else "__getstate__"
                    )
                    patch.setattr(root, slot, callback, raising=False)
                else:
                    module = importlib.import_module("torch.nn.modules.module")
                    method = {
                        "global-forward-pre": "register_module_forward_pre_hook",
                        "global-forward-post": "register_module_forward_hook",
                        "global-parameter": "register_module_parameter_registration_hook",
                        "global-module": "register_module_module_registration_hook",
                        "global-buffer": "register_module_buffer_registration_hook",
                    }[unsupported]
                    handles.append(getattr(module, method)(callback))
                with _no_native(native, patch, no_reads=True):
                    _refuse(native, _same_recipe(a))
        finally:
            for handle in handles:
                handle.remove()
        assert called == []


@pytest.mark.parametrize(
    "decoder_case",
    ("arbitrary-shadow", "native-code-foreign-backend", "native-code-wrong-suffix"),
)
def test_tokenizer_backend_decode_refuses_foreign_state_and_recovers(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch, decoder_case: str
) -> None:
    a = _save(tmp_path, cpu, 1)
    recipe = _same_recipe(a)
    backend = cpu.pipeline.tokenizer.backend_tokenizer
    original, original_builtin, original_suffix = _decoder_binding(backend)
    foreign_backend = cpu.pipeline.tokenizer_2.backend_tokenizer
    assert foreign_backend is not backend
    foreign_builtin = _decoder_binding(foreign_backend)[1]
    called: list[str] = []

    def arbitrary(*_args: Any, **_kwargs: Any) -> Any:
        called.append(decoder_case)
        raise AssertionError("custom backend decoder must not execute")

    replacement: Any
    if decoder_case == "arbitrary-shadow":
        replacement = arbitrary
    else:
        assert original.__closure__ is not None
        cells: list[CellType] = []
        for cell in original.__closure__:
            value = cell.cell_contents
            if decoder_case == "native-code-foreign-backend" and type(value) is BuiltinMethodType:
                value = foreign_builtin
            elif decoder_case == "native-code-wrong-suffix" and type(value) is str:
                value = "</bad>"
            cells.append(CellType(value))
        replacement = FunctionType(
            original.__code__,
            original.__globals__,
            original.__name__,
            original.__defaults__,
            tuple(cells),
        )
        assert replacement.__code__ is original.__code__
        assert replacement.__globals__ is original.__globals__

    with _preserved(cpu):
        with monkeypatch.context() as patch:
            patch.setattr(backend, "decode", replacement)
            with _no_native(cpu, patch, no_reads=True):
                error = _refuse(cpu, recipe)
            assert error.code == "PROFILE_INVALID"
            assert backend.decode is replacement
        callback, builtin, suffix = _decoder_binding(backend)
        assert callback is original and builtin is original_builtin
        assert builtin.__self__ is backend and suffix == original_suffix == "</w>"
        with _observe(cpu, monkeypatch) as recovered:
            result = _call(cpu, recipe)
        _normal_result(cpu, recovered, result, 2)
        _rows(cpu, recovered, 0, "positive", a.tensors)
    assert called == []


@pytest.mark.parametrize("state", ("unused-parameter", "nonpersistent-buffer"))
def test_all_source_state_finiteness_precedes_owned_copy(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch, state: str
) -> None:
    a = _save(tmp_path, cpu, 1)
    encoder = cpu.pipeline.text_encoder_2
    with _preserved(cpu):
        if state == "unused-parameter":
            tensor = encoder.text_projection.weight
            prior = tensor[0, 0].detach().clone()
            tensor[0, 0] = float("nan")
        else:
            tensor, prior = None, None
            encoder.register_buffer(
                "test_nonpersistent_nan", cpu.torch.tensor([float("nan")]), persistent=False
            )
        try:
            with (
                _no_native(cpu, monkeypatch, allow_model_copy=True),
                pytest.raises((ValueError, DerivativeError)) as caught,
            ):
                args = _arguments(cpu, _same_recipe(a))
                cpu.denoising.run_current_canvas_regional_denoising(
                    _same_recipe(a), **args, denoising_profile=CPU_EXECUTION
                )
            assert getattr(caught.value, "code", None) in LOCAL_CODES
        finally:
            if tensor is not None:
                tensor[0, 0] = prior
            else:
                delattr(encoder, "test_nonpersistent_nan")


def test_registered_nonpersistent_integer_and_bool_buffers_keep_storage_identity(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    with _models("cpu") as native:
        native.pipeline.text_encoder.register_buffer(
            "test_nonpersistent_integer", native.torch.arange(5), persistent=False
        )
        native.pipeline.text_encoder_2.register_buffer(
            "test_nonpersistent_bool", native.torch.tensor([True, False]), persistent=False
        )
        a = _save(tmp_path, native, 1)
        with _observe(native, monkeypatch) as seen:
            result = _call(native, _same_recipe(a))
        _normal_result(native, seen, result, 2)
        _rows(native, seen, 0, "positive", a.tensors)


FAILURE_POINTS = (
    "after-first-clip-load",
    "later-pair-encoding",
    "second-unet",
    "second-euler",
    "vae-decode",
)


@pytest.mark.parametrize("failure", FAILURE_POINTS)
def test_actual_partial_native_failure_restores_source_storage_rng_and_fresh_call(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    a, b = _save(tmp_path, lane, 1), _save(tmp_path, lane, 2)
    recipe = _same_recipe(a, b)
    sentinel = DerivativeError(
        "GENERATION_EMBEDDING_UNSUPPORTED", "authored failure after real native work: " + failure
    )
    calls: list[Any] = []
    if failure == "after-first-clip-load":
        cls, method, threshold = _loader_mixin(), "load_textual_inversion", 1
    elif failure == "later-pair-encoding":
        cls, method, threshold = cast(Any, type(lane.pipeline.text_encoder_2)), "forward", 1
    elif failure == "second-unet":
        cls, method, threshold = cast(Any, type(lane.pipeline.unet)), "forward", 2
    elif failure == "second-euler":
        cls, method, threshold = lane.diffusers.EulerDiscreteScheduler, "step", 2
    else:
        cls, method, threshold = cast(Any, type(lane.pipeline.vae)), "decode", 1
    original = getattr(cls, method)

    @wraps(original)
    def fail_after_original(current: Any, *args: Any, **kwargs: Any) -> Any:
        selected = True
        if failure == "later-pair-encoding":
            bound = inspect.signature(original).bind(current, *args, **kwargs)
            ids = bound.arguments["input_ids"]
            expected = b.tensors["clip_g"][0].to(device=current.device, dtype=current.dtype)
            selected = bool(
                (current.get_input_embeddings().weight[ids] == expected).all(dim=-1).any().item()
            )
        result = original(current, *args, **kwargs)
        if not selected:
            return result
        calls.append(current)
        if len(calls) == threshold:
            if failure == "after-first-clip-load":
                assert kwargs["text_encoder"] is not lane.pipeline.text_encoder
                assert (
                    kwargs["text_encoder"].get_input_embeddings().weight.shape[0]
                    > lane.pipeline.text_encoder.get_input_embeddings().weight.shape[0]
                )
            raise sentinel
        return result

    with monkeypatch.context() as patch:
        patch.setattr(cls, method, fail_after_original)
        with pytest.raises(DerivativeError) as caught:
            _call(lane, recipe)
    if failure == "after-first-clip-load":
        assert caught.value.code == "GENERATION_EMBEDDING_UNSUPPORTED"
        assert caught.value.__cause__ is sentinel
    else:
        assert caught.value is sentinel
    assert len(calls) == threshold
    # Retain the failure/traceback while checking restored borrowed state and
    # successful recovery. No allocator reclamation or empty_cache is promised.
    with _observe(lane, monkeypatch) as recovered:
        result = _call(lane, recipe)
    _normal_result(lane, recovered, result, 2)
    _rows(lane, recovered, 1, "positive", b.tensors)
    assert caught.value.__traceback__ is not None


def test_disjoint_ti_calls_cannot_overlap_global_rng_fork_restoration(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    a = _save(tmp_path, cpu, 1)
    first_entered, release = threading.Event(), threading.Event()
    result: list[Any] = []
    failures: list[BaseException] = []
    with _models("cpu") as other:
        first_recipe, second_recipe = _same_recipe(a), _same_recipe(a)
        loader_type = _loader_mixin()
        original = loader_type.load_textual_inversion

        @wraps(original)
        def pause_first(current: Any, *args: Any, **kwargs: Any) -> Any:
            value = original(current, *args, **kwargs)
            if (
                threading.current_thread().name == "regional-ti-rng-owner"
                and not first_entered.is_set()
            ):
                first_entered.set()
                if not release.wait(15):
                    raise AssertionError("test did not release first native TI call")
            return value

        def worker() -> None:
            try:
                with cpu.torch.no_grad():
                    result.append(_call(cpu, first_recipe))
            except BaseException as error:
                failures.append(error)

        with monkeypatch.context() as patch, _preserved(cpu), _preserved(other):
            patch.setattr(loader_type, "load_textual_inversion", pause_first)
            thread = threading.Thread(target=worker, name="regional-ti-rng-owner", daemon=True)
            thread.start()
            try:
                assert first_entered.wait(15), "first call never reached real native loading"
                started = time.monotonic()
                error = _refuse(other, second_recipe)
                assert error.code == "SCOPE_CONFLICT"
                assert time.monotonic() - started < 2, "RNG exclusion must refuse without waiting"
            finally:
                release.set()
                thread.join(20)
                assert not thread.is_alive(), "authored worker must physically finish"
        assert failures == [] and len(result) == 1
        _call(other, second_recipe)


def test_cpu_exact_ti_has_no_cuda_prerequisite(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    a = _save(tmp_path, cpu, 1)

    def no_cuda_probe(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("CPU profile required CUDA availability")

    with monkeypatch.context() as patch:
        patch.setattr(cpu.torch.cuda, "is_available", no_cuda_probe)
        result = _call(cpu, _same_recipe(a))
    assert result.images.device.type == "cpu"


@pytest.mark.parametrize("invalid", ("automatic-vae", "force-upcast", "crossed-device-lane"))
def test_cuda_manual_vae_and_matching_execution_lane_required(
    tmp_path: Path, cuda: Any, monkeypatch: pytest.MonkeyPatch, invalid: str
) -> None:
    a = _save(tmp_path, cuda, 1)
    recipe = _same_recipe(a)
    args = _arguments(cuda, recipe)
    execution = CUDA_EXECUTION
    prior = cuda.pipeline.vae.config
    with monkeypatch.context() as patch:
        if invalid == "automatic-vae":
            args["parameters"] = dataclasses.replace(args["parameters"], vae_precision="Auto")
        elif invalid == "force-upcast":
            cuda.pipeline.vae.register_to_config(force_upcast=True)
        else:
            execution = CPU_EXECUTION
        try:
            with (
                _no_native(cuda, patch, no_reads=True),
                _preserved(cuda),
                pytest.raises((ValueError, DerivativeError)) as caught,
            ):
                cuda.denoising.run_current_canvas_regional_denoising(
                    recipe, **args, denoising_profile=execution
                )
            assert getattr(caught.value, "code", None) in {"PROFILE_INVALID", "UNSUPPORTED"}
        finally:
            if invalid == "force-upcast":
                cuda.pipeline.vae._internal_dict = prior
