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
    SdxlConditioning,
    build_sdxl_conditioning,
    generate_illustrious_txt2img,
    normalize_compel_prompt,
    require_dependency_versions,
    run_sdxl_pipeline,
    select_inference_scheduler,
    validate_compel_prompt,
    validate_generation_assets,
    validate_pipeline_prompts,
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
    runtime = MLRuntime(torch=torch, diffusers=diffusers, compel=ModuleType("fake_compel"))

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
    with pytest.raises(DerivativeError):
        require_dependency_versions({**PINNED_ML_VERSIONS, "compel": "2.4.1"})


class _FakeTokenizer:
    model_max_length = 77

    def encode(self, prompt: str, *, add_special_tokens: bool, truncation: bool) -> list[int]:
        assert add_special_tokens and not truncation
        return list(range(309 if prompt == "too long" else 78 if prompt == "long" else 77))


def test_compel_prompt_gate_accepts_weighting_and_long_text_but_bounds_it() -> None:
    tokenizer = _FakeTokenizer()
    for prompt in ("plain prompt", "(portrait)1.2", "portrait++", "long"):
        validate_compel_prompt(prompt, tokenizer)
    for prompt in (
        "[background]",
        "<lora:model:1>",
        "portrait.swap(background)",
        '("portrait", "background").and()',
        "withLora(style, 0.7) portrait",
        "too long",
    ):
        with pytest.raises(DerivativeError) as error:
            validate_compel_prompt(prompt, tokenizer)
        assert error.value.code == "GENERATION_PROMPT_UNSUPPORTED"


def test_common_attention_weight_is_translated_and_ambiguous_forms_fail_closed() -> None:
    assert normalize_compel_prompt("portrait, (red hair:1.2), rim light") == (
        "portrait, (red hair)1.2, rim light"
    )
    assert normalize_compel_prompt("(tag:+.5) and (eyes:0.8)") == "(tag).5 and (eyes)0.8"
    assert normalize_compel_prompt("(tag)+1.2") == "(tag)1.2"
    assert normalize_compel_prompt(r"\(tag:1.2\), (tag\:1.2), portrait++") == (
        r"\(tag:1.2\), (tag\:1.2), portrait++"
    )
    assert normalize_compel_prompt("(tag)1.2 and (other)--") == "(tag)1.2 and (other)--"

    for prompt in (
        "(tag:-0.5)",
        "(tag:1e2)",
        "(tag:abc)",
        "(tag:1.2",
        "(tag:1.2)++",
        "(tag:1.2).attend(2)",
        "(tag:1.2)word",
        "(tag:1.2:0.8)",
        "(1:2)",
        "(red (hair:1.2))",
        "(red (hair):1.2)",
        '"(tag:1.2)"',
        "(tag)-0.5",
        "(tag)1e2",
        "(tag)1.2++",
    ):
        with pytest.raises(DerivativeError) as error:
            normalize_compel_prompt(prompt)
        assert error.value.code == "GENERATION_PROMPT_UNSUPPORTED"


def test_real_compel_parser_sees_translated_weight_not_literal_text() -> None:
    parser_module = pytest.importorskip("compel.prompt_parser")
    parser = parser_module.PromptParser()
    raw = parser.parse_conjunction("(tag:1.2)")
    normalized = parser.parse_conjunction(normalize_compel_prompt("(tag:1.2)"))
    canonical = parser.parse_conjunction("(tag)1.2")
    assert repr(normalized) == repr(canonical)
    assert "tag:1" in repr(raw)
    assert "@1.0" in repr(raw)
    assert "Fragment:'tag'@1.2" in repr(normalized)


def test_both_sdxl_tokenizers_check_both_prompts(tmp_path: Path) -> None:
    command = _command(tmp_path)

    class _SecondTokenizer(_FakeTokenizer):
        def encode(self, prompt: str, *, add_special_tokens: bool, truncation: bool) -> list[int]:
            assert add_special_tokens and not truncation
            return list(range(309 if prompt == command.negative_prompt else 77))

    pipeline = SimpleNamespace(tokenizer=_FakeTokenizer(), tokenizer_2=_SecondTokenizer())
    with pytest.raises(DerivativeError) as error:
        validate_pipeline_prompts(command, pipeline)
    assert error.value.code == "GENERATION_PROMPT_UNSUPPORTED"


class _ShapeTensor:
    def __init__(self, shape: tuple[int, ...], *, nonzero: bool = True) -> None:
        self.shape = shape
        self.dtype = "float16"
        self.device = "cuda"
        self.nonzero = nonzero

    @property
    def ndim(self) -> int:
        return len(self.shape)


class _ShapeTorch:
    @staticmethod
    def zeros(shape: tuple[int, ...], *, dtype: object, device: object) -> _ShapeTensor:
        assert dtype == "float16" and device == "cuda"
        return _ShapeTensor(shape, nonzero=False)

    @staticmethod
    def cat(parts: tuple[_ShapeTensor, ...], *, dim: int) -> _ShapeTensor:
        shape = list(parts[0].shape)
        axis = dim % len(shape)
        assert all(
            len(part.shape) == len(shape)
            and all(size == shape[index] for index, size in enumerate(part.shape) if index != axis)
            for part in parts
        )
        shape[axis] = sum(part.shape[axis] for part in parts)
        return _ShapeTensor(tuple(shape), nonzero=any(part.nonzero for part in parts))


class _MaskTensor:
    def __init__(self, rows: tuple[tuple[int, ...], ...]) -> None:
        self.rows = rows
        self.shape = (len(rows), len(rows[0]))
        self.dtype = "float16"
        self.device = "cuda"


class _MaskTorch:
    @staticmethod
    def ones(shape: tuple[int, int], *, dtype: object, device: object) -> _MaskTensor:
        assert dtype == "float16" and device == "cuda"
        return _MaskTensor(tuple((1,) * shape[1] for _ in range(shape[0])))

    @staticmethod
    def zeros(shape: tuple[int, int], *, dtype: object, device: object) -> _MaskTensor:
        assert dtype == "float16" and device == "cuda"
        return _MaskTensor(tuple((0,) * shape[1] for _ in range(shape[0])))

    @staticmethod
    def cat(parts: tuple[_MaskTensor, ...], *, dim: int) -> _MaskTensor:
        if dim == 0:
            return _MaskTensor(tuple(row for part in parts for row in part.rows))
        assert dim == 1
        return _MaskTensor(
            tuple(
                tuple(value for part in parts for value in part.rows[index])
                for index in range(parts[0].shape[0])
            )
        )


class _HookHandle:
    def __init__(self, unet: _HookUnet) -> None:
        self.unet = unet

    def remove(self) -> None:
        self.unet.hook = None
        self.unet.remove_count += 1


class _HookUnet:
    def __init__(self) -> None:
        self.config = SimpleNamespace(time_cond_proj_dim=None)
        self.hook: Any = None
        self.register_count = 0
        self.remove_count = 0

    def register_forward_pre_hook(self, hook: Any, *, with_kwargs: bool) -> _HookHandle:
        assert with_kwargs
        assert self.hook is None
        self.hook = hook
        self.register_count += 1
        return _HookHandle(self)


class _MaskPipeline:
    def __init__(self, batch_size: int, *, fail: bool = False, hidden_length: int = 154) -> None:
        self.unet = _HookUnet()
        self.batch_size = batch_size
        self.fail = fail
        self.hidden_length = hidden_length
        self.mask: _MaskTensor | None = None
        self.calls = 0
        self.last_kwargs: dict[str, object] | None = None

    def __call__(self, **kwargs: object) -> object:
        self.calls += 1
        self.last_kwargs = kwargs
        assert kwargs["num_images_per_prompt"] == 1
        if self.unet.hook is not None:
            _, unet_kwargs = self.unet.hook(
                self.unet,
                (object(), object()),
                {
                    "encoder_hidden_states": _ShapeTensor(
                        (self.batch_size, self.hidden_length, 2048)
                    )
                },
            )
            self.mask = cast(_MaskTensor, unet_kwargs["encoder_attention_mask"])
        if self.fail:
            raise RuntimeError("denoising failed")
        return object()


def _conditioned_lengths(positive_length: int, negative_length: int) -> SdxlConditioning:
    length = max(positive_length, negative_length)
    return SdxlConditioning(
        positive=_ShapeTensor((1, length, 2048)),
        negative=_ShapeTensor((1, length, 2048)),
        positive_pooled=_ShapeTensor((1, 1280)),
        negative_pooled=_ShapeTensor((1, 1280)),
        positive_length=positive_length,
        negative_length=negative_length,
    )


def _run_mask_pipeline(
    pipeline: _MaskPipeline,
    conditioning: SdxlConditioning,
    cfg: float,
    *,
    width: int = 64,
    height: int = 64,
) -> object:
    return run_sdxl_pipeline(
        pipeline,
        conditioning,
        width=width,
        height=height,
        steps=2,
        cfg_scale=cfg,
        generator=object(),
        torch=_MaskTorch,
    )


def test_unequal_sdxl_cfg_padding_is_masked_negative_first() -> None:
    pipeline = _MaskPipeline(2)
    _run_mask_pipeline(pipeline, _conditioned_lengths(154, 77), 5)
    assert pipeline.calls == 1
    assert pipeline.mask is not None
    assert pipeline.mask.rows == ((1,) * 77 + (0,) * 77, (1,) * 154)
    assert pipeline.unet.register_count == pipeline.unet.remove_count == 1
    assert pipeline.unet.hook is None


def test_cfg_one_masks_only_the_padded_positive_and_equal_lengths_need_no_hook() -> None:
    positive_only = _MaskPipeline(1)
    _run_mask_pipeline(positive_only, _conditioned_lengths(77, 154), 1)
    assert positive_only.mask is not None
    assert positive_only.mask.rows == ((1,) * 77 + (0,) * 77,)
    assert positive_only.unet.hook is None

    positive_fills_context = _MaskPipeline(1)
    _run_mask_pipeline(positive_fills_context, _conditioned_lengths(154, 77), 1)
    assert positive_fills_context.mask is None
    assert positive_fills_context.unet.register_count == 0

    equal = _MaskPipeline(2, hidden_length=77)
    _run_mask_pipeline(equal, _conditioned_lengths(77, 77), 5)
    assert equal.mask is None
    assert equal.unet.register_count == equal.unet.remove_count == 0


def test_sdxl_mask_hook_is_removed_after_failure_or_bad_unet_shape() -> None:
    failure = _MaskPipeline(2, fail=True)
    with pytest.raises(RuntimeError, match="denoising failed"):
        _run_mask_pipeline(failure, _conditioned_lengths(154, 77), 5)
    assert failure.unet.hook is None
    assert failure.unet.remove_count == 1

    wrong_shape = _MaskPipeline(2, hidden_length=77)
    with pytest.raises(DerivativeError) as error:
        _run_mask_pipeline(wrong_shape, _conditioned_lengths(154, 77), 5)
    assert error.value.code == "GENERATION_WORKER_FAILED"
    assert wrong_shape.unet.hook is None
    assert wrong_shape.unet.remove_count == 1


def test_sdxl_micro_conditioning_stays_at_invoke_defaults_when_output_aspect_changes() -> None:
    for width, height in ((128, 192), (192, 128)):
        pipeline = _MaskPipeline(2, hidden_length=77)
        _run_mask_pipeline(pipeline, _conditioned_lengths(77, 77), 5, width=width, height=height)
        assert pipeline.last_kwargs is not None
        assert (pipeline.last_kwargs["width"], pipeline.last_kwargs["height"]) == (
            width,
            height,
        )
        assert pipeline.last_kwargs["original_size"] == (1024, 1024)
        assert pipeline.last_kwargs["target_size"] == (1024, 1024)
        assert pipeline.last_kwargs["negative_original_size"] == (1024, 1024)
        assert pipeline.last_kwargs["negative_target_size"] == (1024, 1024)
        assert pipeline.last_kwargs["crops_coords_top_left"] == (0, 0)
        assert pipeline.last_kwargs["negative_crops_coords_top_left"] == (0, 0)


def test_two_clip_conditioning_pads_long_positive_and_zeroes_empty_negative(
    tmp_path: Path,
) -> None:
    calls: list[tuple[str, str]] = []

    class _Builder:
        def __init__(self, *, tokenizer: Any, requires_pooled: bool, **kwargs: object) -> None:
            assert kwargs["truncate_long_prompts"] is False
            assert kwargs["split_long_text_mode"] == "sentences"
            assert kwargs["returned_embeddings_type"] == "penultimate"
            self.label = cast(str, tokenizer.label)
            self.pooled = requires_pooled

        def __call__(self, prompt: str) -> _ShapeTensor | tuple[_ShapeTensor, _ShapeTensor]:
            calls.append((self.label, prompt))
            length = 385 if prompt == "overflow" else 154 if self.label == "clip1" else 231
            embeds = _ShapeTensor((1, length, 768 if self.label == "clip1" else 1280))
            return (embeds, _ShapeTensor((1, 1280))) if self.pooled else embeds

    compel = ModuleType("fake_compel")
    compel.Compel = _Builder  # type: ignore[attr-defined]
    compel.ReturnedEmbeddingsType = SimpleNamespace(  # type: ignore[attr-defined]
        PENULTIMATE_HIDDEN_STATES_NON_NORMALIZED="penultimate"
    )
    compel.SplitLongTextMode = SimpleNamespace(SENTENCES="sentences")  # type: ignore[attr-defined]
    torch = ModuleType("fake_torch")
    torch.zeros = _ShapeTorch.zeros  # type: ignore[attr-defined]
    torch.cat = _ShapeTorch.cat  # type: ignore[attr-defined]
    command = replace(
        _command(tmp_path), positive_prompt="(portrait:1.2) with many details", negative_prompt=""
    )
    pipeline = SimpleNamespace(
        tokenizer=SimpleNamespace(
            label="clip1", **{"model_max_length": 77}, encode=_FakeTokenizer().encode
        ),
        tokenizer_2=SimpleNamespace(
            label="clip2", **{"model_max_length": 77}, encode=_FakeTokenizer().encode
        ),
        text_encoder=SimpleNamespace(
            config=SimpleNamespace(max_position_embeddings=77, hidden_size=768),
            dtype="float16",
            device="cuda",
        ),
        text_encoder_2=SimpleNamespace(
            config=SimpleNamespace(max_position_embeddings=77, hidden_size=1280),
            dtype="float16",
            device="cuda",
        ),
    )
    conditioning = build_sdxl_conditioning(
        command,
        pipeline,
        MLRuntime(torch=torch, diffusers=ModuleType("fake_diffusers"), compel=compel),
    )
    assert calls == [
        ("clip1", "(portrait)1.2 with many details"),
        ("clip2", "(portrait)1.2 with many details"),
    ]
    assert conditioning.positive.shape == conditioning.negative.shape == (1, 231, 2048)
    assert (conditioning.positive_length, conditioning.negative_length) == (231, 77)
    assert conditioning.positive_pooled.shape == conditioning.negative_pooled.shape == (1, 1280)
    assert conditioning.positive.nonzero
    assert not conditioning.negative.nonzero
    assert conditioning.positive_pooled.nonzero
    assert not conditioning.negative_pooled.nonzero

    calls.clear()
    negative_only = replace(command, positive_prompt="", negative_prompt="blur--")
    negative_conditioning = build_sdxl_conditioning(
        negative_only,
        pipeline,
        MLRuntime(torch=torch, diffusers=ModuleType("fake_diffusers"), compel=compel),
    )
    assert calls == [("clip1", "blur--"), ("clip2", "blur--")]
    assert (
        negative_conditioning.positive.shape
        == negative_conditioning.negative.shape
        == (
            1,
            231,
            2048,
        )
    )
    assert negative_conditioning.negative_pooled.shape == (1, 1280)
    assert (negative_conditioning.positive_length, negative_conditioning.negative_length) == (
        77,
        231,
    )
    assert not negative_conditioning.positive.nonzero
    assert negative_conditioning.negative.nonzero

    with pytest.raises(DerivativeError, match="Invalid SDXL conditioning shape") as error:
        build_sdxl_conditioning(
            replace(command, positive_prompt="overflow"),
            pipeline,
            MLRuntime(torch=torch, diffusers=ModuleType("fake_diffusers"), compel=compel),
        )
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
    runtime = MLRuntime(
        torch=ModuleType("fake_torch"),
        diffusers=ModuleType("fake_diffusers"),
        compel=ModuleType("fake_compel"),
    )
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
    runtime = MLRuntime(
        torch=ModuleType("fake_torch"), diffusers=diffusers, compel=ModuleType("fake_compel")
    )
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
            assert calls[-1][1]["noise_sampler_seed"] == command.seed

    for seed in (0, 104729):
        select_inference_scheduler(
            replace(command, scheduler="dpmpp_sde", seed=seed), pipeline, runtime
        )
        assert calls[-1][1]["noise_sampler_seed"] == seed


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
