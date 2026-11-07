"""Private Anima regional positives through genuine Main and original native owners.

The fixed small architecture keeps full tokenizer vocabularies and original
latent topology. It qualifies mechanics, not trained weights or visual quality.
Observers call original classes/attention/decoder and inspect the published PNG
before asserting regional association, so a valid association mutation executes.
"""

from __future__ import annotations

import copy
import hashlib
import importlib
import json
import math
import os
import stat
import subprocess
from collections.abc import Callable, Generator, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field, replace
from functools import wraps
from pathlib import Path
from typing import Any, Literal, cast
from uuid import uuid4

import pytest
from PIL import Image

from imagegen_worker import anima_regional as regional
from imagegen_worker.anima_conditioning import (
    encode_anima_conditioning_pair,
    encode_anima_prompt,
    validate_compiled_anima_prompt,
)
from imagegen_worker.anima_euler import predict_anima_flow
from imagegen_worker.anima_flow_sampling import (
    generate_anima_flow_sampling,
    validate_anima_flow_sampling_plan,
)
from imagegen_worker.compositor import PreviewRect
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.inference import MLRuntime
from imagegen_worker.inference_anima import AnimaModelBundle, AnimaModelFile, LoadedAnimaModels
from imagegen_worker.protocol import (
    GenerateAnimaImg2ImgCommand,
    GenerateAnimaTxt2ImgCommand,
    GenerationLora,
)

_ROOT = Path(__file__).resolve().parents[2]
_Profile = Literal["cpu-float32-v1", "cuda-bfloat16-v1"]
_Producer = Callable[..., dict[str, Any]]


def _sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _tensor_bytes(value: Any) -> bytes:
    torch = importlib.import_module("torch")
    return value.detach().cpu().contiguous().view(-1).view(torch.uint8).numpy().tobytes()


@dataclass
class _Native:
    torch: Any
    diffusers: Any
    models: LoadedAnimaModels
    tokenizers: Any
    oracle_tokenizers: Any
    profile: _Profile
    device: str
    dtype: Any

    @property
    def runtime(self) -> MLRuntime:
        # Compel is irrelevant to Anima; the prepared runtime field is not used.
        return MLRuntime(self.torch, self.diffusers, cast(Any, None))


@pytest.fixture(scope="module")
def native_factory() -> Iterator[Callable[[str], _Native]]:
    torch = pytest.importorskip("torch")
    diffusers = pytest.importorskip("diffusers")
    transformers = pytest.importorskip("transformers")
    pytest.importorskip("torchvision")
    from imagegen_worker.anima_tokenizers import load_anima_tokenizers

    cache: dict[str, _Native] = {}

    def get(lane: str) -> _Native:
        if lane in cache:
            return cache[lane]
        device = "cuda:0" if lane == "cuda-bfloat16" else "cpu"
        if device != "cpu" and (
            not torch.cuda.is_available()
            or not torch.cuda.is_bf16_supported(including_emulation=False)
        ):
            pytest.skip("This explicit native Anima lane requires CUDA BF16; there is no fallback.")
        dtype = torch.bfloat16 if device != "cpu" else torch.float32
        devices = [0] if device != "cpu" else []
        with torch.random.fork_rng(devices=devices):
            torch.manual_seed(61429)
            encoder = transformers.Qwen3Model(
                transformers.Qwen3Config(
                    vocab_size=151936,
                    hidden_size=32,
                    intermediate_size=64,
                    num_hidden_layers=1,
                    num_attention_heads=2,
                    num_key_value_heads=1,
                    head_dim=16,
                    max_position_embeddings=8192,
                )
            ).eval()
            conditioner = diffusers.AnimaTextConditioner(
                source_dim=32,
                target_dim=32,
                model_dim=32,
                num_layers=1,
                num_attention_heads=2,
                target_vocab_size=32128,
                min_sequence_length=512,
            ).eval()
            transformer = diffusers.CosmosTransformer3DModel(
                in_channels=16,
                out_channels=16,
                num_attention_heads=2,
                attention_head_dim=16,
                num_layers=3,
                text_embed_dim=32,
                adaln_lora_dim=8,
                max_size=(1, 256, 256),
                patch_size=(1, 2, 2),
                concat_padding_mask=True,
                extra_pos_embed_type=None,
                use_crossattn_projection=False,
            ).eval()
            vae = diffusers.AutoencoderKLWan(base_dim=4, z_dim=16).eval()
            models = LoadedAnimaModels(transformer, conditioner, encoder, vae)
            for model in (transformer, conditioner, encoder, vae):
                model.to(device=device, dtype=dtype)
        result = _Native(
            torch,
            diffusers,
            models,
            load_anima_tokenizers(),
            load_anima_tokenizers(),
            "cuda-bfloat16-v1" if device != "cpu" else "cpu-float32-v1",
            device,
            dtype,
        )
        cache[lane] = result
        return result

    yield get
    cache.clear()


@pytest.fixture(scope="module", params=["cpu-float32", "cuda-bfloat16"])
def native(request: pytest.FixtureRequest, native_factory: Callable[[str], _Native]) -> _Native:
    return native_factory(str(request.param))


@pytest.fixture(scope="module")
def cpu_native(native_factory: Callable[[str], _Native]) -> _Native:
    return native_factory("cpu-float32")


@pytest.fixture(scope="module")
def main_inputs(tmp_path_factory: pytest.TempPathFactory) -> _Producer:
    cache: dict[str, dict[str, Any]] = {}

    def produce(variant: str = "base", **changes: Any) -> dict[str, Any]:
        options = {"variant": variant, "seed": 123, "width": 104, "height": 72, **changes}
        key = json.dumps(options, sort_keys=True)
        if key not in cache:
            root = tmp_path_factory.mktemp(f"anima-main-{variant}")
            program = (
                "import {produceAnimaRegionalInputFixture as produce} from "
                "'./src/main/projects/test-fixtures/anima-regional-input.ts';"
                "void (async()=>{const value=await produce("
                + json.dumps(str(root))
                + ","
                + json.dumps(options)
                + ");process.stdout.write(JSON.stringify(value));})()"
                ".catch((error)=>{console.error(error);process.exitCode=1;});"
            )
            encoded = subprocess.check_output(
                [str(_ROOT / "node_modules/.bin/tsx"), "-e", program], cwd=_ROOT, text=True
            )
            value = cast(dict[str, Any], json.loads(encoded))
            assert value["recipe"]["family"] == "anima"
            assert value["recipe"]["kind"] == "current-canvas-regional-recipe"
            assert value["sampling"]["scheduler"] == "euler"
            assert value["sampling"]["seed"] == options["seed"]
            (root / "python-handoff.json").write_text(encoded)
            cache[key] = value
        return copy.deepcopy(cache[key])

    return produce


@dataclass
class _Call:
    handoff: dict[str, Any]
    command: GenerateAnimaTxt2ImgCommand
    target_bytes: bytes


def _command(root: Path, handoff: dict[str, Any], *, alpha: int = 0) -> _Call:
    root.mkdir(mode=0o700, parents=True, exist_ok=False)
    bbox = cast(PreviewRect, copy.deepcopy(handoff["recipe"]["bbox"]))
    target = root / "target.png"
    Image.new("RGBA", (bbox["width"], bbox["height"]), (17, 53, 91, alpha)).save(
        target, format="PNG", icc_profile=SRGB_ICC_PROFILE
    )
    target_bytes = target.read_bytes()
    # Loaded models are an explicit caller precondition. These named setup bytes
    # are not trained weights and this test does not run/attest the loader.
    placeholder = root / "prepared-model-source.fixture"
    placeholder.write_bytes(b"prepared-small-native-Anima-fixture")
    model_file = AnimaModelFile(
        placeholder, _sha(placeholder.read_bytes()), placeholder.stat().st_size
    )
    records = handoff["compiledPrompts"]
    command = GenerateAnimaTxt2ImgCommand(
        bundle=AnimaModelBundle(model_file, model_file, model_file),
        positive_prompt=validate_compiled_anima_prompt(records[0]["prompt"]),
        negative_prompt=validate_compiled_anima_prompt(records[1]["prompt"]),
        sampling=validate_anima_flow_sampling_plan(handoff["sampling"]),
        loras=(),
        request_id=str(uuid4()),
        target_path=target,
        target_sha256=_sha(target_bytes),
        target_byte_size=len(target_bytes),
        width=bbox["width"],
        height=bbox["height"],
        bbox=bbox,
        staging_root=root,
        output_path=root / "output.png",
    )
    return _Call(handoff, command, target_bytes)


def _execute(call: _Call, native: _Native, **changes: Any) -> dict[str, object]:
    arguments: dict[str, Any] = {
        "command": call.command,
        "compiled_prompts": call.handoff["compiledPrompts"],
        "models": native.models,
        "runtime": native.runtime,
        "profile": native.profile,
        "tokenizers": native.tokenizers,
        **changes,
    }
    return regional.generate_current_canvas_regional_anima_txt2img(
        call.handoff["recipe"], **arguments
    )


def _modules(models: LoadedAnimaModels) -> Iterator[tuple[str, Any]]:
    for prefix in ("transformer", "text_conditioner", "qwen3_encoder", "vae"):
        for name, module in getattr(models, prefix).named_modules():
            yield f"{prefix}.{name}", module


@contextmanager
def _preserved(native: _Native) -> Generator[None]:
    torch = native.torch
    metadata: list[tuple[str, Any, dict[str, Any]]] = []
    tensors: list[tuple[str, Any, Any, tuple[Any, ...]]] = []
    for name, module in _modules(native.models):
        metadata.append(
            (
                name,
                module,
                {
                    "keys": set(cast(dict[str, Any], vars(module))),
                    "training": module.training,
                    "children": tuple((key, id(value)) for key, value in module._modules.items()),
                    "parameters": tuple(
                        (key, id(value)) for key, value in module._parameters.items()
                    ),
                    "buffers": tuple((key, id(value)) for key, value in module._buffers.items()),
                    "hooks": tuple(
                        (
                            key,
                            id(cast(dict[str, Any], value)),
                            tuple(cast(dict[str, Any], value).items()),
                        )
                        for key, value in cast(dict[str, Any], vars(module)).items()
                        if key.startswith(("_forward_", "_backward_")) and isinstance(value, dict)
                    ),
                    "processor": getattr(module, "processor", None),
                },
            )
        )
        for kind, registrations in (("parameter", module._parameters), ("buffer", module._buffers)):
            for key, value in registrations.items():
                if value is not None:
                    state = (
                        id(value),
                        value.untyped_storage().data_ptr(),
                        tuple(value.shape),
                        tuple(value.stride()),
                        value.dtype,
                        value.device,
                        value.requires_grad,
                    )
                    tensors.append(
                        (f"{name}.{kind}.{key}", value, value.detach().cpu().clone(), state)
                    )
    cpu_rng = torch.random.get_rng_state().clone()
    cuda_rng = torch.cuda.get_rng_state(0).clone() if native.device != "cpu" else None
    tiling = native.models.vae.use_tiling
    wan_cache_names = (
        "_conv_num",
        "_conv_idx",
        "_feat_map",
        "_enc_conv_num",
        "_enc_conv_idx",
        "_enc_feat_map",
    )
    wan_caches: dict[str, tuple[Any, Any]] = {
        name: (
            cast(dict[str, Any], vars(native.models.vae))[name],
            copy.deepcopy(cast(dict[str, Any], vars(native.models.vae))[name]),
        )
        for name in wan_cache_names
        if name in cast(dict[str, Any], vars(native.models.vae))
    }

    def configuration(key: str) -> Any:
        config = getattr(native.models, key).config
        return copy.deepcopy(config.to_dict() if hasattr(config, "to_dict") else dict(config))

    configs = {
        key: configuration(key)
        for key in ("transformer", "text_conditioner", "qwen3_encoder", "vae")
    }
    tokenizer_states: list[Any] = []
    for wrapper in (native.tokenizers.qwen3, native.tokenizers.t5):
        tokenizer_states.append(
            (
                wrapper,
                wrapper.backend_tokenizer,
                wrapper.backend_tokenizer.to_str(),
                set(cast(dict[str, Any], vars(wrapper))),
                copy.deepcopy(wrapper.init_kwargs),
                copy.deepcopy(wrapper.special_tokens_map),
                (wrapper.model_max_length, wrapper.padding_side, wrapper.truncation_side),
            )
        )
    try:
        yield
    finally:
        for name, module, expected in metadata:
            assert set(cast(dict[str, Any], vars(module))) == expected["keys"], (
                f"Module keys changed: {name}"
            )
            assert module.training == expected["training"], f"Training changed: {name}"
            for role in ("children", "parameters", "buffers"):
                registry = getattr(
                    module,
                    {"children": "_modules", "parameters": "_parameters", "buffers": "_buffers"}[
                        role
                    ],
                )
                assert (
                    tuple((key, id(value)) for key, value in registry.items()) == expected[role]
                ), name
            hooks = tuple(
                (key, id(cast(dict[str, Any], value)), tuple(cast(dict[str, Any], value).items()))
                for key, value in cast(dict[str, Any], vars(module)).items()
                if key.startswith(("_forward_", "_backward_")) and isinstance(value, dict)
            )
            assert hooks == expected["hooks"], f"Hooks changed: {name}"
            assert getattr(module, "processor", None) is expected["processor"], name
        for name, value, saved, state in tensors:
            assert (
                id(value),
                value.untyped_storage().data_ptr(),
                tuple(value.shape),
                tuple(value.stride()),
                value.dtype,
                value.device,
                value.requires_grad,
            ) == state, f"Tensor ownership changed: {name}"
            assert bool(torch.equal(value.detach().cpu(), saved)), f"Tensor values changed: {name}"
        assert native.models.vae.use_tiling == tiling
        for name in wan_cache_names:
            assert (name in cast(dict[str, Any], vars(native.models.vae))) == (name in wan_caches)
            if name in wan_caches:
                original_cache, expected_cache = wan_caches[name]
                assert cast(dict[str, Any], vars(native.models.vae))[name] is original_cache
                assert cast(dict[str, Any], vars(native.models.vae))[name] == expected_cache
        for (
            wrapper,
            backend,
            serialized,
            keys,
            options,
            specials,
            configuration_values,
        ) in tokenizer_states:
            assert wrapper.backend_tokenizer is backend
            assert wrapper.backend_tokenizer.to_str() == serialized
            assert set(cast(dict[str, Any], vars(wrapper))) == keys
            assert wrapper.init_kwargs == options and wrapper.special_tokens_map == specials
            assert (
                wrapper.model_max_length,
                wrapper.padding_side,
                wrapper.truncation_side,
            ) == configuration_values
        for key, expected in configs.items():
            assert configuration(key) == expected, key
        assert bool(torch.equal(cpu_rng, torch.random.get_rng_state()))
        if cuda_rng is not None:
            assert bool(torch.equal(cuda_rng, torch.cuda.get_rng_state(0)))


@dataclass
class _Observation:
    qwen: int = 0
    conditioner: int = 0
    passes: list[dict[str, Any]] = field(default_factory=list)
    processors: list[dict[str, Any]] = field(default_factory=list)
    dispatch: list[dict[str, Any]] = field(default_factory=list)
    sdpa: list[dict[str, Any]] = field(default_factory=list)
    decoded: list[Any] = field(default_factory=list)
    tokenizers: list[dict[str, Any]] = field(default_factory=list)


def _boolean_mask(mask: Any, torch: Any) -> Any:
    if mask is None:
        return None
    detached = mask.detach().cpu()
    if detached.dtype == torch.bool:
        return detached.clone()
    assert bool(((detached == 0) | torch.isneginf(detached)).all().item())
    return detached == 0


@contextmanager
def _observed(native: _Native, monkeypatch: pytest.MonkeyPatch) -> Generator[_Observation]:
    torch = native.torch
    models = native.models
    cosmos = importlib.import_module("diffusers.models.transformers.transformer_cosmos")
    result = _Observation()
    active: int | None = None
    attention_tag: tuple[int, str] | None = None
    sites = {
        id(getattr(block, kind)): (index, "cross" if kind == "attn2" else "self")
        for index, block in enumerate(models.transformer.transformer_blocks)
        for kind in ("attn1", "attn2")
    }
    qwen_forward: Any = cast(Any, type(models.qwen3_encoder)).forward
    conditioner_forward: Any = cast(Any, type(models.text_conditioner)).forward
    transformer_forward: Any = cast(Any, type(models.transformer)).forward
    decode: Any = cast(Any, type(models.vae)).decode
    processor_call = cosmos.CosmosAttnProcessor2_0.__call__
    dispatch = cosmos.dispatch_attention_fn
    sdpa = torch.nn.functional.scaled_dot_product_attention

    @wraps(qwen_forward)
    def qwen_spy(self: Any, *args: Any, **kwargs: Any) -> Any:
        if self is models.qwen3_encoder:
            result.qwen += 1
        return qwen_forward(self, *args, **kwargs)

    @wraps(conditioner_forward)
    def conditioner_spy(self: Any, *args: Any, **kwargs: Any) -> Any:
        if self is models.text_conditioner:
            result.conditioner += 1
        return conditioner_forward(self, *args, **kwargs)

    @wraps(transformer_forward)
    def transformer_spy(self: Any, *args: Any, **kwargs: Any) -> Any:
        nonlocal active
        if self is not models.transformer:
            return transformer_forward(self, *args, **kwargs)
        previous = active
        active = len(result.passes)
        item: dict[str, Any] = {
            "context": kwargs["encoder_hidden_states"].detach().cpu().clone(),
            "latents": kwargs["hidden_states"].detach().cpu().clone(),
            "timestep": kwargs["timestep"].detach().cpu().clone(),
        }
        result.passes.append(item)
        try:
            actual = transformer_forward(self, *args, **kwargs)
            item["prediction"] = actual.sample.detach().cpu().clone()
            return actual
        finally:
            active = previous

    @wraps(processor_call)
    def processor_spy(
        self: Any,
        attn: Any,
        hidden_states: Any,
        encoder_hidden_states: Any = None,
        attention_mask: Any = None,
        image_rotary_emb: Any = None,
    ) -> Any:
        nonlocal attention_tag
        tag = sites.get(id(attn))
        previous = attention_tag
        attention_tag = tag
        if tag is not None:
            result.processors.append(
                {
                    "pass": active,
                    "block": tag[0],
                    "kind": tag[1],
                    "mask": _boolean_mask(attention_mask, torch),
                    "keys": (
                        hidden_states.shape[1]
                        if encoder_hidden_states is None
                        else encoder_hidden_states.shape[1]
                    ),
                }
            )
        try:
            return processor_call(
                self,
                attn,
                hidden_states,
                encoder_hidden_states=encoder_hidden_states,
                attention_mask=attention_mask,
                image_rotary_emb=image_rotary_emb,
            )
        finally:
            attention_tag = previous

    @wraps(dispatch)
    def dispatch_spy(query: Any, key: Any, value: Any, *args: Any, **kwargs: Any) -> Any:
        actual = dispatch(query, key, value, *args, **kwargs)
        if attention_tag is not None:
            mask = kwargs.get("attn_mask", args[0] if args else None)
            # This independent dense sample consumes native Q/K/V after the
            # original projections/norms. It does not call the regional helper.
            q = query.detach().float()
            k = key.detach().float()
            v = value.detach().float()
            selected = sorted({0, query.shape[1] // 2, query.shape[1] - 1})
            allowed = _boolean_mask(mask, torch)
            errors: list[float] = []
            for index in selected:
                logits = torch.einsum("bhd,bkhd->bhk", q[:, index], k) / math.sqrt(q.shape[-1])
                if allowed is not None:
                    permitted = allowed[..., index, :].to(device=logits.device)
                    logits = logits.masked_fill(~permitted, -math.inf)
                expected = torch.einsum("bhk,bkhd->bhd", logits.softmax(-1), v)
                errors.append(float((actual[:, index].float() - expected).abs().max().item()))
            result.dispatch.append(
                {
                    "pass": active,
                    "block": attention_tag[0],
                    "kind": attention_tag[1],
                    "mask": allowed,
                    "queryShape": tuple(query.shape),
                    "keyShape": tuple(key.shape),
                    "maxError": max(errors),
                    "maxMagnitude": float(actual.detach().float().abs().max().item()),
                }
            )
        return actual

    @wraps(sdpa)
    def sdpa_spy(*args: Any, **kwargs: Any) -> Any:
        if attention_tag is not None:
            mask = kwargs.get("attn_mask", args[3] if len(args) > 3 else None)
            result.sdpa.append(
                {
                    "pass": active,
                    "block": attention_tag[0],
                    "kind": attention_tag[1],
                    "mask": _boolean_mask(mask, torch),
                }
            )
        return sdpa(*args, **kwargs)

    @wraps(decode)
    def decode_spy(self: Any, *args: Any, **kwargs: Any) -> Any:
        actual = decode(self, *args, **kwargs)
        if self is models.vae:
            result.decoded.append(actual.sample.detach().cpu().clone())
        return actual

    with monkeypatch.context() as patch:
        tokenizer_wrappers = (native.tokenizers.qwen3, native.tokenizers.t5)
        original_wrapper_ids = {id(wrapper) for wrapper in tokenizer_wrappers}
        original_backend_ids = {id(wrapper.backend_tokenizer) for wrapper in tokenizer_wrappers}
        for tokenizer_class in {cast(Any, type(wrapper)) for wrapper in tokenizer_wrappers}:
            original_tokenize = tokenizer_class.__call__

            def tokenizer_spy(
                self: Any, *args: Any, _original: Any = original_tokenize, **kwargs: Any
            ) -> Any:
                result.tokenizers.append(
                    {
                        "wrapperId": id(self),
                        "backendId": id(self.backend_tokenizer),
                        "borrowedWrapper": id(self) in original_wrapper_ids,
                        "borrowedBackend": id(self.backend_tokenizer) in original_backend_ids,
                    }
                )
                return _original(self, *args, **kwargs)

            patch.setattr(tokenizer_class, "__call__", tokenizer_spy)
        patch.setattr(cast(Any, type(models.qwen3_encoder)), "forward", qwen_spy)
        patch.setattr(cast(Any, type(models.text_conditioner)), "forward", conditioner_spy)
        patch.setattr(cast(Any, type(models.transformer)), "forward", transformer_spy)
        patch.setattr(cast(Any, type(models.vae)), "decode", decode_spy)
        patch.setattr(cosmos.CosmosAttnProcessor2_0, "__call__", processor_spy)
        patch.setattr(cosmos, "dispatch_attention_fn", dispatch_spy)
        patch.setattr(torch.nn.functional, "scaled_dot_product_attention", sdpa_spy)
        yield result


def _published(
    call: _Call, native: _Native, done: dict[str, object], observed: _Observation
) -> bytes:
    assert done["type"] == "generation-done" and done["protocolVersion"] == "1"
    assert done["requestId"] == call.command.request_id
    assert done["outputPath"] == str(call.command.output_path)
    assert done["seed"] == call.command.sampling.seed
    assert call.command.target_path.read_bytes() == call.target_bytes
    assert len(observed.decoded) == 1
    raw = observed.decoded[0]
    # Invoke quantizes in the decode dtype by truncating uint8, without widening.
    expected = (127.5 * (raw[0, :, 0].clamp(-1, 1) + 1)).to(dtype=native.torch.uint8)
    expected_bytes = expected.permute(1, 2, 0).contiguous().numpy().tobytes()
    with Image.open(call.command.output_path) as image:
        image.load()
        assert image.format == "PNG" and image.mode == "RGB"
        assert image.size == (call.command.width, call.command.height)
        assert image.info.get("icc_profile") == SRGB_ICC_PROFILE
        actual = image.tobytes()
    assert actual == expected_bytes, "Published RGB differs from this native decode"
    _record("published", native, call, observed, actual)
    return actual


def _emitted(handoff: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        region
        for region in handoff["recipe"]["regions"]
        if region["positive"] is not None and region["positive"]["text"] != ""
    ]


def _mask_oracle(handoff: dict[str, Any], torch: Any) -> Any:
    bbox = handoff["recipe"]["bbox"]
    height, width = bbox["height"], bbox["width"]
    grid_h, grid_w = math.ceil((height // 8) / 2), math.ceil((width // 8) / 2)
    streams = _emitted(handoff)
    rows: list[list[bool]] = []
    for y in range(grid_h):
        for x in range(grid_w):
            source = (y * height // grid_h) * width + x * width // grid_w
            eligible = [region["coverage"]["alpha"][source] >= 128 for region in streams]
            row = [not any(eligible)] * 512
            for allowed in eligible:
                row.extend([allowed] * 512)
            rows.append(row)
    return torch.tensor(rows, dtype=torch.bool).unsqueeze(0).unsqueeze(0)


def _context_oracle(handoff: dict[str, Any], native: _Native) -> tuple[Any, Any]:
    records = handoff["compiledPrompts"]
    pair = encode_anima_conditioning_pair(
        records[0]["prompt"],
        records[1]["prompt"],
        native.models,
        tokenizers=native.oracle_tokenizers,
    )
    contexts = [pair.positive.embeddings]
    emitted = {region["regionId"] for region in _emitted(handoff)}
    for record in records[2:]:
        if record["sourceId"] in emitted:
            contexts.append(
                encode_anima_prompt(
                    record["prompt"], native.models, tokenizers=native.oracle_tokenizers
                ).embeddings
            )
    assert all(value.shape[1] == 512 for value in contexts)
    return (
        native.torch.cat(contexts, dim=1).detach().cpu(),
        pair.negative.embeddings.detach().cpu(),
    )


def _native_association(
    call: _Call,
    native: _Native,
    observed: _Observation,
    contexts: tuple[Any, Any],
) -> None:
    torch = native.torch
    emitted = _emitted(call.handoff)
    expected_encodes = 2 + len(emitted)
    assert observed.qwen == observed.conditioner == expected_encodes
    # Both native tokenizers run during all-stream preflight and the actual encoding.
    # Qwen/conditioner forwards above still occur exactly once per emitted source.
    assert len(observed.tokenizers) == expected_encodes * 4
    assert all(
        not item["borrowedWrapper"] and not item["borrowedBackend"] for item in observed.tokenizers
    )
    assert len({item["backendId"] for item in observed.tokenizers}) == 2
    do_cfg = not math.isclose(call.command.sampling.guidance_scale, 1.0)
    signs = 2 if do_cfg else 1
    expected_passes = signs * call.command.sampling.total_steps
    assert len(observed.passes) == expected_passes
    allowed = _mask_oracle(call.handoff, torch)
    for index, item in enumerate(observed.passes):
        positive = index % signs == 0
        expected_context = contexts[0] if positive else contexts[1]
        assert bool(torch.equal(item["context"], expected_context)), (
            "Signed context/range association"
        )
        assert tuple(item["latents"].shape[-2:]) == (
            call.command.height // 8 + (call.command.height // 8) % 2,
            call.command.width // 8 + (call.command.width // 8) % 2,
        )
    expected_sites = expected_passes * 2 * len(native.models.transformer.transformer_blocks)
    assert (
        len(observed.processors) == len(observed.dispatch) == len(observed.sdpa) == expected_sites
    )
    for observations in (observed.processors, observed.dispatch, observed.sdpa):
        for item in observations:
            positive = item["pass"] % signs == 0
            masked = (
                bool(emitted) and positive and item["kind"] == "cross" and item["block"] % 2 == 0
            )
            if masked:
                assert item["mask"] is not None, "Missing positive regional permission mask"
                assert bool(torch.equal(item["mask"], allowed)), (
                    "Native regional mask/range association"
                )
            else:
                assert item["mask"] is None, "Negative, odd block or self attention was masked"
    for item in observed.dispatch:
        epsilon = float(torch.finfo(native.dtype).eps)
        assert item["maxError"] <= 4 * epsilon * (1 + item["maxMagnitude"])


def _record(
    label: str,
    native: _Native,
    call: _Call,
    observed: _Observation,
    rgb: bytes | None,
    *,
    failure: BaseException | None = None,
) -> None:
    torch = native.torch
    allowed = _mask_oracle(call.handoff, torch)
    signs = 1 if math.isclose(call.command.sampling.guidance_scale, 1.0) else 2
    emitted = _emitted(call.handoff)
    expected_masks: list[dict[str, Any]] = []
    mismatch: list[dict[str, Any]] = []
    samples = sorted({0, allowed.shape[-2] // 2, allowed.shape[-2] - 1})
    columns = sorted(
        {0, 511, allowed.shape[-1] - 1, *(512 * i for i in range(1, len(emitted) + 1))}
    )
    for item in observed.processors:
        positive = item["pass"] % signs == 0
        masked = bool(emitted) and positive and item["kind"] == "cross" and item["block"] % 2 == 0
        expected = allowed if masked else None
        actual = item["mask"]
        exact = (actual is None and expected is None) or (
            actual is not None and expected is not None and torch.equal(actual, expected)
        )
        record = {
            "pass": item["pass"],
            "role": "positive" if positive else "negative",
            "block": item["block"],
            "kind": item["kind"],
            "keys": item["keys"],
            "maskSha256": None if actual is None else _sha(_tensor_bytes(actual)),
            "expectedMaskSha256": None if expected is None else _sha(_tensor_bytes(expected)),
            "associationExact": bool(exact),
            "samples": []
            if actual is None
            else [
                {"query": query, "key": key, "allowed": bool(actual[0, 0, query, key].item())}
                for query in samples
                for key in columns
                if query < actual.shape[-2] and key < actual.shape[-1]
            ],
        }
        expected_masks.append(record)
        if not exact:
            mismatch.append({key: record[key] for key in ("pass", "role", "block", "kind")})
    source_ids = ["current-canvas", *(item["regionId"] for item in emitted)]
    value: dict[str, Any] = {
        "schema": "anima-regional-native-observation-v1",
        "label": label,
        "profile": native.profile,
        "seed": call.command.sampling.seed,
        "outputPath": str(call.command.output_path),
        "outputSha256": _sha(call.command.output_path.read_bytes())
        if call.command.output_path.exists()
        else None,
        "rgbSha256": None if rgb is None else _sha(rgb),
        "iccSha256": _sha(SRGB_ICC_PROFILE) if rgb is not None else None,
        "qwen": observed.qwen,
        "conditioner": observed.conditioner,
        "tokenizerCalls": len(observed.tokenizers),
        "borrowedTokenizerUsed": any(
            item["borrowedWrapper"] or item["borrowedBackend"] for item in observed.tokenizers
        ),
        "privateBackendCount": len({item["backendId"] for item in observed.tokenizers}),
        "contextRanges": [
            {"sourceId": source_id, "start": index * 512, "end": (index + 1) * 512}
            for index, source_id in enumerate(source_ids)
        ],
        "passes": [
            {
                "role": "positive" if index % signs == 0 else "negative",
                "step": index // signs + 1,
                "sigma": float(item["timestep"][0].item()),
                "contextSha256": _sha(_tensor_bytes(item["context"])),
                "predictionSha256": _sha(_tensor_bytes(item["prediction"]))
                if "prediction" in item
                else None,
            }
            for index, item in enumerate(observed.passes)
        ],
        "sites": expected_masks,
        "expectedMaskAssociation": "exact" if not mismatch else "mismatch",
        "associationMismatches": mismatch,
        "dispatchCalls": len(observed.dispatch),
        "sdpaCalls": len(observed.sdpa),
        "decoded": len(observed.decoded),
        "borrowedWanCacheFields": [
            name
            for name in cast(dict[str, Any], vars(native.models.vae))
            if name.startswith(("_conv_", "_enc_conv_", "_feat_map", "_enc_feat_map"))
        ],
        "denseMaxError": max((item["maxError"] for item in observed.dispatch), default=None),
        "failure": None
        if failure is None
        else {"type": type(failure).__name__, "message": str(failure)},
        "visualStatus": "not-evaluated",
    }
    local = call.command.staging_root / "native-observation.json"
    if not local.exists():
        with local.open("x") as stream:
            json.dump(value, stream, indent=2)
            stream.write("\n")
    destination = os.environ.get("IGS_ANIMA_REGIONAL_RECORD_ROOT")
    if destination and label != "published":
        root = Path(destination)
        root.mkdir(parents=True, exist_ok=True)
        with (root / f"{label}-{native.profile}.json").open("x") as stream:
            json.dump(value, stream, indent=2)
            stream.write("\n")


def test_genuine_main_compiled_prompts_reach_original_native_consumers_and_png(
    native: _Native, main_inputs: _Producer, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    handoff = main_inputs()
    call = _command(tmp_path / "generation", handoff)
    original = copy.deepcopy(handoff)
    with _preserved(native):
        contexts = _context_oracle(handoff, native)
        with _observed(native, monkeypatch) as observed:
            done = _execute(call, native)
        rgb = _published(call, native, done, observed)
        _record("whole-main", native, call, observed, rgb)
        _native_association(call, native, observed, contexts)
    assert handoff == original


def test_zero_region_matches_ordinary_euler_and_published_rgb_exactly(
    native: _Native, main_inputs: _Producer, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    handoff = main_inputs("zero")
    call = _command(tmp_path / "zero", handoff)
    # Ordinary execution owns its existing Wan cache lifecycle. Establish that
    # control before taking this private borrow's preservation baseline.
    ordinary = generate_anima_flow_sampling(
        handoff["sampling"],
        handoff["compiledPrompts"][0]["prompt"],
        handoff["compiledPrompts"][1]["prompt"],
        native.models,
        tokenizers=native.oracle_tokenizers,
    )
    with _preserved(native):
        contexts = _context_oracle(handoff, native)
        with _observed(native, monkeypatch) as observed:
            done = _execute(call, native)
        rgb = _published(call, native, done, observed)
        assert rgb == ordinary.image.tobytes()
        _native_association(call, native, observed, contexts)


@pytest.mark.parametrize("variant", ["empty", "inherited"])
def test_empty_or_inherited_main_variants_keep_their_effective_stream_semantics(
    native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    variant: str,
) -> None:
    handoff = main_inputs(variant)
    call = _command(tmp_path / variant, handoff)
    with _preserved(native):
        contexts = _context_oracle(handoff, native)
        with _observed(native, monkeypatch) as observed:
            done = _execute(call, native)
        _published(call, native, done, observed)
        _native_association(call, native, observed, contexts)
    if variant == "empty":
        assert _emitted(handoff) == []
        assert any(region["positive"] is not None for region in handoff["recipe"]["regions"])
    else:
        assert handoff["recipe"]["globalPrompts"]["negative"]["text"] == ""
        assert all(
            region["negative"]["source"] == "current-canvas"
            for region in handoff["recipe"]["regions"]
        )


def test_real_main_swap_changes_only_regional_conditioning_and_repeat_is_exact(
    native: _Native, main_inputs: _Producer, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    handoffs = [main_inputs(), main_inputs("swapped"), main_inputs()]
    runs: list[tuple[_Observation, bytes]] = []
    with _preserved(native):
        for index, handoff in enumerate(handoffs):
            call = _command(tmp_path / f"run-{index}", handoff)
            contexts = _context_oracle(handoff, native)
            with _observed(native, monkeypatch) as observed:
                done = _execute(call, native)
            rgb = _published(call, native, done, observed)
            _native_association(call, native, observed, contexts)
            runs.append((observed, rgb))
    base, swapped, repeat = runs
    assert base[1] == repeat[1]
    assert base[1] != swapped[1], "Regional association did not reach decoded RGB"
    assert all(
        native.torch.equal(a["prediction"], b["prediction"])
        for a, b in zip(base[0].passes, repeat[0].passes, strict=True)
    )
    assert not native.torch.equal(
        base[0].passes[0]["prediction"], swapped[0].passes[0]["prediction"]
    )
    assert native.torch.equal(base[0].passes[1]["context"], swapped[0].passes[1]["context"])
    for a, b in zip(
        handoffs[0]["recipe"]["regions"], handoffs[1]["recipe"]["regions"], strict=True
    ):
        assert a["regionId"] == b["regionId"] and a["coverage"] == b["coverage"]


def test_same_key_length_never_masks_the_ordinary_negative_call(
    native: _Native, monkeypatch: pytest.MonkeyPatch
) -> None:
    torch = native.torch
    generator = torch.Generator(device="cpu").manual_seed(819)
    latents = torch.randn((1, 16, 1, 9, 13), generator=generator).to(
        device=native.device, dtype=native.dtype
    )
    positive = torch.randn((1, 512, 32), generator=generator).to(
        device=native.device, dtype=native.dtype
    )
    negative = torch.randn((1, 512, 32), generator=generator).to(
        device=native.device, dtype=native.dtype
    )
    mask = torch.ones((1, 1, 35, 512), device=native.device, dtype=torch.bool)
    mask[..., ::2, 256:] = False
    mask[..., 1::2, :256] = False
    with _preserved(native), torch.inference_mode():
        ordinary = predict_anima_flow(native.models.transformer, latents, negative, 0.75, torch)
        with _observed(native, monkeypatch) as observed:
            with regional.scoped_anima_regional_attention(native.models.transformer, mask, torch):
                changed = predict_anima_flow(
                    native.models.transformer, latents, positive, 0.75, torch
                )
            unmasked_positive = predict_anima_flow(
                native.models.transformer, latents, positive, 0.75, torch
            )
            actual = predict_anima_flow(native.models.transformer, latents, negative, 0.75, torch)
        assert bool(torch.equal(actual, ordinary))
        assert not bool(torch.equal(changed, unmasked_positive))
    for item in observed.processors:
        if item["pass"] == 0 and item["kind"] == "cross" and item["block"] % 2 == 0:
            assert bool(torch.equal(item["mask"], mask.cpu()))
        else:
            assert item["mask"] is None


def _unsupported_binding(change: str, call: _Call) -> None:
    handoff = call.handoff
    records = handoff["compiledPrompts"]
    recipe = handoff["recipe"]
    region = recipe["regions"][-1]
    if change == "missing-record":
        records.pop()
    elif change == "extra-record":
        records.append({**copy.deepcopy(records[-1]), "sourceId": str(uuid4())})
    elif change == "wrong-source":
        records[-1]["sourceId"] = str(uuid4())
    elif change == "wrong-polarity":
        records[-1]["polarity"] = "negative"
    elif change == "duplicate":
        records[-1]["sourceId"] = records[-2]["sourceId"]
    elif change == "wrong-record-text":
        records[-1]["text"] += " another text"
    elif change == "compiled-version":
        records[-1]["prompt"]["version"] = "unsupported-v2"
    elif change == "compiled-span":
        records[-1]["prompt"]["spans"][0]["end"] = True
    elif change == "global-command":
        call.command = replace(call.command, positive_prompt=call.command.negative_prompt)
    elif change == "region-negative":
        region["negative"]["prompt"]["text"] = "avoid fog"
        region["authoredPrompts"]["negative"]["text"] = "avoid fog"
    elif change == "inherited-nonempty":
        region["negative"] = {
            "source": "current-canvas",
            "prompt": copy.deepcopy(recipe["globalPrompts"]["negative"]),
        }
        region["authoredPrompts"]["useGlobalNegativePrompt"] = True
    elif change == "wrong-inherited-source":
        region["negative"]["source"] = "current-canvas"
    elif change == "family":
        recipe["family"] = "illustrious"
    elif change == "late-text":
        region["positive"]["text"] += " mismatch"
    elif change == "bbox-position":
        recipe["bbox"]["x"] += 1
    elif change == "seed":
        recipe["item"]["seed"] += 1
    elif change == "reference":
        reference_id = str(uuid4())
        region["referenceImages"] = [
            {
                "id": reference_id,
                "name": "Unsupported regional reference",
                "sourceFormat": "PNG",
                "asset": {
                    "path": (
                        f"assets/regional-references/{reference_id}/"
                        f"{call.command.target_sha256}.png"
                    ),
                    "sha256": call.command.target_sha256,
                    "bytes": call.command.target_byte_size,
                    "width": call.command.width,
                    "height": call.command.height,
                },
                "thumbnail": {
                    "path": f"assets/regional-references/{reference_id}/{'1' * 64}.webp",
                    "sha256": "1" * 64,
                    "bytes": 16,
                    "width": 64,
                    "height": 64,
                },
            }
        ]
    elif change == "active-ti":
        region["positive"]["embeddingRefs"] = [
            {
                "token": "<private-token>",
                "resource": {
                    "kind": "embedding",
                    "localModelId": str(uuid4()),
                    "localVersionId": str(uuid4()),
                    "civitaiModelId": 1,
                    "civitaiVersionId": 2,
                    "civitaiFileId": 3,
                    "baseModelFamily": "illustrious",
                    "predictionType": None,
                    "fileSha256": "1" * 64,
                    "displayName": "Unsupported exact embedding",
                    "versionName": "Exact test version",
                },
            }
        ]
        region["positive"]["text"] += " <private-token>"
        records[-1]["text"] = region["positive"]["text"]
    else:
        raise AssertionError(change)


@pytest.mark.parametrize(
    "change",
    [
        "missing-record",
        "extra-record",
        "wrong-source",
        "wrong-polarity",
        "duplicate",
        "wrong-record-text",
        "compiled-version",
        "compiled-span",
        "global-command",
        "region-negative",
        "inherited-nonempty",
        "wrong-inherited-source",
        "family",
        "late-text",
        "bbox-position",
        "seed",
        "reference",
        "active-ti",
    ],
)
def test_later_invalid_association_refuses_before_any_text_or_native_consumption(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    change: str,
) -> None:
    call = _command(tmp_path / "refused", main_inputs())
    _unsupported_binding(change, call)
    original = copy.deepcopy(call.handoff)
    with (
        _observed(cpu_native, monkeypatch) as observed,
        pytest.raises(DerivativeError) as error,
    ):
        _execute(call, cpu_native)
    assert error.value.code in {"INVALID_REQUEST", "GENERATION_PROMPT_UNSUPPORTED"}
    assert (
        observed.qwen == observed.conditioner == len(observed.passes) == len(observed.decoded) == 0
    )
    assert not call.command.output_path.exists()
    assert call.command.target_path.read_bytes() == call.target_bytes
    assert call.handoff == original


@pytest.mark.parametrize("change", ["opaque", "partial", "hash", "size", "existing-output"])
def test_real_target_validation_refuses_before_encoding_and_preserves_files(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    change: str,
) -> None:
    call = _command(
        tmp_path / change,
        main_inputs(),
        alpha=255 if change == "opaque" else (127 if change == "partial" else 0),
    )
    if change == "hash":
        call.command = replace(call.command, target_sha256="0" * 64)
    elif change == "size":
        call.command = replace(call.command, target_byte_size=call.command.target_byte_size + 1)
    elif change == "existing-output":
        call.command.output_path.write_bytes(b"existing-authoritative-output")
    expected = {
        "opaque": "GENERATION_TARGET_UNSUPPORTED",
        "partial": "GENERATION_TARGET_UNSUPPORTED",
        "hash": "INPUT_HASH_MISMATCH",
        "size": "GENERATION_INPUT_CHANGED",
        "existing-output": "OUTPUT_UNAVAILABLE",
    }[change]
    with (
        _observed(cpu_native, monkeypatch) as observed,
        pytest.raises(DerivativeError) as error,
    ):
        _execute(call, cpu_native)
    assert error.value.code == expected
    assert observed.qwen == observed.conditioner == len(observed.passes) == 0
    assert call.command.target_path.read_bytes() == call.target_bytes
    if change == "existing-output":
        assert call.command.output_path.read_bytes() == b"existing-authoritative-output"
    else:
        assert not call.command.output_path.exists()


@pytest.mark.parametrize(
    "change", ["image-command", "loras", "scheduler", "steps-bool", "steps-zero"]
)
def test_private_execution_scope_is_explicit_before_model_work(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    change: str,
) -> None:
    call = _command(tmp_path / change, main_inputs())
    if change == "image-command":
        call.command = GenerateAnimaImg2ImgCommand(**vars(call.command))
    elif change == "loras":
        call.command = replace(
            call.command,
            loras=(GenerationLora(call.command.bundle.checkpoint.path, "1" * 64, 1, 0.5),),
        )
    elif change == "scheduler":
        call.command = replace(
            call.command, sampling=replace(call.command.sampling, scheduler="heun")
        )
    elif change == "steps-bool":
        call.command = replace(call.command, sampling=replace(call.command.sampling, steps=True))
    else:
        call.command = replace(call.command, sampling=replace(call.command.sampling, steps=0))
    with (
        _observed(cpu_native, monkeypatch) as observed,
        pytest.raises(DerivativeError) as error,
    ):
        _execute(call, cpu_native)
    assert error.value.code in {"INVALID_REQUEST", "GENERATION_PROMPT_UNSUPPORTED"}
    assert observed.qwen == observed.conditioner == len(observed.passes) == 0
    assert not call.command.output_path.exists()


def test_crossed_tensor_profile_refuses_without_fallback(
    native: _Native, main_inputs: _Producer, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    call = _command(tmp_path / "crossed", main_inputs())
    wrong = "cpu-float32-v1" if native.device != "cpu" else "cuda-bfloat16-v1"
    with _observed(native, monkeypatch) as observed, pytest.raises(DerivativeError) as error:
        _execute(call, native, profile=wrong)
    assert error.value.code == "INFERENCE_UNAVAILABLE"
    assert observed.qwen == observed.conditioner == len(observed.passes) == 0


@pytest.mark.parametrize(
    "change", ["processor", "forward-shadow", "instance-hook", "global-hook", "training"]
)
def test_unsupported_borrowed_native_state_is_refused_without_repair(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    change: str,
) -> None:
    call = _command(tmp_path / change, main_inputs())
    models = cpu_native.models
    handle = None

    def noop_hook(_m: Any, _a: Any, _o: Any) -> None:
        return None

    with monkeypatch.context() as patch:
        if change == "processor":
            patch.setattr(models.transformer.transformer_blocks[0].attn2, "processor", object())
        elif change == "forward-shadow":
            # Dictionary-key undo restores inherited attribute absence exactly.
            patch.setitem(
                cast(dict[str, Any], vars(models.transformer)),
                "forward",
                models.transformer.forward,
            )
        elif change == "instance-hook":
            handle = models.qwen3_encoder.register_forward_hook(noop_hook)
        elif change == "global-hook":
            handle = cpu_native.torch.nn.modules.module.register_module_forward_hook(noop_hook)
        else:
            models.qwen3_encoder.train()
        try:
            with _preserved(cpu_native), _observed(cpu_native, monkeypatch) as observed:
                with pytest.raises(DerivativeError) as error:
                    _execute(call, cpu_native)
                assert error.value.code == "INFERENCE_UNAVAILABLE"
                assert observed.qwen == observed.conditioner == len(observed.passes) == 0
        finally:
            if handle is not None:
                handle.remove()
            if change == "training":
                models.qwen3_encoder.eval()
    assert not call.command.output_path.exists()


def test_positive_mask_budget_is_refused_before_first_qwen(
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    request: pytest.FixtureRequest,
) -> None:
    # Original geometry envelope still admits this shape. With two native heads
    # and three 512-row positive banks, its actual Q*K work exceeds 33,554,432.
    # Produce the large genuine Main handoff before loading native models. Run
    # this boundary in its own bounded unit, so setup work does not overlap ML.
    handoff = main_inputs(width=2048, height=1920)
    cpu_native = cast(_Native, request.getfixturevalue("cpu_native"))
    call = _command(tmp_path / "bounded", handoff)
    with (
        _observed(cpu_native, monkeypatch) as observed,
        pytest.raises(DerivativeError) as error,
    ):
        _execute(call, cpu_native)
    assert error.value.code == "LIMIT"
    assert observed.qwen == observed.conditioner == len(observed.passes) == 0
    assert not call.command.output_path.exists()


@pytest.mark.parametrize("kind", ["zero", "below-threshold", "nearest-lost"])
def test_nonempty_region_without_sampled_support_refuses_before_qwen(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    kind: str,
) -> None:
    handoff = main_inputs()
    coverage = handoff["recipe"]["regions"][-1]["coverage"]
    bbox = handoff["recipe"]["bbox"]
    width, height = bbox["width"], bbox["height"]
    coverage["alpha"] = [0] * (height * width)
    intersection = coverage["intersection"]
    left = intersection["x"] - bbox["x"]
    top = intersection["y"] - bbox["y"]
    if kind == "below-threshold":
        for y in range(top, top + intersection["height"]):
            for x in range(left, left + intersection["width"]):
                coverage["alpha"][y * width + x] = 127
    if kind == "zero":
        coverage["kind"] = "intersecting-empty"
    if kind == "nearest-lost":
        # Interior x51 is valid source coverage, but absent from the 7-column grid.
        coverage["alpha"][top * width + left + 1] = 255
    call = _command(tmp_path / kind, handoff)
    with (
        _observed(cpu_native, monkeypatch) as observed,
        pytest.raises(DerivativeError) as error,
    ):
        _execute(call, cpu_native)
    assert error.value.code == "GENERATION_PROMPT_UNSUPPORTED"
    assert observed.qwen == observed.conditioner == len(observed.passes) == 0


def test_retained_threshold_sample_and_overlap_match_independent_permissions(
    native: _Native, main_inputs: _Producer, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # A genuine 64-square capture samples x32, inside both original cropped masks.
    # The left source contributes its authored alpha128 threshold edge there.
    handoff = main_inputs(width=64, height=64)
    assert handoff["recipe"]["regions"][0]["coverage"]["alpha"][32] == 128
    assert handoff["recipe"]["regions"][0]["coverage"]["alpha"][33] == 127
    call = _command(tmp_path / "threshold", handoff)
    with _preserved(native):
        contexts = _context_oracle(handoff, native)
        with _observed(native, monkeypatch) as observed:
            done = _execute(call, native)
        _published(call, native, done, observed)
        _native_association(call, native, observed, contexts)
    allowed = _mask_oracle(handoff, native.torch)[0, 0]
    assert bool(allowed[2, 512:].all().item()) and not bool(allowed[2, :512].any().item())


def _contains_cause(error: BaseException, wanted: BaseException) -> bool:
    current: BaseException | None = error
    while current is not None:
        if current is wanted:
            return True
        current = current.__cause__
    return False


@pytest.mark.parametrize(
    "stage", ["install", "regional-encoding", "later-step", "decode", "publish", "link", "fsync"]
)
def test_native_failures_restore_borrowed_state_and_allow_a_fresh_success(
    native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    stage: str,
) -> None:
    call = _command(tmp_path / "failure", main_inputs())
    sentinel: BaseException = (
        OSError("declared publication failure")
        if stage in {"link", "fsync"}
        else RuntimeError(f"declared {stage} failure")
    )
    with _preserved(native):
        with monkeypatch.context() as patch:
            if stage == "install":
                attention_class = cast(
                    Any, type(native.models.transformer.transformer_blocks[0].attn2)
                )
                original: Any = attention_class.set_processor
                originals = {
                    id(block.attn2.processor)
                    for block in native.models.transformer.transformer_blocks
                }
                installed = 0

                @wraps(original)
                def install(self: Any, processor: Any, *args: Any, **kwargs: Any) -> Any:
                    nonlocal installed
                    if id(processor) not in originals:
                        installed += 1
                        if installed == 2:
                            raise sentinel
                    return original(self, processor, *args, **kwargs)

                patch.setattr(attention_class, "set_processor", install)
            elif stage in {"regional-encoding", "later-step"}:
                owner = (
                    native.models.text_conditioner
                    if stage == "regional-encoding"
                    else native.models.transformer
                )
                original = cast(Any, type(owner)).forward
                count = 0
                limit = 4 if stage == "regional-encoding" else 3

                @wraps(original)
                def fail_forward(self: Any, *args: Any, **kwargs: Any) -> Any:
                    nonlocal count
                    if self is owner:
                        count += 1
                        if count == limit:
                            raise sentinel
                    return original(self, *args, **kwargs)

                patch.setattr(cast(Any, type(owner)), "forward", fail_forward)
            elif stage == "decode":
                original = cast(Any, type(native.models.vae)).decode

                @wraps(original)
                def fail_decode(self: Any, *args: Any, **kwargs: Any) -> Any:
                    if self is native.models.vae:
                        raise sentinel
                    return original(self, *args, **kwargs)

                patch.setattr(cast(Any, type(native.models.vae)), "decode", fail_decode)
            elif stage == "publish":

                def fail_publish(*_args: Any, **_kwargs: Any) -> Any:
                    raise sentinel

                patch.setattr(regional, "publish_generation_image", fail_publish)
            else:
                artifacts = importlib.import_module("imagegen_worker.generation_artifacts")
                original = getattr(artifacts.os, stage)

                @wraps(original)
                def fail_store(*args: Any, **kwargs: Any) -> Any:
                    if stage == "link" and Path(args[1]) == call.command.output_path:
                        raise sentinel
                    if stage == "fsync" and stat.S_ISDIR(artifacts.os.fstat(args[0]).st_mode):
                        raise sentinel
                    return original(*args, **kwargs)

                patch.setattr(artifacts.os, stage, fail_store)
            with (
                _observed(native, monkeypatch) as failure_observation,
                pytest.raises(Exception) as error,
            ):
                _execute(call, native)
            assert _contains_cause(error.value, sentinel), "Failure identity/cause was lost"
        _record(f"failed-{stage}", native, call, failure_observation, None, failure=error.value)
        assert not call.command.output_path.exists()
        assert call.command.target_path.read_bytes() == call.target_bytes
        assert not list(call.command.staging_root.glob("*.tmp"))
        recovery = _command(tmp_path / "recovery", main_inputs())
        with _observed(native, monkeypatch) as observed:
            done = _execute(recovery, native)
        _published(recovery, native, done, observed)
        assert len(observed.passes) == 4 and len(observed.decoded) == 1


def test_partial_processor_setup_restores_originals_and_reentry_refuses(
    cpu_native: _Native, monkeypatch: pytest.MonkeyPatch
) -> None:
    native = cpu_native
    torch = native.torch
    transformer = native.models.transformer
    mask = torch.ones((1, 1, 35, 512), dtype=torch.bool)
    originals = [block.attn2.processor for block in transformer.transformer_blocks]
    with _preserved(native):
        with regional.scoped_anima_regional_attention(transformer, mask, torch):
            assert transformer.transformer_blocks[1].attn2.processor is originals[1]
            with (
                pytest.raises(DerivativeError) as error,
                regional.scoped_anima_regional_attention(transformer, mask, torch),
            ):
                pytest.fail("A second mutable owner entered the same native transformer")
            assert error.value.code == "OWNERSHIP_CONFLICT"
        assert all(
            block.attn2.processor is original
            for block, original in zip(transformer.transformer_blocks, originals, strict=True)
        )
        with regional.scoped_anima_regional_attention(transformer, mask, torch):
            pass


def test_anima_regional_association_mutation_red(
    native: _Native, main_inputs: _Producer, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    call = _command(tmp_path / "regional-mutation", main_inputs())
    with _preserved(native):
        contexts = _context_oracle(call.handoff, native)
        with _observed(native, monkeypatch) as observed:
            done = _execute(call, native)
        rgb = _published(call, native, done, observed)
        # The mutation driver retains this record even when the following exact
        # association oracle turns RED, after original native PNG consumption.
        _record("association-target", native, call, observed, rgb)
        _native_association(call, native, observed, contexts)


def test_anima_ordinary_control_green(
    native: _Native, main_inputs: _Producer, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    call = _command(tmp_path / "ordinary-control", main_inputs("zero"))
    with _preserved(native):
        contexts = _context_oracle(call.handoff, native)
        with _observed(native, monkeypatch) as observed:
            done = _execute(call, native)
        rgb = _published(call, native, done, observed)
        _record("ordinary-control", native, call, observed, rgb)
        _native_association(call, native, observed, contexts)


def test_later_empty_negative_requires_valid_qwen_pad_before_first_forward(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    handoff = main_inputs("inherited")
    invalid = _command(tmp_path / "missing-pad", handoff)
    with monkeypatch.context() as patch:
        patch.setattr(cpu_native.tokenizers.qwen3, "pad_token", None)
        with _preserved(cpu_native), _observed(cpu_native, monkeypatch) as observed:
            with pytest.raises(DerivativeError) as error:
                _execute(invalid, cpu_native)
            assert error.value.code == "GENERATION_PROMPT_UNSUPPORTED"
            assert "empty-input pad token" in str(error.value)
            assert observed.qwen == observed.conditioner == len(observed.passes) == 0
        assert not invalid.command.output_path.exists()
    healthy = _command(tmp_path / "valid-pad-control", main_inputs("inherited"))
    with _preserved(cpu_native):
        contexts = _context_oracle(healthy.handoff, cpu_native)
        with _observed(cpu_native, monkeypatch) as observed:
            done = _execute(healthy, cpu_native)
        rgb = _published(healthy, cpu_native, done, observed)
        _record("empty-pad-recovery", cpu_native, healthy, observed, rgb)
        _native_association(healthy, cpu_native, observed, contexts)
