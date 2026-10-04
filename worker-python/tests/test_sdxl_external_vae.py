"""Exact standalone VAE snapshots through the real pinned loader and worker boundary."""

from __future__ import annotations

import gc
import hashlib
import importlib
import inspect
import io
import json
import re
import weakref
from collections.abc import Generator
from pathlib import Path
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import inference_config, inference_main
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.inference import MLRuntime
from imagegen_worker.inference_external_vae import (
    load_generation_vae,
    qualify_vae_state,
    read_vae_snapshot,
)
from imagegen_worker.inference_main import process_inference_request
from imagegen_worker.protocol import GenerateIllustriousTxt2ImgCommand, GenerationVae, parse_request
from test_sdxl_vae_precision import generation_request
from test_sdxl_vae_precision import native as precision_native


@pytest.fixture
def native() -> Generator[Any]:
    # Reuse the existing actual tiny SDXL/CLIP fixture; no parallel fake model.
    factory = inspect.unwrap(precision_native)
    yield from cast(Generator[Any], factory())


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _vae(path: Path) -> GenerationVae:
    data = path.read_bytes()
    return GenerationVae(path=path, sha256=_digest(data), byte_size=len(data))


def _original_state(state: dict[str, Any], blocks: int) -> dict[str, Any]:
    """Serialize native fixture tensors with the original LDM file naming."""
    converted: dict[str, Any] = {}
    for key, tensor in state.items():
        original = key.replace("conv_norm_out", "norm_out")
        original = re.sub(
            r"\.mid_block\.resnets\.(\d+)\.", lambda m: f".mid.block_{int(m[1]) + 1}.", original
        )
        original = original.replace(".mid_block.attentions.0.", ".mid.attn_1.")
        original = original.replace(".attn_1.group_norm.", ".attn_1.norm.")
        for native_key, original_key in (
            ("to_q", "q"),
            ("to_k", "k"),
            ("to_v", "v"),
            ("to_out.0", "proj_out"),
        ):
            original = original.replace(f".attn_1.{native_key}.", f".attn_1.{original_key}.")
        original = re.sub(
            r"encoder\.down_blocks\.(\d+)\.resnets\.(\d+)\.", r"encoder.down.\1.block.\2.", original
        )
        original = re.sub(
            r"encoder\.down_blocks\.(\d+)\.downsamplers\.0\.",
            r"encoder.down.\1.downsample.",
            original,
        )
        original = re.sub(
            r"decoder\.up_blocks\.(\d+)\.resnets\.(\d+)\.",
            lambda m: f"decoder.up.{blocks - 1 - int(m[1])}.block.{m[2]}.",
            original,
        )
        original = re.sub(
            r"decoder\.up_blocks\.(\d+)\.upsamplers\.0\.",
            lambda m: f"decoder.up.{blocks - 1 - int(m[1])}.upsample.",
            original,
        )
        if ".attn_1." in original and original.endswith(".weight") and tensor.ndim == 2:
            tensor = tensor[:, :, None, None]
        assert original not in converted
        converted[original] = tensor
    return converted


def _fixture(native: Any, root: Path, *, original: bool = False) -> tuple[Any, Path, Path]:
    torch, _diffusers, make_pipeline = native
    pipeline = make_pipeline(False, True)
    model = pipeline.vae
    config = root / "config"
    model.save_config(config / "vae")
    state = {key: tensor.clone() for key, tensor in model.state_dict().items()}
    if original:
        state = _original_state(state, len(model.config.up_block_types))
    safetensors = cast(Any, importlib.import_module("safetensors.torch"))
    path = root / "external.safetensors"
    safetensors.save_file(
        state, str(path), metadata={"scaling_factor": "99", "force_upcast": "false"}
    )
    assert all(tensor.dtype == torch.float16 for tensor in state.values())
    return model, config, path


@pytest.mark.parametrize("opaque", [False, True])
def test_protocol_preserves_exact_vae_and_null_or_legacy_embedded(
    tmp_path: Path, opaque: bool
) -> None:
    request = generation_request(tmp_path / "stage", opaque)
    legacy = parse_request(request)
    assert isinstance(legacy, GenerateIllustriousTxt2ImgCommand) and legacy.vae is None
    request["job"]["vae"] = None
    assert parse_request(request) == legacy
    request["job"]["vae"] = {
        "path": str(tmp_path / "vae.safetensors"),
        "sha256": "b" * 64,
        "byteSize": 123,
    }
    command = parse_request(request)
    assert isinstance(command, GenerateIllustriousTxt2ImgCommand)
    assert command.vae == GenerationVae(tmp_path / "vae.safetensors", "b" * 64, 123)
    request["job"]["vae"]["sha256"] = "c" * 64
    assert command.vae is not None and command.vae.sha256 == "b" * 64


@pytest.mark.parametrize(
    "invalid",
    [
        True,
        0,
        "vae",
        [],
        {},
        {"path": "relative.safetensors", "sha256": "a" * 64, "byteSize": 1},
        {"path": "/vae.safetensors", "sha256": "a" * 64, "byteSize": True},
        {"path": "/vae.safetensors", "sha256": "a" * 64, "byteSize": 0},
        {"path": "/vae.safetensors", "sha256": "bad", "byteSize": 1},
        {"path": "/vae.safetensors", "sha256": "a" * 64, "byteSize": 1, "scale": 99},
    ],
)
def test_protocol_refuses_invalid_vae_before_io(tmp_path: Path, invalid: object) -> None:
    request = generation_request(tmp_path / "stage", False)
    request["job"]["vae"] = invalid
    with pytest.raises(DerivativeError) as error:
        parse_request(request)
    assert error.value.code == "INVALID_REQUEST"
    assert not (tmp_path / "stage" / "output.png").exists()


@pytest.mark.parametrize("original", [False, True])
def test_actual_public_loader_preserves_every_exact_tensor_and_explicit_config(
    native: Any, tmp_path: Path, original: bool
) -> None:
    torch, diffusers, _make = native
    expected, config, path = _fixture(native, tmp_path, original=original)
    loaded = load_generation_vae(_vae(path), config, diffusers, torch)
    assert loaded is not expected
    assert loaded.config.scaling_factor == expected.config.scaling_factor
    assert loaded.config.force_upcast is True
    assert set(loaded.state_dict()) == set(expected.state_dict())
    assert all(
        torch.equal(loaded.state_dict()[key], tensor)
        for key, tensor in expected.state_dict().items()
    )


def test_jsonl_completed_request_collects_real_native_pipeline_before_next_model_load(
    native: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    torch, diffusers, make_pipeline = native
    source, config, path = _fixture(native, tmp_path)
    del source
    monkeypatch.setattr(
        inference_config,
        "PINNED_SDXL_FILES",
        {"vae/config.json": _digest((config / "vae" / "config.json").read_bytes())},
    )
    exact = _vae(path)
    requests: list[dict[str, Any]] = []
    for index in range(2):
        request = generation_request(tmp_path / f"stage-{index}", False)
        request["requestId"] = f"lifetime-{index}"
        request["job"]["vae"] = {
            "path": str(path),
            "sha256": exact.sha256,
            "byteSize": exact.byte_size,
        }
        requests.append(request)
    refs: list[weakref.ReferenceType[Any]] = []
    loads: list[list[bool]] = []
    base_to = diffusers.StableDiffusionXLPipeline.to

    def cpu_only(pipeline: Any, *args: Any, **kwargs: Any) -> Any:
        return base_to(pipeline, *(("cpu",) if args == ("cuda",) else args), **kwargs)

    monkeypatch.setattr(diffusers.StableDiffusionXLPipeline, "to", cpu_only)

    def load(_checkpoint: str, **kwargs: Any) -> Any:
        loads.append([ref() is not None for ref in refs])
        # The heavyweight checkpoint loader alone is substituted. Models, Compel,
        # selected VAE's public loader, denoising and JSONL main remain actual.
        pipeline = make_pipeline(False, True)
        pipeline.register_modules(vae=kwargs["vae"])
        refs.append(weakref.ref(pipeline))
        return pipeline

    monkeypatch.setattr(diffusers.StableDiffusionXLPipeline, "from_single_file", load)
    runtime = MLRuntime(torch, diffusers, importlib.import_module("compel"))
    monkeypatch.setattr(inference_main, "_qualify", lambda: (config, runtime))

    class Stream:
        def __init__(self, data: bytes = b"") -> None:
            self.buffer = io.BytesIO(data)

    input_stream = Stream(b"".join(json.dumps(request).encode() + b"\n" for request in requests))
    output_stream = Stream()
    monkeypatch.setattr(inference_main.sys, "stdin", input_stream)
    monkeypatch.setattr(inference_main.sys, "stdout", output_stream)
    enabled = gc.isenabled()
    gc.collect()
    gc.disable()
    try:
        assert inference_main.main() == 0
        messages = [json.loads(line) for line in output_stream.buffer.getvalue().splitlines()]
        assert messages[0]["type"] == "ready"
        completed = [message for message in messages if message["type"] == "generation-done"]
        assert [message["requestId"] for message in completed] == ["lifetime-0", "lifetime-1"]
        assert loads == [[], [False]], "Previous native pipeline remained live at the next load"
        assert all(ref() is None for ref in refs), "Completed native pipeline survived JSONL return"
    finally:
        if enabled:
            gc.enable()
        gc.collect()


@pytest.mark.parametrize("change", ["hash", "size", "missing", "symlink", "fifo", "huge"])
def test_snapshot_refuses_changed_or_unsafe_file_before_tensor_load(
    tmp_path: Path, change: str
) -> None:
    path = tmp_path / "vae.safetensors"
    path.write_bytes((2).to_bytes(8, "little") + b"{}ab")
    vae = _vae(path)
    assert read_vae_snapshot(vae, max_payload_bytes=2) == path.read_bytes()
    if change == "hash":
        path.write_bytes((2).to_bytes(8, "little") + b"{}ac")
    elif change == "size":
        path.write_bytes(path.read_bytes() + b"x")
    elif change in ("missing", "symlink", "fifo"):
        path.unlink()
        if change == "symlink":
            neighbor = tmp_path / "neighbor"
            neighbor.write_bytes((2).to_bytes(8, "little") + b"{}ab")
            path.symlink_to(neighbor)
        elif change == "fifo":
            import os

            os.mkfifo(path)
    else:
        with path.open("wb") as stream:
            stream.write((2).to_bytes(8, "little") + b"{}")
            stream.truncate(8 + 32 * 1024 * 1024 + 1)
        vae = _vae(path)
    with pytest.raises(DerivativeError) as error:
        read_vae_snapshot(vae, max_payload_bytes=0)
    assert error.value.code in (
        "GENERATION_INPUT_CHANGED",
        "INVALID_PATH",
        "GENERATION_VAE_UNSUPPORTED",
    )


def test_public_loader_uses_verified_memory_even_when_path_changes_after_snapshot(
    native: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    torch, diffusers, _make = native
    expected, config, path = _fixture(native, tmp_path)
    exact = _vae(path)
    original_load = diffusers.AutoencoderKL.from_single_file

    def observe(state: Any, **kwargs: Any) -> Any:
        assert isinstance(state, dict)
        assert kwargs["config"] == str(config)
        assert kwargs["subfolder"] == "vae" and kwargs["local_files_only"] is True
        path.write_bytes(b"changed after immutable snapshot")
        return original_load(state, **kwargs)

    monkeypatch.setattr(diffusers.AutoencoderKL, "from_single_file", observe)
    loaded = load_generation_vae(exact, config, diffusers, torch)
    assert path.read_bytes() == b"changed after immutable snapshot"
    assert all(
        torch.equal(loaded.state_dict()[key], tensor)
        for key, tensor in expected.state_dict().items()
    )


@pytest.mark.parametrize(
    "change", ["partial", "extra", "shape", "dtype", "nan", "mixed", "prefix", "overflow"]
)
def test_actual_loader_rejects_unqualified_complete_state_and_never_publishes(
    native: Any, tmp_path: Path, change: str
) -> None:
    torch, diffusers, _make = native
    model, config, path = _fixture(native, tmp_path)
    state = {key: tensor.clone() for key, tensor in model.state_dict().items()}
    if change == "partial":
        del state["decoder.conv_out.bias"]
    elif change == "extra":
        state["encoder.ignored.weight"] = torch.zeros(1)
    elif change == "shape":
        state["encoder.conv_in.weight"] = state["encoder.conv_in.weight"][:1]
    elif change == "dtype":
        state["decoder.conv_out.bias"] = state["decoder.conv_out.bias"].to(torch.int32)
    elif change == "nan":
        state["decoder.conv_out.bias"][0] = float("nan")
    elif change == "mixed":
        state["encoder.down.0.block.0.conv1.weight"] = state.pop(
            "encoder.down_blocks.0.resnets.0.conv1.weight"
        )
    elif change == "prefix":
        state = {"first_stage_model." + key: tensor for key, tensor in state.items()}
    else:
        state["decoder.conv_out.bias"] = torch.full((3,), 1e10, dtype=torch.float32)
    safetensors = cast(Any, importlib.import_module("safetensors.torch"))
    safetensors.save_file(state, str(path))
    if change != "overflow":
        with pytest.raises(DerivativeError) as qualification:
            qualify_vae_state(state, model.state_dict(), model.config, torch)
        assert qualification.value.code == "GENERATION_VAE_UNSUPPORTED"
    with pytest.raises(DerivativeError) as error:
        load_generation_vae(_vae(path), config, diffusers, torch)
    assert error.value.code == "GENERATION_VAE_UNSUPPORTED"
    assert not (tmp_path / "output.png").exists()


def test_original_mapping_cannot_ignore_extra_tensor_even_when_every_native_key_is_present(
    native: Any, tmp_path: Path
) -> None:
    torch, _diffusers, _make = native
    model, _config, _path = _fixture(native, tmp_path, original=True)
    original = _original_state(model.state_dict(), len(model.config.up_block_types))
    converted = qualify_vae_state(original, model.state_dict(), model.config, torch)
    assert set(converted) == set(model.state_dict())
    original["encoder.ignored.weight"] = torch.zeros(1)
    with pytest.raises(DerivativeError, match="complete pinned architecture"):
        qualify_vae_state(original, model.state_dict(), model.config, torch)


@pytest.mark.parametrize(
    "opaque,poison",
    [(False, None), (True, None), (False, "decoder"), (True, "encoder"), (True, "decoder")],
)
@pytest.mark.parametrize("precision", ["Auto", "FP16", "FP32"])
def test_worker_passes_selected_native_vae_to_both_modes_and_precision(
    native: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    opaque: bool,
    precision: str,
    poison: str | None,
) -> None:
    torch, diffusers, make_pipeline = native
    source, config, path = _fixture(native, tmp_path)
    source_state = source.state_dict()
    safetensors = cast(Any, importlib.import_module("safetensors.torch"))
    state = {key: tensor.clone() for key, tensor in source_state.items()}
    state["decoder.conv_out.bias"] = state["decoder.conv_out.bias"] + 0.5
    safetensors.save_file(state, str(path))
    pinned = {"vae/config.json": _digest((config / "vae" / "config.json").read_bytes())}
    monkeypatch.setattr(inference_config, "PINNED_SDXL_FILES", pinned)
    request = generation_request(tmp_path / "stage", opaque)
    exact = _vae(path)
    request["job"]["vae"] = {"path": str(path), "sha256": exact.sha256, "byteSize": exact.byte_size}
    request["job"]["vaePrecision"] = precision
    pipeline = make_pipeline(opaque, True)
    embedded = pipeline.vae
    untouched = {
        name: {key: tensor.clone() for key, tensor in getattr(pipeline, name).state_dict().items()}
        for name in ("unet", "text_encoder", "text_encoder_2")
    }
    observations: list[tuple[str, Any, set[Any]]] = []
    handles: list[Any] = []

    def load(_checkpoint: str, **kwargs: Any) -> Any:
        assert kwargs["config"] == str(config) and kwargs["local_files_only"] is True
        assert kwargs["torch_dtype"] == torch.float16
        selected = kwargs["vae"]
        assert selected is not embedded
        assert torch.equal(selected.decoder.conv_out.bias, state["decoder.conv_out.bias"])
        pipeline.register_modules(vae=selected)
        for name in ("encoder", "quant_conv", "post_quant_conv", "decoder"):
            module = getattr(selected, name)

            def record(module: Any, args: Any, *, name: str = name) -> None:
                observations.append((name, args[0].dtype, {p.dtype for p in module.parameters()}))

            handles.append(module.register_forward_pre_hook(record))
        if poison is not None:

            def nonfinite(_module: Any, _args: Any, output: Any) -> Any:
                return torch.full_like(output, float("nan"))

            handles.append(getattr(selected, poison).register_forward_hook(nonfinite))
        return pipeline

    monkeypatch.setattr(
        diffusers.StableDiffusionXLImg2ImgPipeline
        if opaque
        else diffusers.StableDiffusionXLPipeline,
        "from_single_file",
        load,
    )
    actual_to = pipeline.to

    def cpu_only(device: str) -> Any:
        assert device == "cuda"
        return actual_to("cpu")

    monkeypatch.setattr(pipeline, "to", cpu_only)
    runtime = MLRuntime(torch, diffusers, importlib.import_module("compel"))
    try:
        result = process_inference_request(request, config_dir=config, runtime=runtime)
        if poison is None:
            assert result["type"] == "generation-done", result
            expected_names = {"post_quant_conv", "decoder"}
            if opaque:
                expected_names.update(("encoder", "quant_conv"))
            assert {name for name, _dtype, _params in observations} == expected_names
            with Image.open(request["job"]["output"]["pngPath"]) as image:
                assert image.size == (16, 16)
        else:
            assert result["type"] == "error" and result["code"] == "GENERATION_WORKER_FAILED", (
                result
            )
            assert isinstance(result["message"], str)
            assert "VAE inference produced non-finite" in result["message"]
            assert not Path(request["job"]["output"]["pngPath"]).exists()
        dtype = torch.float16 if precision == "FP16" else torch.float32
        assert all(actual == dtype and params == {dtype} for _name, actual, params in observations)
        assert not embedded.encoder._forward_hooks and not embedded.decoder._forward_hooks
        for name, before in untouched.items():
            assert all(
                torch.equal(before[key], tensor)
                for key, tensor in getattr(pipeline, name).state_dict().items()
            )
    finally:
        for handle in handles:
            handle.remove()
    assert all(
        not module._forward_hooks
        for module in (
            pipeline.vae.encoder,
            pipeline.vae.quant_conv,
            pipeline.vae.post_quant_conv,
            pipeline.vae.decoder,
        )
    )
