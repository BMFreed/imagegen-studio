"""Exact textual inversion through actual pinned CLIP/Compel/Diffusers CPU modules.

The encoders have the production widths; the small random layers are native
mechanical fixtures, not trained-model or GPU image-quality evidence.
"""

from __future__ import annotations

import hashlib
import importlib
import importlib.metadata
import json
import os
from collections.abc import Callable, Generator
from dataclasses import replace
from pathlib import Path
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import inference_config
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.inference import (
    MLRuntime,
    build_sdxl_conditioning,
    img2img_pipeline_class,
    run_sdxl_pipeline,
)
from imagegen_worker.inference_embeddings import (
    load_generation_embeddings,
    masked_embedding_prompts,
    qualify_embedding_state,
    read_embedding_snapshot,
)
from imagegen_worker.inference_main import process_inference_request
from imagegen_worker.protocol import (
    GenerateIllustriousTxt2ImgCommand,
    GenerationEmbedding,
    parse_request,
)
from test_sdxl_vae_precision import generation_request


@pytest.fixture
def native() -> Generator[tuple[Any, MLRuntime, Callable[[], Any]]]:
    torch = pytest.importorskip("torch")
    diffusers = pytest.importorskip("diffusers")
    transformers = pytest.importorskip("transformers")
    compel = pytest.importorskip("compel")
    for name, version in (
        ("diffusers", "0.40.0"),
        ("compel", "2.4.0"),
        ("transformers", "5.5.4"),
    ):
        assert importlib.metadata.version(name) == version
    previous = torch.get_num_threads()
    torch.set_num_threads(1)

    def make() -> Any:
        with torch.random.fork_rng(devices=[]):
            torch.manual_seed(73)
            byte_level = importlib.import_module("tokenizers.pre_tokenizers").ByteLevel
            chars = sorted(byte_level.alphabet())
            vocab = {
                word: index
                for index, word in enumerate(
                    ["<|startoftext|>", "<|endoftext|>"] + chars + [char + "</w>" for char in chars]
                )
            }

            def encoder(width: int, projected: bool) -> Any:
                config = transformers.CLIPTextConfig(
                    vocab_size=len(vocab),
                    hidden_size=width,
                    intermediate_size=32,
                    num_hidden_layers=2,
                    num_attention_heads=4,
                    max_position_embeddings=77,
                    projection_dim=width,
                    bos_token_id=0,
                    eos_token_id=1,
                    pad_token_id=1,
                )
                cls = (
                    transformers.CLIPTextModelWithProjection
                    if projected
                    else transformers.CLIPTextModel
                )
                return cls(config).eval()

            pipeline = diffusers.StableDiffusionXLPipeline(
                vae=diffusers.AutoencoderKL(
                    in_channels=3,
                    out_channels=3,
                    down_block_types=("DownEncoderBlock2D",),
                    up_block_types=("UpDecoderBlock2D",),
                    block_out_channels=(8,),
                    layers_per_block=1,
                    latent_channels=4,
                    norm_num_groups=4,
                    sample_size=16,
                ),
                text_encoder=encoder(768, False),
                text_encoder_2=encoder(1280, True),
                tokenizer=transformers.CLIPTokenizer(vocab=vocab, merges=[], model_max_length=77),
                tokenizer_2=transformers.CLIPTokenizer(vocab=vocab, merges=[], model_max_length=77),
                unet=diffusers.UNet2DConditionModel(
                    sample_size=16,
                    in_channels=4,
                    out_channels=4,
                    layers_per_block=1,
                    block_out_channels=(8,),
                    down_block_types=("CrossAttnDownBlock2D",),
                    up_block_types=("CrossAttnUpBlock2D",),
                    cross_attention_dim=2048,
                    attention_head_dim=2,
                    addition_embed_type="text_time",
                    addition_time_embed_dim=4,
                    projection_class_embeddings_input_dim=1304,
                    norm_num_groups=4,
                ),
                scheduler=diffusers.DPMSolverMultistepScheduler(),
                add_watermarker=False,
            )
            pipeline.set_progress_bar_config(disable=True)
            return pipeline

    try:
        yield torch, MLRuntime(torch, diffusers, compel), make
    finally:
        torch.set_num_threads(previous)


def state(torch: Any, count: int = 3, *, sign: int = 1, dtype: Any = None) -> dict[str, Any]:
    # Different vectors and different widths exercise every native loaded row.
    return {
        key: (torch.sin(torch.arange(count * width).reshape(count, width) * 0.017) * 0.6 * sign).to(
            dtype=dtype or torch.float32
        )
        for key, width in (("clip_l", 768), ("clip_g", 1280))
    }


def saved(
    root: Path, tensors: dict[str, Any], token: str = "<Case-Sensitive>", name: str = "embedding"
) -> GenerationEmbedding:
    safetensors = pytest.importorskip("safetensors.torch")
    path = root / f"{name}.safetensors"
    safetensors.save_file(tensors, str(path))
    data = path.read_bytes()
    return GenerationEmbedding(token, path, hashlib.sha256(data).hexdigest(), len(data))


def wire(entry: GenerationEmbedding) -> dict[str, object]:
    return {
        "token": entry.token,
        "path": str(entry.path),
        "sha256": entry.sha256,
        "byteSize": entry.byte_size,
    }


def _command(root: Path) -> GenerateIllustriousTxt2ImgCommand:
    return GenerateIllustriousTxt2ImgCommand(
        request_id="embedding-native",
        checkpoint_path=root / "checkpoint.safetensors",
        checkpoint_sha256="a" * 64,
        prediction_type="epsilon",
        target_path=root / "target.png",
        target_sha256="a" * 64,
        target_byte_size=1,
        target_icc_sha256="a" * 64,
        width=16,
        height=16,
        bbox={"x": 0, "y": 0, "width": 16, "height": 16},
        positive_prompt="portrait",
        negative_prompt="blur",
        steps=2,
        cfg_scale=5,
        seed=42,
        scheduler="dpmpp_2m",
        staging_root=root,
        output_path=root / "output.png",
    )


@pytest.mark.parametrize("opaque", [False, True])
def test_wire_exact_polarity_bindings_and_neutral_old_job(tmp_path: Path, opaque: bool) -> None:
    request = generation_request(tmp_path / "stage", opaque=opaque)
    original = parse_request(request)
    assert isinstance(original, GenerateIllustriousTxt2ImgCommand)
    assert original.positive_embeddings == original.negative_embeddings == ()
    job = cast(dict[str, Any], request["job"])
    positive = GenerationEmbedding("<same>", tmp_path / "positive.safetensors", "a" * 64, 1024)
    negative = replace(positive, path=tmp_path / "negative.safetensors", sha256="b" * 64)
    job["embeddings"] = {"positive": [wire(positive)], "negative": [wire(negative)]}
    parsed = parse_request(request)
    assert isinstance(parsed, GenerateIllustriousTxt2ImgCommand)
    assert parsed.positive_embeddings == (positive,)
    assert parsed.negative_embeddings == (negative,)
    job["embeddings"] = {"positive": [], "negative": []}
    assert parse_request(request) == original


@pytest.mark.parametrize(
    "invalid",
    [
        None,
        {},
        {"positive": []},
        {"positive": [], "negative": [], "extra": []},
        {"positive": None, "negative": []},
        {"positive": {}, "negative": []},
    ],
)
def test_wire_rejects_invalid_pairs(tmp_path: Path, invalid: object) -> None:
    request = generation_request(tmp_path / "stage", opaque=False)
    cast(dict[str, object], request["job"])["embeddings"] = invalid
    with pytest.raises(DerivativeError) as error:
        parse_request(request)
    assert error.value.code == "INVALID_REQUEST"


@pytest.mark.parametrize(
    "field,value",
    [
        ("token", ""),
        ("token", "\x00"),
        ("token", "x" * 16385),
        ("token", "\ud800"),
        ("path", "relative.safetensors"),
        ("sha256", "b"),
        ("byteSize", 0),
        ("byteSize", True),
        ("extra", 1),
    ],
)
def test_wire_rejects_bad_descriptor(tmp_path: Path, field: str, value: object) -> None:
    request = generation_request(tmp_path / "stage", opaque=False)
    entry = wire(GenerationEmbedding("<token>", tmp_path / "embedding", "a" * 64, 16))
    entry[field] = value
    cast(dict[str, object], request["job"])["embeddings"] = {"positive": [entry], "negative": []}
    with pytest.raises(DerivativeError) as error:
        parse_request(request)
    assert error.value.code == "INVALID_REQUEST"


def test_wire_duplicate_token_and_excessive_binding_count(tmp_path: Path) -> None:
    request = generation_request(tmp_path / "stage", opaque=False)
    entry = wire(GenerationEmbedding("<token>", tmp_path / "embedding", "a" * 64, 16))
    for entries in ([entry, entry], [{**entry, "token": str(i)} for i in range(301)]):
        cast(dict[str, object], request["job"])["embeddings"] = {
            "positive": entries,
            "negative": [],
        }
        with pytest.raises(DerivativeError) as error:
            parse_request(request)
        assert error.value.code == "INVALID_REQUEST"


@pytest.mark.parametrize("dtype", ["float16", "bfloat16", "float32"])
@pytest.mark.parametrize("single_rank", [1, 2])
def test_verified_native_singleton_and_dtypes(
    tmp_path: Path, native: Any, dtype: str, single_rank: int
) -> None:
    torch, runtime, make = native
    tensors = state(torch, 1, dtype=getattr(torch, dtype))
    if single_rank == 1:
        tensors = {key: value[0] for key, value in tensors.items()}
    entry = saved(tmp_path, tensors)
    assert read_embedding_snapshot(entry) == entry.path.read_bytes()
    pipeline = make()
    command = replace(_command(tmp_path), positive_prompt=entry.token, positive_embeddings=(entry,))
    inputs = load_generation_embeddings(command, pipeline, torch)
    for key, tokenizer, encoder in (
        ("clip_l", pipeline.tokenizer, pipeline.text_encoder),
        ("clip_g", pipeline.tokenizer_2, pipeline.text_encoder_2),
    ):
        vector = encoder.get_input_embeddings().weight[
            tokenizer.convert_tokens_to_ids(inputs.prompts[0])
        ]
        assert torch.equal(vector, tensors[key].reshape(1, -1)[0].float())
    conditioned = build_sdxl_conditioning(command, pipeline, runtime, embedding_inputs=inputs)
    assert conditioned.positive.shape == (1, 77, 2048)
    assert bool(torch.isfinite(conditioned.positive).all())


@pytest.mark.parametrize("kind", ["missing", "symlink", "fifo", "digest", "size"])
def test_exact_snapshot_refuses_changed_or_nonregular_files(tmp_path: Path, kind: str) -> None:
    path = tmp_path / "weights.safetensors"
    path.write_bytes(b"not a tensor")
    entry = GenerationEmbedding(
        "<t>", path, hashlib.sha256(path.read_bytes()).hexdigest(), path.stat().st_size
    )
    if kind in {"missing", "symlink", "fifo"}:
        path.unlink()
        if kind == "symlink":
            other = tmp_path / "other"
            other.write_bytes(b"not a tensor")
            path.symlink_to(other)
        elif kind == "fifo":
            os.mkfifo(path)
    elif kind == "digest":
        # A genuine valid header is necessary to reach the digest guard.
        torch = pytest.importorskip("torch")
        entry = replace(saved(tmp_path, state(torch)), sha256="a" * 64)
    else:
        entry = replace(entry, byte_size=entry.byte_size + 1)
    with pytest.raises(DerivativeError) as error:
        read_embedding_snapshot(entry)
    assert error.value.code == ("INVALID_PATH" if kind == "symlink" else "GENERATION_INPUT_CHANGED")


@pytest.mark.parametrize(
    "kind", ["single", "extra", "width", "count", "rank", "int", "nan", "inf", "limit"]
)
def test_unsupported_native_tensor_profiles(tmp_path: Path, kind: str) -> None:
    torch = pytest.importorskip("torch")
    tensors = state(torch)
    if kind == "single":
        del tensors["clip_g"]
    elif kind == "extra":
        tensors["emb_params"] = torch.ones(1)
    elif kind == "width":
        tensors["clip_g"] = torch.ones(3, 768)
    elif kind == "count":
        tensors["clip_g"] = torch.ones(2, 1280)
    elif kind == "rank":
        tensors["clip_l"] = torch.ones(1, 3, 768)
    elif kind == "int":
        tensors["clip_l"] = tensors["clip_l"].long()
    elif kind == "limit":
        tensors = state(torch, 301)
    else:
        tensors["clip_g"][0, 0] = float(kind)
    entry = saved(tmp_path, tensors)
    with pytest.raises(DerivativeError) as error:
        if kind in {"nan", "inf"}:
            qualify_embedding_state(tensors, torch)
        else:
            read_embedding_snapshot(entry)
    assert error.value.code == "GENERATION_EMBEDDING_UNSUPPORTED"


def test_invalid_safetensors_duplicate_header_fields(tmp_path: Path) -> None:
    path = tmp_path / "duplicate.safetensors"
    header = b'{"clip_l":{},"clip_l":{},"clip_g":{}}'
    path.write_bytes(len(header).to_bytes(8, "little") + header + b"data")
    entry = GenerationEmbedding(
        "<t>", path, hashlib.sha256(path.read_bytes()).hexdigest(), path.stat().st_size
    )
    with pytest.raises(DerivativeError, match="duplicate fields"):
        read_embedding_snapshot(entry)


def test_same_literal_different_signs_preserves_all_vectors_and_attention(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    torch, runtime, make = native
    positive = saved(tmp_path, state(torch), name="positive")
    negative = saved(tmp_path, state(torch, sign=-1), name="negative")
    command = replace(
        _command(tmp_path),
        positive_prompt=f"portrait ({positive.token}:1.4)",
        negative_prompt=f"blur {negative.token}",
        positive_embeddings=(positive,),
        negative_embeddings=(negative,),
    )
    pipeline = make()
    calls: list[int] = []
    original = pipeline.load_textual_inversion

    def tracked(*args: Any, **kwargs: Any) -> Any:
        calls.append(len(args[0]))
        return original(*args, **kwargs)

    monkeypatch.setattr(pipeline, "load_textual_inversion", tracked)
    inputs = load_generation_embeddings(command, pipeline, torch)
    assert calls == [2, 2]
    assert inputs.prompts[0] != inputs.prompts[1]
    assert command.positive_prompt == "portrait (<Case-Sensitive>:1.4)"
    for key, tokenizer, encoder, manager in (
        ("clip_l", pipeline.tokenizer, pipeline.text_encoder, inputs.managers[0]),
        ("clip_g", pipeline.tokenizer_2, pipeline.text_encoder_2, inputs.managers[1]),
    ):
        for sign_index, source in enumerate((state(torch), state(torch, sign=-1))):
            alias = f"igs_ti_private_{sign_index}"
            ids = [
                tokenizer.convert_tokens_to_ids(alias if i == 0 else f"{alias}_{i}")
                for i in range(3)
            ]
            assert manager.expand_textual_inversion_token_ids_if_necessary([ids[0]]) == ids
            assert torch.equal(encoder.get_input_embeddings().weight[ids], source[key])
    weighted = build_sdxl_conditioning(command, pipeline, runtime, embedding_inputs=inputs)
    unweighted = build_sdxl_conditioning(
        replace(command, positive_prompt=f"portrait {positive.token}"),
        pipeline,
        runtime,
        embedding_inputs=replace(inputs, prompts=("portrait igs_ti_private_0", inputs.prompts[1])),
    )
    other_negative = build_sdxl_conditioning(
        command,
        pipeline,
        runtime,
        embedding_inputs=replace(inputs, prompts=(inputs.prompts[0], "blur igs_ti_private_0")),
    )
    assert not torch.equal(weighted.positive, unweighted.positive)
    assert not torch.equal(weighted.negative, other_negative.negative)
    assert not torch.equal(weighted.negative_pooled, other_negative.negative_pooled)
    assert bool(torch.isfinite(weighted.positive).all())


def test_literal_case_boundaries_longest_crossing_ranges(tmp_path: Path) -> None:
    base = GenerationEmbedding("legacy-token", tmp_path / "e", "a" * 64, 1)
    command = replace(
        _command(tmp_path),
        positive_prompt="legacy-tokenized legacy-token",
        positive_embeddings=(base,),
    )
    assert masked_embedding_prompts(command)[0] == "legacy-tokenized igs_embedding"
    with pytest.raises(DerivativeError, match="no active exact literal"):
        masked_embedding_prompts(replace(command, positive_prompt="LEGACY-token"))
    # Punctuation edges permit genuine crossing spans under ASCII word boundaries.
    short = replace(base, token="ab:")
    long = replace(base, token=":cde")
    crossing = replace(
        command, positive_prompt="ab:cde ab: :cde", positive_embeddings=(short, long)
    )
    assert masked_embedding_prompts(crossing)[0] == "abigs_embedding igs_embedding igs_embedding"
    astral = replace(
        command,
        positive_prompt="😀:ab 😀: :ab",
        positive_embeddings=(replace(base, token="😀:"), replace(base, token=":ab")),
    )
    assert masked_embedding_prompts(astral)[0] == "igs_embeddingab igs_embedding igs_embedding"
    with pytest.raises(DerivativeError, match="one exact binding"):
        masked_embedding_prompts(
            replace(command, positive_embeddings=(base, replace(base, sha256="b" * 64)))
        )


def test_private_alias_skips_native_normalization_collision(tmp_path: Path, native: Any) -> None:
    torch, _, make = native
    entry = saved(tmp_path, state(torch))
    command = replace(
        _command(tmp_path),
        positive_prompt=f"IGS_TI_PRIVATE_0 {entry.token}",
        positive_embeddings=(entry,),
    )
    inputs = load_generation_embeddings(command, make(), torch)
    assert inputs.prompts[0] == "IGS_TI_PRIVATE_0 igs_ti_private_1"


@pytest.mark.parametrize("empty_sign", ["positive", "negative"])
def test_empty_opposite_prompt_preserves_existing_zero_conditioning(
    tmp_path: Path, native: Any, empty_sign: str
) -> None:
    torch, runtime, make = native
    entry = saved(tmp_path, state(torch))
    command = replace(
        _command(tmp_path),
        positive_prompt="" if empty_sign == "positive" else entry.token,
        negative_prompt="" if empty_sign == "negative" else entry.token,
        positive_embeddings=() if empty_sign == "positive" else (entry,),
        negative_embeddings=() if empty_sign == "negative" else (entry,),
    )
    conditioning = build_sdxl_conditioning(command, make(), runtime)
    assert int(torch.count_nonzero(getattr(conditioning, empty_sign))) == 0
    assert int(torch.count_nonzero(getattr(conditioning, empty_sign + "_pooled"))) == 0
    other = "negative" if empty_sign == "positive" else "positive"
    assert int(torch.count_nonzero(getattr(conditioning, other))) > 0


def test_finite_weights_must_survive_encoder_dtype(tmp_path: Path, native: Any) -> None:
    torch, _, make = native
    tensors = state(torch, 1)
    tensors["clip_g"][0, 0] = 1e10
    entry = saved(tmp_path, tensors)
    pipeline = make().to(dtype=torch.float16)
    command = replace(_command(tmp_path), positive_prompt=entry.token, positive_embeddings=(entry,))
    with pytest.raises(DerivativeError, match="overflowed"):
        load_generation_embeddings(command, pipeline, torch)


@pytest.mark.parametrize("overflow_sign", ["positive", "negative"])
def test_real_chunk_budget_before_any_clip_forward(
    tmp_path: Path, native: Any, overflow_sign: str
) -> None:
    torch, runtime, make = native
    entry = saved(tmp_path, state(torch))
    command = replace(
        _command(tmp_path),
        positive_prompt=" ".join([f"({entry.token}:1.4)"] * 100),
        positive_embeddings=(entry,),
    )
    pipeline = make()
    inputs = load_generation_embeddings(command, pipeline, torch)
    conditioned = build_sdxl_conditioning(command, pipeline, runtime, embedding_inputs=inputs)
    assert conditioned.positive_length == 308
    assert conditioned.positive.shape == (1, 308, 2048)
    calls: list[int] = []

    def record_forward(_module: Any, _args: Any) -> None:
        calls.append(1)

    handles = [
        encoder.register_forward_pre_hook(record_forward)
        for encoder in (pipeline.text_encoder, pipeline.text_encoder_2)
    ]
    overflow = " ".join(["igs_ti_private_0"] * 101)
    prompts = (
        (overflow, inputs.prompts[1])
        if overflow_sign == "positive"
        else (inputs.prompts[0], overflow)
    )
    try:
        with pytest.raises(DerivativeError) as error:
            build_sdxl_conditioning(
                command, pipeline, runtime, embedding_inputs=replace(inputs, prompts=prompts)
            )
        assert error.value.code == "GENERATION_PROMPT_UNSUPPORTED"
        assert calls == []
    finally:
        for handle in handles:
            handle.remove()


def test_ordinary_text_counts_toward_expanded_budget(tmp_path: Path, native: Any) -> None:
    torch, runtime, make = native
    entry = saved(tmp_path, state(torch))
    command = replace(
        _command(tmp_path),
        positive_prompt=entry.token + " " + "ordinary text. " * 30,
        positive_embeddings=(entry,),
    )
    pipeline = make()
    inputs = load_generation_embeddings(command, pipeline, torch)
    calls: list[int] = []

    def record_forward(_module: Any, _args: Any) -> None:
        calls.append(1)

    hook = pipeline.text_encoder.register_forward_pre_hook(record_forward)
    try:
        with pytest.raises(DerivativeError, match="conditioning safety limit"):
            build_sdxl_conditioning(command, pipeline, runtime, embedding_inputs=inputs)
        assert calls == []
    finally:
        hook.remove()


def test_distinct_active_vector_budget_before_native_loading(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    torch, _, make = native
    first = saved(tmp_path, state(torch, 200), token="<first>", name="first")
    second = saved(tmp_path, state(torch, 101), token="<second>", name="second")
    command = replace(
        _command(tmp_path), positive_prompt="<first> <second>", positive_embeddings=(first, second)
    )
    pipeline = make()
    calls: list[int] = []

    def record_load(*_args: Any, **_kwargs: Any) -> None:
        calls.append(1)

    monkeypatch.setattr(pipeline, "load_textual_inversion", record_load)
    with pytest.raises(DerivativeError, match="vector budget"):
        load_generation_embeddings(command, pipeline, torch)
    assert calls == []


@pytest.mark.parametrize("opaque", [False, True])
def test_actual_native_denoising_has_causal_ti_and_polarity_controls(
    tmp_path: Path, native: Any, opaque: bool
) -> None:
    torch, runtime, make = native
    positive = saved(tmp_path, state(torch), name="positive")
    negative = saved(tmp_path, state(torch, sign=-1), name="negative")
    results: list[bytes] = []
    commands = [
        _command(tmp_path),
        replace(
            _command(tmp_path),
            positive_prompt=f"portrait ({positive.token}:1.4)",
            positive_embeddings=(positive,),
        ),
        replace(
            _command(tmp_path),
            positive_prompt=f"portrait ({positive.token}:1.4)",
            positive_embeddings=(positive,),
            negative_prompt=f"blur {negative.token}",
            negative_embeddings=(negative,),
        ),
    ]
    for command in commands:
        pipeline = make()
        conditioning = build_sdxl_conditioning(command, pipeline, runtime)
        if opaque:
            pipeline = img2img_pipeline_class(runtime.diffusers, torch)(**pipeline.components)
            pipeline.set_progress_bar_config(disable=True)
        with torch.inference_mode():
            result = run_sdxl_pipeline(
                pipeline,
                conditioning,
                width=16,
                height=16,
                steps=2,
                cfg_scale=5,
                generator=torch.Generator("cpu").manual_seed(42),
                torch=torch,
                image=Image.new("RGB", (16, 16), (40, 50, 60)) if opaque else None,
                denoising_strength=0.75 if opaque else None,
            )
        assert result.images[0].size == (16, 16)
        results.append(result.images[0].tobytes())
    assert len(set(results)) == 3


def test_verified_snapshot_never_reopens_path_and_reuses_same_file_across_signs(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    torch, _runtime, make = native
    tensors = state(torch)
    entry = saved(tmp_path, tensors)
    module = importlib.import_module("safetensors.torch")
    original = module.load
    calls: list[int] = []

    def replace_path_after_snapshot(data: bytes) -> Any:
        calls.append(1)
        entry.path.write_bytes(b"changed after the verified snapshot")
        return original(data)

    monkeypatch.setattr(module, "load", replace_path_after_snapshot)
    command = replace(
        _command(tmp_path),
        positive_prompt=entry.token,
        negative_prompt=entry.token,
        positive_embeddings=(entry,),
        negative_embeddings=(entry,),
    )
    pipeline = make()
    inputs = load_generation_embeddings(command, pipeline, torch)
    assert calls == [1]
    for key, tokenizer, encoder in (
        ("clip_l", pipeline.tokenizer, pipeline.text_encoder),
        ("clip_g", pipeline.tokenizer_2, pipeline.text_encoder_2),
    ):
        for alias in inputs.prompts:
            ids = [
                tokenizer.convert_tokens_to_ids(alias if i == 0 else f"{alias}_{i}")
                for i in range(3)
            ]
            assert torch.equal(encoder.get_input_embeddings().weight[ids], tensors[key])


def worker_fixture(
    native: Any, monkeypatch: pytest.MonkeyPatch, root: Path, opaque: bool
) -> tuple[Any, MLRuntime, Path, dict[str, Any]]:
    torch, runtime, make = native
    pipeline = make().to(dtype=torch.float16)
    if opaque:
        pipeline = img2img_pipeline_class(runtime.diffusers, torch)(**pipeline.components)
        pipeline.set_progress_bar_config(disable=True)
    request = generation_request(root / "stage", opaque)
    config = root / "config"
    config.mkdir()
    config_bytes = b"controlled tiny native CPU loader; no trained loader claim"
    (config / "model_index.json").write_bytes(config_bytes)
    monkeypatch.setattr(
        inference_config,
        "PINNED_SDXL_FILES",
        {"model_index.json": hashlib.sha256(config_bytes).hexdigest()},
    )

    def load(*_args: Any, **kwargs: Any) -> Any:
        assert kwargs["torch_dtype"] == torch.float16
        assert kwargs["local_files_only"] is True
        return pipeline

    diffusers = runtime.diffusers
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
    return pipeline, runtime, config, request


@pytest.mark.parametrize("opaque", [False, True])
def test_worker_entrypoint_publishes_real_conditioned_image_and_thumbnail(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch, opaque: bool
) -> None:
    torch, _, _ = native
    pipeline, runtime, config, request = worker_fixture(native, monkeypatch, tmp_path, opaque)
    entry = saved(tmp_path, state(torch))
    request["job"]["prompts"]["positive"] = "portrait (<Case-Sensitive>:1.4)"
    request["job"]["embeddings"] = {"positive": [wire(entry)], "negative": []}
    events: list[dict[str, object]] = []
    result = process_inference_request(
        request, config_dir=config, runtime=runtime, on_progress=events.append
    )
    assert result["type"] == "generation-done", result
    assert events and [event["step"] for event in events] == list(range(1, len(events) + 1))
    output = Path(request["job"]["output"]["pngPath"])
    with Image.open(output) as image:
        assert image.size == (16, 16) and image.info["icc_profile"] == SRGB_ICC_PROFILE
    assert len(list(output.parent.glob("*.thumb.webp"))) == 1
    assert "igs_ti_private" not in json.dumps(result)
    assert not pipeline.unet._forward_hooks and not pipeline.unet._forward_pre_hooks


@pytest.mark.parametrize("opaque", [False, True])
@pytest.mark.parametrize("failure", ["changed", "overflow", "nonfinite-condition"])
def test_worker_refuses_bad_embeddings_without_partial_publication(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch, opaque: bool, failure: str
) -> None:
    torch, _, _ = native
    pipeline, runtime, config, request = worker_fixture(native, monkeypatch, tmp_path, opaque)
    entry = saved(tmp_path, state(torch))
    request["job"]["prompts"]["positive"] = entry.token
    request["job"]["embeddings"] = {"positive": [wire(entry)], "negative": []}
    hook = None
    unet_calls: list[int] = []

    def observe_unet(_module: Any, _args: Any) -> None:
        unet_calls.append(1)

    unet_hook = pipeline.unet.register_forward_pre_hook(observe_unet)
    if failure == "changed":
        entry.path.write_bytes(b"changed after enqueue")
    elif failure == "overflow":
        request["job"]["prompts"]["positive"] = " ".join([entry.token] * 101)
    else:

        def corrupt(_module: Any, _args: Any, output: Any) -> Any:
            output.last_hidden_state.fill_(float("nan"))
            for hidden in output.hidden_states:
                hidden.fill_(float("nan"))
            return output

        hook = pipeline.text_encoder.register_forward_hook(corrupt)
    try:
        result = process_inference_request(request, config_dir=config, runtime=runtime)
        unet_hook.remove()
        assert result["type"] == "error", result
        expected = {
            "changed": "GENERATION_INPUT_CHANGED",
            "overflow": "GENERATION_PROMPT_UNSUPPORTED",
            "nonfinite-condition": "GENERATION_WORKER_FAILED",
        }
        assert result["code"] == expected[failure]
        assert unet_calls == [], "Invalid resource conditioning reached native denoising"
        assert not Path(request["job"]["output"]["pngPath"]).exists()
        assert not list((tmp_path / "stage").glob("*.thumb.webp"))
        assert not list((tmp_path / "stage").glob("*.tmp"))
        assert not pipeline.unet._forward_hooks and not pipeline.unet._forward_pre_hooks
    finally:
        unet_hook.remove()
        if hook is not None:
            hook.remove()
