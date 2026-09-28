"""The qualified GPU entrypoint must reject changed inputs and silent semantic fallbacks."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from dataclasses import replace
from pathlib import Path
from types import ModuleType, SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import inference_config
from imagegen_worker.compositor import ComposeTargetRequest, compose_target
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.inference import (
    PINNED_ML_VERSIONS,
    MLRuntime,
    generate_illustrious_txt2img,
    require_dependency_versions,
    select_inference_scheduler,
    validate_generation_assets,
    validate_pipeline_prompts,
    validate_plain_prompt,
)
from imagegen_worker.inference_config import verify_pinned_config
from imagegen_worker.inference_main import inference_ready_message, process_inference_request
from imagegen_worker.protocol import GenerateIllustriousTxt2ImgCommand, parse_request


def _sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _request(
    staging: Path, checkpoint: Path, target_hash: str, target_size: int
) -> dict[str, object]:
    return {
        "type": "generate-illustrious-txt2img",
        "protocolVersion": "1",
        "requestId": "generation-1",
        "job": {
            "schemaVersion": 1,
            "checkpoint": {
                "path": str(checkpoint),
                "sha256": _sha256(checkpoint.read_bytes()),
                "predictionType": "epsilon",
            },
            "target": {
                "path": str(staging / "target.png"),
                "sha256": target_hash,
                "byteSize": target_size,
                "width": 64,
                "height": 64,
                "iccSha256": _sha256(SRGB_ICC_PROFILE),
            },
            "bbox": {"x": -64, "y": 128, "width": 64, "height": 64},
            "prompts": {"positive": "portrait", "negative": "blur"},
            "sampling": {"steps": 2, "cfgScale": 5, "seed": 42, "scheduler": "dpmpp_2m_k"},
            "output": {"stagingRoot": str(staging), "pngPath": str(staging / "result.png")},
        },
    }


def _command(tmp_path: Path) -> GenerateIllustriousTxt2ImgCommand:
    staging = tmp_path / "staging"
    staging.mkdir(mode=0o700)
    checkpoint = tmp_path / "checkpoint.safetensors"
    checkpoint.write_bytes(b"checkpoint identity")
    target_path = staging / "target.png"
    compose_target(
        ComposeTargetRequest(
            layers=(),
            bbox={"x": -64, "y": 128, "width": 64, "height": 64},
            staging_root=staging,
            target_png_path=target_path,
        )
    )
    target = target_path.read_bytes()
    command = parse_request(_request(staging, checkpoint, _sha256(target), len(target)))
    assert isinstance(command, GenerateIllustriousTxt2ImgCommand)
    return command


def test_real_composed_txt2img_target_is_accepted_and_opaque_neighbor_is_rejected(
    tmp_path: Path,
) -> None:
    command = _command(tmp_path)
    validate_generation_assets(command)
    assert not command.output_path.exists()

    Image.new("RGBA", (64, 64), (23, 45, 67, 255)).save(
        command.target_path, format="PNG", icc_profile=SRGB_ICC_PROFILE
    )
    changed = command.target_path.read_bytes()
    opaque = replace(command, target_sha256=_sha256(changed), target_byte_size=len(changed))
    with pytest.raises(DerivativeError, match="transparent") as error:
        validate_generation_assets(opaque)
    assert error.value.code == "GENERATION_TARGET_UNSUPPORTED"
    assert not command.output_path.exists()


def test_exact_model_and_target_hashes_are_rechecked_before_output(tmp_path: Path) -> None:
    command = _command(tmp_path)
    command.checkpoint_path.write_bytes(b"changed checkpoint")
    with pytest.raises(DerivativeError, match="Checkpoint changed") as checkpoint_error:
        validate_generation_assets(command)
    assert checkpoint_error.value.code == "GENERATION_INPUT_CHANGED"

    stable = replace(command, checkpoint_sha256=_sha256(command.checkpoint_path.read_bytes()))
    command.target_path.write_bytes(command.target_path.read_bytes() + b"changed")
    with pytest.raises(DerivativeError, match="Target changed") as target_error:
        validate_generation_assets(stable)
    assert target_error.value.code == "GENERATION_INPUT_CHANGED"
    assert not command.output_path.exists()


def test_unsafe_or_preexisting_output_path_never_replaced(tmp_path: Path) -> None:
    command = _command(tmp_path)
    command.output_path.write_bytes(b"user data")
    with pytest.raises(DerivativeError) as error:
        validate_generation_assets(command)
    assert error.value.code == "OUTPUT_UNAVAILABLE"
    assert command.output_path.read_bytes() == b"user data"

    outside = tmp_path / "outside.png"
    with pytest.raises(DerivativeError) as error:
        validate_generation_assets(replace(command, output_path=outside))
    assert error.value.code == "INVALID_PATH"


def test_pinned_config_requires_every_exact_local_file(tmp_path: Path) -> None:
    root = tmp_path / "config"
    root.mkdir()
    (root / "model_index.json").write_bytes(b"official snapshot")
    pins = {
        "model_index.json": _sha256(b"official snapshot"),
        "tokenizer/vocab.json": _sha256(b"vocab"),
    }
    with pytest.raises(DerivativeError, match="incomplete"):
        verify_pinned_config(str(root), pinned_files=pins)
    (root / "tokenizer").mkdir()
    (root / "tokenizer" / "vocab.json").write_bytes(b"vocab")
    assert verify_pinned_config(str(root), pinned_files=pins) == root
    (root / "tokenizer" / "added_tokens.json").write_bytes(b"{}")
    with pytest.raises(DerivativeError, match="incomplete"):
        verify_pinned_config(str(root), pinned_files=pins)
    (root / "tokenizer" / "added_tokens.json").unlink()
    (root / "tokenizer" / "vocab.json").write_bytes(b"tampered")
    with pytest.raises(DerivativeError, match="changed"):
        verify_pinned_config(str(root), pinned_files=pins)


def test_config_changed_after_ready_or_during_load_never_produces_output(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    command = _command(tmp_path)
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    config_file = config_dir / "model_index.json"
    config_file.write_bytes(b"pinned config")
    monkeypatch.setattr(
        inference_config,
        "PINNED_SDXL_FILES",
        {"model_index.json": _sha256(b"pinned config")},
    )
    assert verify_pinned_config(str(config_dir)) == config_dir  # startup state
    torch = ModuleType("fake_torch")
    torch.__dict__["float16"] = object()
    diffusers = ModuleType("fake_diffusers")
    calls = 0

    class _Loader:
        @staticmethod
        def from_single_file(*_args: object, **_kwargs: object) -> object:
            nonlocal calls
            calls += 1
            config_file.write_bytes(b"changed during load")
            return object()

    diffusers.__dict__["StableDiffusionXLPipeline"] = _Loader
    runtime = MLRuntime(torch=torch, diffusers=diffusers)

    config_file.write_bytes(b"changed after ready")
    with pytest.raises(DerivativeError, match="config changed"):
        generate_illustrious_txt2img(command, config_dir=config_dir, runtime=runtime)
    assert calls == 0
    assert not command.output_path.exists()

    config_file.write_bytes(b"pinned config")
    with pytest.raises(DerivativeError, match="config changed"):
        generate_illustrious_txt2img(command, config_dir=config_dir, runtime=runtime)
    assert calls == 1
    assert not command.output_path.exists()


def test_version_gate_accepts_only_pinned_ml_stack() -> None:
    require_dependency_versions({**PINNED_ML_VERSIONS, "torch": "2.7.1+cu128"})
    with pytest.raises(DerivativeError) as error:
        require_dependency_versions({**PINNED_ML_VERSIONS, "diffusers": "0.41.0"})
    assert error.value.code == "INFERENCE_UNAVAILABLE"
    with pytest.raises(DerivativeError):
        require_dependency_versions(
            {key: value for key, value in PINNED_ML_VERSIONS.items() if key != "torchsde"}
        )


class _FakeTokenizer:
    model_max_length = 77

    def encode(self, prompt: str, *, add_special_tokens: bool, truncation: bool) -> list[int]:
        assert add_special_tokens and not truncation
        return list(range(78 if prompt == "too long" else 77))


def test_plain_clip_prompt_gate_rejects_weighting_and_truncation() -> None:
    tokenizer = _FakeTokenizer()
    validate_plain_prompt("plain prompt", tokenizer)
    for prompt in ("(portrait:1.2)", "[background]", "<lora:model:1>", "portrait++", "too long"):
        with pytest.raises(DerivativeError) as error:
            validate_plain_prompt(prompt, tokenizer)
        assert error.value.code == "GENERATION_PROMPT_UNSUPPORTED"


def test_both_sdxl_tokenizers_check_both_prompts(tmp_path: Path) -> None:
    command = _command(tmp_path)

    class _SecondTokenizer(_FakeTokenizer):
        def encode(self, prompt: str, *, add_special_tokens: bool, truncation: bool) -> list[int]:
            assert add_special_tokens and not truncation
            return list(range(78 if prompt == command.negative_prompt else 77))

    pipeline = SimpleNamespace(tokenizer=_FakeTokenizer(), tokenizer_2=_SecondTokenizer())
    with pytest.raises(DerivativeError) as error:
        validate_pipeline_prompts(command, pipeline)
    assert error.value.code == "GENERATION_PROMPT_UNSUPPORTED"


def test_inference_entrypoint_keeps_request_correlation_on_unsupported_prediction(
    tmp_path: Path,
) -> None:
    command = _command(tmp_path)
    request = _request(
        command.staging_root,
        command.checkpoint_path,
        command.target_sha256,
        command.target_byte_size,
    )
    job = cast(dict[str, Any], request["job"])
    cast(dict[str, object], job["checkpoint"])["predictionType"] = "sample"
    runtime = MLRuntime(torch=ModuleType("fake_torch"), diffusers=ModuleType("fake_diffusers"))
    result = process_inference_request(request, config_dir=tmp_path, runtime=runtime)
    assert result == {
        "type": "error",
        "protocolVersion": "1",
        "requestId": "generation-1",
        "code": "GENERATION_PREDICTION_UNSUPPORTED",
        "message": "Sample prediction is not qualified yet.",
    }
    assert not command.output_path.exists()


def test_inference_scheduler_matrix_has_no_implicit_prediction_fallback(tmp_path: Path) -> None:
    command = _command(tmp_path)
    calls: list[tuple[str, dict[str, object]]] = []

    class _Scheduler:
        def __init__(self, name: str) -> None:
            self.name = name

        def from_config(self, _config: object, **kwargs: object) -> str:
            calls.append((self.name, kwargs))
            return self.name

    diffusers = ModuleType("fake_diffusers")
    diffusers.__dict__.update(
        {
            "EulerAncestralDiscreteScheduler": _Scheduler("euler"),
            "DPMSolverMultistepScheduler": _Scheduler("2m"),
            "DPMSolverSDEScheduler": _Scheduler("sde"),
        }
    )
    runtime = MLRuntime(torch=ModuleType("fake_torch"), diffusers=diffusers)
    pipeline = SimpleNamespace(scheduler=SimpleNamespace(config={"prediction_type": "epsilon"}))
    expected = {
        "euler_a": ("euler", False),
        "dpmpp_2m": ("2m", False),
        "dpmpp_2m_k": ("2m", True),
        "dpmpp_sde": ("sde", False),
        "dpmpp_sde_k": ("sde", True),
    }
    for key, (name, karras) in expected.items():
        actual = select_inference_scheduler(
            replace(command, scheduler=cast(Any, key), prediction_type="v_prediction"),
            pipeline,
            runtime,
        )
        assert actual == name
        assert calls[-1][1]["prediction_type"] == "v_prediction"
        if key != "euler_a":
            assert calls[-1][1]["use_karras_sigmas"] is karras
        if key.startswith("dpmpp_sde"):
            assert calls[-1][1]["noise_sampler_seed"] == 0


def test_separate_entrypoint_refuses_ready_without_offline_config() -> None:
    environment = os.environ.copy()
    environment.pop("IGS_SDXL_CONFIG_DIR", None)
    result = subprocess.run(
        [sys.executable, "-I", "-m", "imagegen_worker.inference_main"],
        text=True,
        capture_output=True,
        env=environment,
        timeout=15,
        check=False,
    )
    assert result.returncode == 78
    assert result.stdout == ""
    assert "offline SDXL config" in result.stderr
    assert inference_ready_message()["workerVersion"] == "0.2.0"
    assert inference_ready_message()["runtimeProfile"] == "linux-nvidia"
    assert json.loads(json.dumps(inference_ready_message()))["capabilities"] == [
        "illustrious-txt2img"
    ]
