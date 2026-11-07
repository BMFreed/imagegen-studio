"""Exact original Anima files through pinned native CPU constructors and converters."""

# pyright: reportPrivateUsage=false
# This file exercises the explicitly scoped private native architecture collaborator.

from __future__ import annotations

import hashlib
import importlib
import importlib.metadata
import json
import os
from dataclasses import replace
from pathlib import Path
from types import MappingProxyType
from typing import Any, cast

import pytest

from imagegen_worker import inference_anima
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.inference_anima import (
    ANIMA_BASE_ARCHITECTURE,
    AnimaModelBundle,
    AnimaModelFile,
    _AnimaArchitecture,
    _create_native_models,
    load_anima_models,
)


@pytest.fixture
def native() -> Any:
    torch = pytest.importorskip("torch")
    diffusers = pytest.importorskip("diffusers")
    transformers = pytest.importorskip("transformers")
    accelerate = pytest.importorskip("accelerate")
    assert importlib.metadata.version("diffusers") == "0.40.0"
    assert importlib.metadata.version("transformers") == "5.5.4"
    architecture = _AnimaArchitecture(
        transformer=MappingProxyType(
            {
                **ANIMA_BASE_ARCHITECTURE.transformer,
                "in_channels": 2,
                "out_channels": 2,
                "num_attention_heads": 2,
                "attention_head_dim": 32,
                "num_layers": 1,
                "text_embed_dim": 32,
                "adaln_lora_dim": 8,
                "max_size": (1, 8, 8),
            }
        ),
        text_conditioner=MappingProxyType(
            {
                **ANIMA_BASE_ARCHITECTURE.text_conditioner,
                "source_dim": 32,
                "target_dim": 32,
                "model_dim": 32,
                "num_layers": 1,
                "num_attention_heads": 2,
                "target_vocab_size": 32,
                "min_sequence_length": 4,
            }
        ),
        qwen3_encoder=MappingProxyType(
            {
                **ANIMA_BASE_ARCHITECTURE.qwen3_encoder,
                "vocab_size": 32,
                "hidden_size": 32,
                "intermediate_size": 64,
                "num_hidden_layers": 1,
                "num_attention_heads": 2,
                "num_key_value_heads": 1,
                "head_dim": 16,
            }
        ),
        vae=MappingProxyType({"base_dim": 4, "z_dim": 2}),
        companion_identities=None,
    )
    return torch, diffusers, transformers, accelerate, architecture


def test_default_architecture_matches_all_captured_real_header_shapes(native: Any) -> None:
    """Independent captured schema digests pin every key, rather than a few sentinels.

    Headers captured on 2026-10-05 from the original 685-tensor Cyberfalafel derivative,
    exact pinned Qwen3 cd2a5120... and VAE a70580f0.... Conversion used Diffusers 0.40.0.
    This proves structural agreement only; no tokenizer, GPU or generation is exercised.
    """
    torch, diffusers, transformers, accelerate, _architecture = native
    models = _create_native_models(
        ANIMA_BASE_ARCHITECTURE, torch, diffusers, transformers, accelerate
    )
    captured = {
        "transformer": (567, "bb8e18296d8a30e0bcf4af05aa8d3448fbb3b39dfc9b9c1bd5d0646e1a2c6d4f"),
        "text_conditioner": (
            118,
            "dd046b3c9be5448dab57caeb932c64b7aacb93def5350ea4f374481943187ab2",
        ),
        "qwen3_encoder": (310, "db791aeac0f35f5ea2e5cc3c74ef4382bcad886dcd758ad779e6382f450be47d"),
        "vae": (194, "2c9a81a5434b1d14428182ca61ea09b7b9aba79225a32c24ffcb7dd0da0d67c7"),
    }
    for name, model in models.items():
        state = model.state_dict()
        schema = {key: list(tensor.shape) for key, tensor in state.items()}
        digest = hashlib.sha256(
            json.dumps(schema, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        assert (len(state), digest) == captured[name]
        assert all(tensor.is_meta for tensor in state.values())


def test_default_loader_refuses_unpinned_companions_before_opening_files(tmp_path: Path) -> None:
    file = AnimaModelFile(tmp_path / "unopened.safetensors", "a" * 64, 32)
    with pytest.raises(DerivativeError, match="pinned") as error:
        load_anima_models(
            AnimaModelBundle(
                file,
                replace(file, path=tmp_path / "qwen.safetensors"),
                replace(file, path=tmp_path / "vae.safetensors"),
            )
        )
    assert error.value.code == "GENERATION_MODEL_UNSUPPORTED"


def _original_backbone(state: dict[str, Any]) -> dict[str, Any]:
    replacements = (
        ("time_embed.t_embedder", "t_embedder.1"),
        ("time_embed.norm", "t_embedding_norm"),
        ("transformer_blocks", "blocks"),
        ("norm1.linear_1", "adaln_modulation_self_attn.1"),
        ("norm1.linear_2", "adaln_modulation_self_attn.2"),
        ("norm2.linear_1", "adaln_modulation_cross_attn.1"),
        ("norm2.linear_2", "adaln_modulation_cross_attn.2"),
        ("norm3.linear_1", "adaln_modulation_mlp.1"),
        ("norm3.linear_2", "adaln_modulation_mlp.2"),
        ("attn1", "self_attn"),
        ("attn2", "cross_attn"),
        ("to_q", "q_proj"),
        ("to_k", "k_proj"),
        ("to_v", "v_proj"),
        ("to_out.0", "output_proj"),
        ("norm_q", "q_norm"),
        ("norm_k", "k_norm"),
        ("ff.net.0.proj", "mlp.layer1"),
        ("ff.net.2", "mlp.layer2"),
        ("patch_embed.proj", "x_embedder.proj.1"),
        ("norm_out.linear_1", "final_layer.adaln_modulation.1"),
        ("norm_out.linear_2", "final_layer.adaln_modulation.2"),
        ("proj_out", "final_layer.linear"),
    )
    original: dict[str, Any] = {}
    for key, tensor in state.items():
        for target, source in replacements:
            key = key.replace(target, source)
        original[key] = tensor
    return original


def _original_vae_keys() -> list[str]:
    """194 original Wan names independently captured from pinned a70580f0... header."""
    residual = ("0.gamma", "2.bias", "2.weight", "3.gamma", "6.bias", "6.weight")
    keys = [f"conv{index}.{suffix}" for index in (1, 2) for suffix in ("weight", "bias")]
    for component in ("encoder", "decoder"):
        keys += [f"{component}.conv1.{suffix}" for suffix in ("weight", "bias")]
        keys += [f"{component}.head.{suffix}" for suffix in ("0.gamma", "2.bias", "2.weight")]
        keys += [
            f"{component}.middle.{index}.residual.{suffix}"
            for index in (0, 2)
            for suffix in residual
        ]
        keys += [
            f"{component}.middle.1.{suffix}"
            for suffix in ("norm.gamma", "proj.bias", "proj.weight", "to_qkv.bias", "to_qkv.weight")
        ]
    for component, indices, shortcuts, resamples, time_convs in (
        ("encoder.downsamples", (0, 1, 3, 4, 6, 7, 9, 10), (3, 6), (2, 5, 8), (5, 8)),
        ("decoder.upsamples", (0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14), (4,), (3, 7, 11), (3, 7)),
    ):
        keys += [
            f"{component}.{index}.residual.{suffix}" for index in indices for suffix in residual
        ]
        keys += [
            f"{component}.{index}.shortcut.{suffix}"
            for index in shortcuts
            for suffix in ("weight", "bias")
        ]
        keys += [
            f"{component}.{index}.resample.1.{suffix}"
            for index in resamples
            for suffix in ("weight", "bias")
        ]
        keys += [
            f"{component}.{index}.time_conv.{suffix}"
            for index in time_convs
            for suffix in ("weight", "bias")
        ]
    assert len(keys) == 194
    return keys


def _file(path: Path) -> AnimaModelFile:
    data = path.read_bytes()
    return AnimaModelFile(path, hashlib.sha256(data).hexdigest(), len(data))


def _fixture(
    native: Any, root: Path, *, prefix: str = "net.", dtype: str = "float32"
) -> tuple[AnimaModelBundle, dict[str, dict[str, Any]]]:
    torch, diffusers, transformers, _accelerate, architecture = native
    safetensors = cast(Any, importlib.import_module("safetensors.torch"))
    converters = cast(Any, importlib.import_module("diffusers.loaders.single_file_utils"))
    with torch.random.fork_rng(devices=[]):
        torch.manual_seed(73)
        models = {
            "transformer": diffusers.CosmosTransformer3DModel(**architecture.transformer),
            "text_conditioner": diffusers.AnimaTextConditioner(**architecture.text_conditioner),
            "qwen3_encoder": transformers.Qwen3Model(
                transformers.Qwen3Config(**architecture.qwen3_encoder)
            ),
            "vae": diffusers.AutoencoderKLWan(**architecture.vae),
        }
    expected = {
        name: {
            key: tensor.to(dtype=getattr(torch, dtype)).clone()
            for key, tensor in model.state_dict().items()
        }
        for name, model in models.items()
    }
    checkpoint = {
        **_original_backbone(expected["transformer"]),
        **{f"llm_adapter.{key}": tensor for key, tensor in expected["text_conditioner"].items()},
    }
    # Native conversion maps the captured original names into actual tiny Wan
    # modules. The loader later performs that conversion on real tensor values.
    source_names = {key: key for key in _original_vae_keys()}
    mapped = converters.convert_wan_vae_to_diffusers(source_names)
    assert set(mapped) == set(expected["vae"])
    vae = {original: expected["vae"][target] for target, original in mapped.items()}
    sources = {
        "checkpoint": {prefix + key: tensor for key, tensor in checkpoint.items()},
        "qwen3_encoder": {
            "model." + key: tensor for key, tensor in expected["qwen3_encoder"].items()
        },
        "vae": vae,
    }
    files: dict[str, AnimaModelFile] = {}
    for role, state in sources.items():
        path = root / f"{role}.safetensors"
        safetensors.save_file(
            state, str(path), metadata={"config": "untrusted", "scaling_factor": "99"}
        )
        files[role] = _file(path)
    return AnimaModelBundle(**files), expected


def _load(native: Any, bundle: AnimaModelBundle, **kwargs: Any) -> Any:
    return load_anima_models(bundle, _architecture=native[4], **kwargs)


def _rewrite_state(native: Any, file: AnimaModelFile, change: Any) -> AnimaModelFile:
    safetensors = cast(Any, importlib.import_module("safetensors.torch"))
    state = safetensors.load_file(str(file.path))
    change(state)
    safetensors.save_file(state, str(file.path))
    return _file(file.path)


@pytest.mark.parametrize("prefix", ["net.", "model.diffusion_model.", ""])
@pytest.mark.parametrize("dtype", ["float32", "bfloat16"])
def test_public_loader_preserves_complete_native_tensors_and_offline_config(
    native: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, prefix: str, dtype: str
) -> None:
    torch, diffusers, transformers, _accelerate, _architecture = native
    bundle, expected = _fixture(native, tmp_path, prefix=prefix, dtype=dtype)
    before = {
        file.path: file.path.read_bytes()
        for file in (bundle.checkpoint, bundle.qwen3_encoder, bundle.vae)
    }

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("Loader attempted hidden model or config discovery")

    for cls in (
        diffusers.CosmosTransformer3DModel,
        diffusers.AutoencoderKLWan,
        transformers.Qwen3Model,
    ):
        monkeypatch.setattr(cls, "from_pretrained", forbidden)
    monkeypatch.setattr(diffusers.CosmosTransformer3DModel, "from_single_file", forbidden)
    monkeypatch.setattr(diffusers.AutoencoderKLWan, "from_single_file", forbidden)
    loaded = _load(native, bundle)
    for name, state in expected.items():
        model = getattr(loaded, name)
        assert not model.training
        assert set(model.state_dict()) == set(state)
        assert all(
            torch.equal(tensor, state[key].float()) for key, tensor in model.state_dict().items()
        )
        assert all(
            tensor.device.type == "cpu" and not tensor.is_meta
            for tensor in (*model.parameters(), *model.buffers())
        )
    assert loaded.transformer.config.rope_scale == (1.0, 4.0, 4.0)
    assert loaded.transformer.config.extra_pos_embed_type is None
    assert loaded.vae.config.z_dim == 2
    assert loaded.qwen3_encoder.config.rope_parameters == {
        "rope_theta": 1000000.0,
        "rope_type": "default",
    }
    assert all(path.read_bytes() == data for path, data in before.items())


def test_loaded_real_native_qwen_conditioner_backbone_consumers_run_on_cpu(
    native: Any, tmp_path: Path
) -> None:
    # Cosmos.forward uses torchvision for its padding mask; it is not a loader
    # dependency or a generation qualification under the current worker pins.
    _torchvision = pytest.importorskip("torchvision")
    torch = native[0]
    bundle, _expected = _fixture(native, tmp_path)
    loaded = _load(native, bundle)
    with torch.inference_mode():
        qwen = loaded.qwen3_encoder(torch.tensor([[1, 2]])).last_hidden_state
        conditioned = loaded.text_conditioner(qwen, torch.tensor([[1, 2]]))
        output = loaded.transformer(
            hidden_states=torch.zeros((1, 2, 1, 4, 4)),
            encoder_hidden_states=conditioned,
            timestep=torch.tensor([0.5]),
            padding_mask=torch.zeros((1, 1, 4, 4)),
        ).sample
    assert qwen.shape == (1, 2, 32)
    assert conditioned.shape == (1, 4, 32)
    assert output.shape == (1, 2, 1, 4, 4)
    assert bool(torch.isfinite(output).all().item())


@pytest.mark.parametrize("mutation", ["missing", "shape", "branch", "dtype", "nan", "inf"])
def test_same_checkpoint_layout_refuses_one_material_tensor_change(
    native: Any, tmp_path: Path, mutation: str
) -> None:
    torch = native[0]
    bundle, _expected = _fixture(native, tmp_path)
    assert _load(native, bundle).transformer is not None

    def change(state: dict[str, Any]) -> None:
        key = "net.x_embedder.proj.1.weight"
        if mutation == "missing":
            del state[key]
        elif mutation == "shape":
            state[key] = state[key][:-1].clone()
        elif mutation == "branch":
            state["net.semantic_connector.weight"] = torch.ones((1,))
        elif mutation == "dtype":
            state[key] = state[key].to(torch.int64)
        else:
            state[key][0, 0] = float(mutation)

    changed = replace(bundle, checkpoint=_rewrite_state(native, bundle.checkpoint, change))
    with pytest.raises(DerivativeError) as error:
        _load(native, changed)
    assert error.value.code == "GENERATION_MODEL_UNSUPPORTED"


@pytest.mark.parametrize("role", ["checkpoint", "qwen3_encoder", "vae"])
@pytest.mark.parametrize("identity", ["hash", "size"])
def test_exact_component_identity_rejects_a_single_frozen_field_change(
    native: Any, tmp_path: Path, role: str, identity: str
) -> None:
    bundle, _expected = _fixture(native, tmp_path)
    file = getattr(bundle, role)
    changed = (
        replace(file, sha256="a" * 64)
        if identity == "hash"
        else replace(file, byte_size=file.byte_size + 1)
    )
    with pytest.raises(DerivativeError) as error:
        _load(native, replace(bundle, **{role: changed}))
    assert error.value.code == "GENERATION_INPUT_CHANGED"


@pytest.mark.parametrize("kind", ["symlink", "directory", "fifo", "relative", "traversal"])
def test_noncanonical_or_nonregular_files_are_refused_without_blocking(
    native: Any, tmp_path: Path, kind: str
) -> None:
    bundle, _expected = _fixture(native, tmp_path)
    path = tmp_path / "invalid.safetensors"
    if kind == "symlink":
        path.symlink_to(bundle.checkpoint.path)
    elif kind == "directory":
        path.mkdir()
    elif kind == "fifo":
        os.mkfifo(path)
    elif kind == "relative":
        path = Path("checkpoint.safetensors")
    else:
        path = tmp_path / ".." / tmp_path.name / "checkpoint.safetensors"
    with pytest.raises(DerivativeError) as error:
        _load(native, replace(bundle, checkpoint=replace(bundle.checkpoint, path=path)))
    assert error.value.code in ("INVALID_PATH", "GENERATION_INPUT_CHANGED")


def _rewrite_header(file: AnimaModelFile, change: Any) -> AnimaModelFile:
    raw = file.path.read_bytes()
    size = int.from_bytes(raw[:8], "little")
    header = json.loads(raw[8 : 8 + size])
    change(header)
    encoded = json.dumps(header, separators=(",", ":")).encode()
    file.path.write_bytes(len(encoded).to_bytes(8, "little") + encoded + raw[8 + size :])
    return _file(file.path)


@pytest.mark.parametrize(
    "mutation",
    [
        "overlap",
        "hole",
        "tail",
        "offset_type",
        "shape_bool",
        "shape_zero",
        "size_dtype",
        "unknown_field",
        "metadata",
    ],
)
def test_malformed_header_ranges_and_descriptors_refuse_before_payload_decode(
    native: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mutation: str
) -> None:
    bundle, _expected = _fixture(native, tmp_path)

    def change(header: dict[str, Any]) -> None:
        keys = [key for key in header if key != "__metadata__"]
        first, second = header[keys[0]], header[keys[1]]
        if mutation == "overlap":
            length = second["data_offsets"][1] - second["data_offsets"][0]
            second["data_offsets"] = [0, length]
        elif mutation == "hole":
            first["data_offsets"] = [offset + 1 for offset in first["data_offsets"]]
        elif mutation == "tail":
            header.pop(keys[-1])
        elif mutation == "offset_type":
            first["data_offsets"][0] = False
        elif mutation == "shape_bool":
            first["shape"][0] = True
        elif mutation == "shape_zero":
            first["shape"][0] = 0
        elif mutation == "size_dtype":
            first["dtype"] = "F16"
        elif mutation == "unknown_field":
            first["unexpected"] = 1
        else:
            header["__metadata__"] = {"config": {"in_channels": 99}}

    changed = replace(bundle, checkpoint=_rewrite_header(bundle.checkpoint, change))
    safetensors = cast(Any, importlib.import_module("safetensors.torch"))

    def forbidden(_data: bytes) -> Any:
        raise AssertionError("Malformed header reached native payload decoding")

    monkeypatch.setattr(safetensors, "load", forbidden)
    with pytest.raises(DerivativeError) as error:
        _load(native, changed)
    assert error.value.code == "GENERATION_MODEL_UNSUPPORTED"


@pytest.mark.parametrize("nested", [False, True])
def test_duplicate_json_fields_are_refused_before_dict_parsing_can_discard_them(
    native: Any, tmp_path: Path, nested: bool
) -> None:
    bundle, _expected = _fixture(native, tmp_path)
    raw = bundle.checkpoint.path.read_bytes()
    size = int.from_bytes(raw[:8], "little")
    header = raw[8 : 8 + size]
    if nested:
        header = header.replace(b'"dtype":"F32"', b'"dtype":"F32","dtype":"F32"', 1)
    else:
        parsed = json.loads(header)
        key = next(key for key in parsed if key != "__metadata__")
        duplicate = json.dumps(key).encode() + b":" + json.dumps(parsed[key]).encode() + b","
        header = b"{" + duplicate + header[1:]
    bundle.checkpoint.path.write_bytes(len(header).to_bytes(8, "little") + header + raw[8 + size :])
    with pytest.raises(DerivativeError, match="duplicate"):
        _load(native, replace(bundle, checkpoint=_file(bundle.checkpoint.path)))


@pytest.mark.parametrize("declared", [1, 32 * 1024 * 1024 + 1, 2**64 - 1])
def test_header_length_is_bounded_before_reading_a_declared_payload(
    native: Any, tmp_path: Path, declared: int
) -> None:
    bundle, _expected = _fixture(native, tmp_path)
    bundle.checkpoint.path.write_bytes(declared.to_bytes(8, "little") + b"{}")
    with pytest.raises(DerivativeError, match="header"):
        _load(native, replace(bundle, checkpoint=_file(bundle.checkpoint.path)))


def test_whole_file_limit_is_derived_from_complete_native_weight_footprints(
    native: Any, tmp_path: Path
) -> None:
    bundle, _expected = _fixture(native, tmp_path)
    oversized = replace(bundle.checkpoint, byte_size=2**50)
    with pytest.raises(DerivativeError, match="byte limit"):
        _load(native, replace(bundle, checkpoint=oversized))


@pytest.mark.parametrize("mutation", ["mixed_prefix", "converted_alias"])
def test_packaging_and_converter_alias_collisions_are_refused(
    native: Any, tmp_path: Path, mutation: str
) -> None:
    bundle, _expected = _fixture(native, tmp_path)

    def change(state: dict[str, Any]) -> None:
        key = "net.x_embedder.proj.1.weight"
        if mutation == "mixed_prefix":
            state["model.diffusion_model." + key.removeprefix("net.")] = state[key].clone()
        else:
            state["net.patch_embed.proj.weight"] = state[key].clone()

    changed = replace(bundle, checkpoint=_rewrite_state(native, bundle.checkpoint, change))
    with pytest.raises(DerivativeError):
        _load(native, changed)


def test_explicit_exporter_buffers_and_bundled_components_cannot_replace_companions(
    native: Any, tmp_path: Path
) -> None:
    torch = native[0]
    bundle, expected = _fixture(native, tmp_path, prefix="model.diffusion_model.")

    def change(state: dict[str, Any]) -> None:
        state["model.diffusion_model.pos_embedder.dim_spatial_range"] = torch.ones((2,))
        state["model.diffusion_model.llm_adapter.rotary_emb.inv_freq"] = torch.ones((2,))
        state["model_sampling.sigmas"] = torch.ones((2,))
        state["cond_stage_model.model.embed_tokens.weight"] = torch.ones((2, 2))
        state["first_stage_model.conv1.weight"] = torch.ones((2, 2))

    changed = replace(bundle, checkpoint=_rewrite_state(native, bundle.checkpoint, change))
    loaded = _load(native, changed)
    assert torch.equal(
        loaded.qwen3_encoder.embed_tokens.weight, expected["qwen3_encoder"]["embed_tokens.weight"]
    )
    assert torch.equal(loaded.vae.quant_conv.weight, expected["vae"]["quant_conv.weight"])


def test_known_derived_buffer_is_checked_for_source_finiteness_before_exclusion(
    native: Any, tmp_path: Path
) -> None:
    bundle, _expected = _fixture(native, tmp_path)

    def change(state: dict[str, Any]) -> None:
        state["net.llm_adapter.rotary_emb.inv_freq"] = native[0].tensor([float("nan")])

    changed = replace(bundle, checkpoint=_rewrite_state(native, bundle.checkpoint, change))
    with pytest.raises(DerivativeError, match="contains non-finite"):
        _load(native, changed)


def test_native_decode_uses_verified_snapshot_after_source_path_changes(
    native: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    torch = native[0]
    bundle, expected = _fixture(native, tmp_path)
    read = inference_anima._read_snapshot

    def change_after_verified_read(file: AnimaModelFile, *args: Any, **kwargs: Any) -> bytes:
        data = read(file, *args, **kwargs)
        if file == bundle.checkpoint:
            file.path.write_bytes(b"invalid replacement after verified snapshot")
        return data

    monkeypatch.setattr(inference_anima, "_read_snapshot", change_after_verified_read)
    loaded = _load(native, bundle)
    assert torch.equal(
        loaded.transformer.patch_embed.proj.weight,
        expected["transformer"]["patch_embed.proj.weight"],
    )


def test_file_stat_change_while_reading_refuses_the_snapshot(
    native: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from types import SimpleNamespace

    bundle, _expected = _fixture(native, tmp_path)
    fstat = os.fstat
    reads = 0

    def changed_stat(descriptor: int) -> Any:
        nonlocal reads
        actual = fstat(descriptor)
        reads += 1
        if reads == 2:
            return SimpleNamespace(
                st_mode=actual.st_mode,
                st_size=actual.st_size,
                st_mtime_ns=actual.st_mtime_ns + 1,
                st_ctime_ns=actual.st_ctime_ns,
            )
        return actual

    monkeypatch.setattr(os, "fstat", changed_stat)
    with pytest.raises(DerivativeError) as error:
        _load(native, bundle)
    assert error.value.code == "GENERATION_INPUT_CHANGED"


def test_finite_source_overflow_refuses_requested_f16_and_preserves_f32_control(
    native: Any, tmp_path: Path
) -> None:
    torch = native[0]
    bundle, _expected = _fixture(native, tmp_path)

    def change(state: dict[str, Any]) -> None:
        state["net.x_embedder.proj.1.weight"][0, 0] = 100000.0

    changed = replace(bundle, checkpoint=_rewrite_state(native, bundle.checkpoint, change))
    assert _load(native, changed).transformer.patch_embed.proj.weight[0, 0].item() == 100000.0
    with pytest.raises(DerivativeError, match="overflowed"):
        _load(native, changed, dtype=torch.float16)


def test_requested_compute_dtype_is_exact_and_unsupported_dtype_never_falls_back(
    native: Any, tmp_path: Path
) -> None:
    torch = native[0]
    bundle, _expected = _fixture(native, tmp_path)
    loaded = _load(native, bundle, dtype=torch.bfloat16)
    assert loaded.transformer.dtype == torch.bfloat16
    assert loaded.qwen3_encoder.dtype == torch.bfloat16
    assert loaded.vae.dtype == torch.bfloat16
    with pytest.raises(DerivativeError, match="dtype"):
        _load(native, bundle, dtype=torch.float64)


def test_native_dependency_drift_is_refused_without_model_discovery(
    native: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    bundle, _expected = _fixture(native, tmp_path)
    version = importlib.metadata.version

    def drifted_version(name: str) -> str:
        return "0.41.0" if name == "diffusers" else version(name)

    monkeypatch.setattr(
        importlib.metadata,
        "version",
        drifted_version,
    )
    with pytest.raises(DerivativeError) as error:
        _load(native, bundle)
    assert error.value.code == "INFERENCE_UNAVAILABLE"


def test_unknown_connector_rotary_buffer_is_not_discarded_as_exporter_metadata(
    native: Any, tmp_path: Path
) -> None:
    bundle, _expected = _fixture(native, tmp_path)

    def change(state: dict[str, Any]) -> None:
        state["net.unsupported_connector.inv_freq"] = native[0].ones((2,))

    changed = replace(bundle, checkpoint=_rewrite_state(native, bundle.checkpoint, change))
    with pytest.raises(DerivativeError):
        _load(native, changed)


@pytest.mark.parametrize("role", ["qwen3_encoder", "vae"])
@pytest.mark.parametrize("mutation", ["missing", "shape", "nan"])
def test_companion_native_state_is_complete_and_finite_after_conversion(
    native: Any, tmp_path: Path, role: str, mutation: str
) -> None:
    bundle, _expected = _fixture(native, tmp_path)
    file = getattr(bundle, role)

    def change(state: dict[str, Any]) -> None:
        key = "model.embed_tokens.weight" if role == "qwen3_encoder" else "conv1.weight"
        if mutation == "missing":
            del state[key]
        elif mutation == "shape":
            state[key] = state[key][:-1].clone()
        else:
            state[key].flatten()[0] = float("nan")

    changed = replace(bundle, **{role: _rewrite_state(native, file, change)})
    with pytest.raises(DerivativeError) as error:
        _load(native, changed)
    assert error.value.code == "GENERATION_MODEL_UNSUPPORTED"


def test_invalid_requested_device_has_no_cpu_fallback(native: Any, tmp_path: Path) -> None:
    bundle, _expected = _fixture(native, tmp_path)
    assert _load(native, bundle).transformer.device.type == "cpu"
    with pytest.raises(DerivativeError) as error:
        _load(native, bundle, device="invalid-device")
    assert error.value.code == "INFERENCE_UNAVAILABLE"


@pytest.mark.parametrize("dtype", ["float32", "float16", "bfloat16"])
def test_loader_preserves_constructor_rotary_precision(
    native: Any, tmp_path: Path, dtype: str
) -> None:
    torch, diffusers, transformers, _accelerate, architecture = native
    bundle, expected = _fixture(native, tmp_path)
    selected_dtype = getattr(torch, dtype)
    # Construct a fresh oracle: widening a previously rounded buffer to F32
    # cannot recover the native frequencies this loader must preserve.
    with torch.random.fork_rng(devices=[]):
        constructors = {
            "transformer": diffusers.CosmosTransformer3DModel(**architecture.transformer),
            "text_conditioner": diffusers.AnimaTextConditioner(**architecture.text_conditioner),
            "qwen3_encoder": transformers.Qwen3Model(
                transformers.Qwen3Config(**architecture.qwen3_encoder)
            ),
        }
    loaded = _load(native, bundle, device="cpu", dtype=selected_dtype)

    # Every persistent tensor still receives the exact requested cast, including
    # the VAE. Preserving constructor buffers must not leave weights in F32.
    for component, source_state in expected.items():
        state = getattr(loaded, component).state_dict()
        assert set(state) == set(source_state)
        for key, source in source_state.items():
            tensor = state[key]
            assert tensor.device.type == "cpu" and not tensor.is_meta
            assert tensor.dtype == selected_dtype, (component, key)
            assert torch.equal(tensor, source.to(dtype=selected_dtype)), (component, key)

    for component, key in (
        ("qwen3_encoder", "inv_freq"),
        ("qwen3_encoder", "original_inv_freq"),
        ("text_conditioner", "inv_freq"),
    ):
        original = getattr(constructors[component].rotary_emb, key)
        tensor = getattr(getattr(loaded, component).rotary_emb, key)
        assert original.dtype == torch.float32
        if selected_dtype != torch.float32:
            # These real constructor values distinguish preserved precision
            # from a low-precision buffer subsequently widened back to F32.
            assert not torch.equal(
                original, original.to(dtype=selected_dtype).to(dtype=torch.float32)
            ), (component, key)
        assert tensor.device.type == "cpu" and not tensor.is_meta
        assert tensor.dtype == original.dtype, (component, key)
        assert torch.equal(tensor, original), (component, key)

    # Cover the backbone's generated position buffers as well as the explicit
    # Qwen/conditioner frequencies; none belongs to the persistent source state.
    for component, constructor in constructors.items():
        original_buffers = {
            key: tensor
            for key, tensor in constructor.named_buffers()
            if key not in constructor.state_dict()
        }
        model = getattr(loaded, component)
        buffers = {
            key: tensor for key, tensor in model.named_buffers() if key not in model.state_dict()
        }
        assert set(buffers) == set(original_buffers)
        for key, original in original_buffers.items():
            tensor = buffers[key]
            assert tensor.device.type == "cpu" and not tensor.is_meta
            assert tensor.dtype == original.dtype, (component, key)
            assert torch.equal(tensor, original), (component, key)


def test_loaded_bf16_native_qwen_conditioner_backbone_consumers_run_on_cpu(
    native: Any, tmp_path: Path
) -> None:
    # Actual tiny native consumers exercise BF16 weights with their F32 rotary
    # buffers. Random fixture weights do not qualify trained output or quality.
    _torchvision = pytest.importorskip("torchvision")
    torch = native[0]
    bundle, _expected = _fixture(native, tmp_path)
    loaded = _load(native, bundle, device="cpu", dtype=torch.bfloat16)
    assert loaded.qwen3_encoder.rotary_emb.inv_freq.dtype == torch.float32
    assert loaded.qwen3_encoder.rotary_emb.original_inv_freq.dtype == torch.float32
    assert loaded.text_conditioner.rotary_emb.inv_freq.dtype == torch.float32
    with torch.inference_mode():
        qwen = loaded.qwen3_encoder(torch.tensor([[1, 2]])).last_hidden_state
        conditioned = loaded.text_conditioner(qwen, torch.tensor([[1, 2]]))
        output = loaded.transformer(
            hidden_states=torch.zeros((1, 2, 1, 4, 4), dtype=torch.bfloat16),
            encoder_hidden_states=conditioned,
            timestep=torch.tensor([0.5]),
            padding_mask=torch.zeros((1, 1, 4, 4), dtype=torch.bfloat16),
        ).sample
    for tensor, shape in (
        (qwen, (1, 2, 32)),
        (conditioned, (1, 4, 32)),
        (output, (1, 2, 1, 4, 4)),
    ):
        assert tensor.shape == shape
        assert tensor.dtype == torch.bfloat16
        assert bool(torch.isfinite(tensor).all().item())
