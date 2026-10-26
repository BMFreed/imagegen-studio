"""Authored contract for the private encoded-conditioning one-shot owner.

Native mechanics use random, local CLIP/Compel/Diffusers modules at the real
768/1280/2048 widths. Fixture paths and hashes are inert typed-command labels,
not worker/catalog qualification. No downloads, filesystem fixtures or artifacts.
Optional native imports may skip in the base environment; qualification needs
the pinned environment and zero skips. Authorship is not an execution claim.

Root's isolated semantic mutation: reverse two same-length segment contexts
without reversing the derived plan. Named RED boundary:
test_same_length_context_swap_mutation_red. Unaffected named GREEN control:
test_single_stream_context_swap_control_green. These tests never patch encoding,
attention mathematics, returned conditioning, or native consumer results.
"""

from __future__ import annotations

import dataclasses
import importlib
import importlib.metadata
import inspect
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest

from imagegen_worker.illustrious_regional_attention import (
    Alpha8,
    EncodedSegment,
    Everywhere,
    Shape,
    plan_illustrious_attention,
)
from imagegen_worker.inference import MLRuntime, SdxlConditioning, build_sdxl_conditioning
from imagegen_worker.protocol import GenerateIllustriousTxt2ImgCommand

PROFILE = "alpha8-ge128-ceil2x2-max-v1"
LAYOUTS = ("cfg-negative-first", "positive-only")
DEFAULT_SHAPE = Shape(2, 3)


@pytest.fixture(scope="module")
def native() -> Iterator[Any]:
    """One reusable native producer; all hooks/patches are local to each test."""
    torch = pytest.importorskip("torch")
    diffusers = pytest.importorskip("diffusers")
    transformers = pytest.importorskip("transformers")
    compel = pytest.importorskip("compel")
    assert torch.__version__.split("+", 1)[0] == "2.7.1"
    for package, version in (
        ("diffusers", "0.40.0"),
        ("transformers", "5.5.4"),
        ("compel", "2.4.0"),
    ):
        assert importlib.metadata.version(package) == version
    adapter = importlib.import_module("imagegen_worker.illustrious_regional_attention_adapter")
    bridge = importlib.import_module("imagegen_worker.illustrious_regional_conditioning")
    processors = importlib.import_module("diffusers.models.attention_processor")
    byte_level = importlib.import_module("tokenizers.pre_tokenizers").ByteLevel
    chars = sorted(byte_level.alphabet())
    vocab = {
        word: index
        for index, word in enumerate(
            ["<|startoftext|>", "<|endoftext|>"]
            + chars
            + [char + "</w>" for char in chars]
            + ["ca", "cat</w>"]
        )
    }
    previous_threads = torch.get_num_threads()
    torch.set_num_threads(1)
    try:
        with torch.random.fork_rng(devices=[]), torch.no_grad():
            torch.manual_seed(251025)

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
                    dropout=0.0,
                ).eval(),
                scheduler=diffusers.DPMSolverMultistepScheduler(),
                add_watermarker=False,
            )
            pipeline.set_progress_bar_config(disable=True)
            yield SimpleNamespace(
                torch=torch,
                diffusers=diffusers,
                transformers=transformers,
                runtime=MLRuntime(torch, diffusers, compel),
                pipeline=pipeline,
                vocab=vocab,
                bridge=bridge,
                adapter=adapter,
                processor_type=processors.AttnProcessor2_0,
            )
    finally:
        torch.set_num_threads(previous_threads)


def _command(positive: str, negative: str) -> GenerateIllustriousTxt2ImgCommand:
    # In-memory producer command only: these fixture labels are never opened.
    fixture = Path("/encoded-conditioning-fixture-not-a-catalog")
    return GenerateIllustriousTxt2ImgCommand(
        request_id="encoded-conditioning-fixture",
        checkpoint_path=fixture / "checkpoint.safetensors",
        checkpoint_sha256="a" * 64,
        prediction_type="epsilon",
        target_path=fixture / "target.png",
        target_sha256="a" * 64,
        target_byte_size=1,
        target_icc_sha256="a" * 64,
        width=16,
        height=16,
        bbox={"x": 0, "y": 0, "width": 16, "height": 16},
        positive_prompt=positive,
        negative_prompt=negative,
        steps=2,
        cfg_scale=5,
        seed=42,
        scheduler="dpmpp_2m",
        staging_root=fixture,
        output_path=fixture / "output.png",
    )


def _encode(native: Any, positive: str = "cat", negative: str = "blur") -> Any:
    return build_sdxl_conditioning(_command(positive, negative), native.pipeline, native.runtime)


def _convert(native: Any, source: Any, binding_id: str = "stream", **changes: Any) -> Any:
    options = {"negative_coverage": Everywhere(), "positive_coverage": Everywhere(), **changes}
    return native.bridge.encoded_bindings_from_sdxl_conditioning(binding_id, source, **options)


def _tensor(native: Any, length: int, marker: float = 1.0) -> Any:
    torch = native.torch
    # Nonconstant feature rows make native projection/output contrasts meaningful.
    values = torch.arange(length * 2048, dtype=torch.float32).reshape(1, length, 2048)
    return (values * 0.019 + marker).sin() * 0.7 + marker * 0.05


def _binding(native: Any, name: str, length: int = 1, marker: float = 1.0, **fields: Any) -> Any:
    return native.bridge.EncodedTensorBinding(
        name, _tensor(native, length, marker), fields.pop("coverage", Everywhere()), **fields
    )


def _transformer(native: Any, *, context_dim: int = 2048, channels: int = 8) -> Any:
    with native.torch.random.fork_rng(devices=[]):
        native.torch.manual_seed(937)
        return native.diffusers.Transformer2DModel(
            num_attention_heads=2,
            attention_head_dim=4,
            in_channels=channels,
            out_channels=channels,
            num_layers=1,
            norm_num_groups=4,
            cross_attention_dim=context_dim,
            dropout=0.0,
        ).eval()


def _bindings(native: Any, root: Any, factor: int = 1) -> tuple[Any, ...]:
    return tuple(
        native.adapter.TransformerBinding(module, factor)
        for module in root.modules()
        if type(module) is native.diffusers.Transformer2DModel
    )


def _arguments(
    native: Any,
    root: Any,
    *,
    negative: tuple[Any, ...] | None = None,
    positive: tuple[Any, ...] | None = None,
    layout: str = "cfg-negative-first",
    shape: Shape = DEFAULT_SHAPE,
    factor: int = 1,
) -> dict[str, Any]:
    torch = native.torch
    batch = 2 if layout == "cfg-negative-first" else 1
    unet = type(root) is native.diffusers.UNet2DConditionModel
    channels = 4 if unet else root.config.in_channels
    height = (shape.height + factor - 1) // factor
    width = (shape.width + factor - 1) // factor
    sample = torch.linspace(-0.8, 0.9, batch * channels * height * width).reshape(
        batch, channels, height, width
    )
    negative = negative if negative is not None else (_binding(native, "same", marker=-2),)
    positive = positive if positive is not None else (_binding(native, "same", marker=3),)
    args = dict(
        negative=negative,
        positive=positive,
        latent_shape=shape,
        layout=layout,
        bindings=_bindings(native, root, factor),
        sample=sample,
    )
    if unet:
        args.update(
            timestep=torch.tensor(7.0),
            time_ids=torch.tensor([[64.0, 48.0, 1.0, 2.0, 32.0, 24.0]]).repeat(batch, 1),
            negative_pooled_source_id=negative[-1].binding_id,
            positive_pooled_source_id=positive[-1].binding_id,
        )
    return args


def _run(native: Any, root: Any, args: dict[str, Any]) -> Any:
    return native.bridge.run_illustrious_regional_conditioning(root, **args)


def _slots(root: Any) -> tuple[Any, ...]:
    """Exact native processor/hook/call-entry/training restoration, not counts."""
    hook_names = (
        "_forward_pre_hooks",
        "_forward_hooks",
        "_forward_pre_hooks_with_kwargs",
        "_forward_hooks_with_kwargs",
        "_forward_hooks_always_called",
    )
    return tuple(
        (
            id(module),
            getattr(module, "processor", None),
            module.training,
            tuple((name, tuple(getattr(module, name).items())) for name in hook_names),
            tuple((key, value) for key, value in module.__dict__.items() if key == "_call_impl"),
            cast(Any, type(module))._call_impl,
        )
        for module in root.modules()
    )


def _state(root: Any) -> dict[str, Any]:
    return {name: tensor.detach().clone() for name, tensor in root.state_dict().items()}


def _assert_state(native: Any, root: Any, state: dict[str, Any]) -> None:
    assert set(root.state_dict()) == set(state)
    for name, tensor in root.state_dict().items():
        assert native.torch.equal(tensor, state[name]), name


def _first_attention(native: Any, root: Any) -> Any:
    return _bindings(native, root)[0].transformer.transformer_blocks[0].attn2


@contextmanager
def _observe(native: Any, root: Any, monkeypatch: Any) -> Generator[Any]:
    """Observe the unchanged original processor and unchanged native root result."""
    attention = _first_attention(native, root)
    original_processor = attention.processor
    processor_call = native.processor_type.__call__
    scope_init = native.adapter._Scope.__init__
    seen = SimpleNamespace(
        contexts=[], queries=[], masks=[], outputs=[], results=[], plans=[], root_inputs=[]
    )

    def processor(instance: Any, attn: Any, *args: Any, **kwargs: Any) -> Any:
        selected = attn is attention
        if selected:
            assert instance is original_processor
            seen.queries.append(args[0].detach().clone())
            seen.contexts.append(kwargs["encoder_hidden_states"].detach().clone())
            mask = kwargs["attention_mask"]
            seen.masks.append(None if mask is None else mask.detach().clone())
        result = processor_call(instance, attn, *args, **kwargs)
        if selected:
            seen.outputs.append(result.detach().clone())
        return result

    def initialize(scope: Any, *args: Any, **kwargs: Any) -> None:
        scope_init(scope, *args, **kwargs)
        seen.plans.append(scope.plan)

    def before(_module: Any, args: Any, kwargs: Any) -> None:
        signature = inspect.signature(cast(Any, type(root)).forward)
        seen.root_inputs.append(dict(signature.bind_partial(root, *args, **kwargs).arguments))

    def after(_module: Any, _args: Any, output: Any) -> None:
        seen.results.append(output)

    pre = root.register_forward_pre_hook(before, with_kwargs=True)
    post = root.register_forward_hook(after)
    baseline = _slots(root)
    try:
        with monkeypatch.context() as patch:
            patch.setattr(native.processor_type, "__call__", processor)
            patch.setattr(native.adapter._Scope, "__init__", initialize)
            yield seen
        assert _slots(root) == baseline
    finally:
        pre.remove()
        post.remove()


def _mask(native: Any, observed: Any, batch: int, queries: int, keys: int) -> Any:
    if observed is None:
        return native.torch.ones(
            batch,
            2,
            queries,
            keys,
            dtype=native.torch.bool,
            device=next(native.pipeline.unet.parameters()).device,
        )
    assert observed.dtype == native.torch.bool
    assert observed.numel() == batch * 2 * queries * keys
    return observed.reshape(batch, 2, queries, keys)


def _literal_context(native: Any, streams: tuple[Any, ...], keys: int) -> Any:
    # Test-only literal assembly, never used as input to the owner.
    expected = native.torch.zeros(1, keys, 2048)
    cursor = 0
    for stream in streams:
        length = stream.context.shape[1]
        expected[:, cursor : cursor + length] = stream.context
        cursor += length
    return expected


def _assert_ranges(plan: Any, sign: str, expected: tuple[tuple[str, int, int], ...]) -> None:
    assert (
        tuple(
            (item.token_range.binding_id, item.token_range.start, item.token_range.end)
            for item in getattr(plan, sign).segments
        )
        == expected
    )


def _dense_native_oracle(
    native: Any, attention: Any, queries: Any, context: Any, allowed: Any
) -> Any:
    """Small independent softmax oracle for the first NORMAL native attention."""
    torch = native.torch
    assert attention.heads == 2
    assert attention.norm_q is None and attention.norm_k is None
    assert attention.group_norm is None and attention.spatial_norm is None
    assert not attention.norm_cross and not attention.residual_connection
    assert attention.rescale_output_factor == 1.0
    linear = torch.nn.functional.linear
    q = linear(queries, attention.to_q.weight, attention.to_q.bias)
    k = linear(context, attention.to_k.weight, attention.to_k.bias)
    v = linear(context, attention.to_v.weight, attention.to_v.bias)
    batch, query_length, _ = q.shape
    q = q.reshape(batch, query_length, 2, 4).transpose(1, 2)
    k = k.reshape(batch, context.shape[1], 2, 4).transpose(1, 2)
    v = v.reshape(batch, context.shape[1], 2, 4).transpose(1, 2)
    probabilities = ((q @ k.transpose(-1, -2)) / 2).masked_fill(~allowed, -torch.inf).softmax(-1)
    attended = (probabilities @ v).transpose(1, 2).reshape(batch, query_length, 8)
    assert not attention.to_out[1].training
    return linear(attended, attention.to_out[0].weight, attention.to_out[0].bias)


@contextmanager
def _tripwires(native: Any, root: Any, monkeypatch: Any, *, finite: bool = False) -> Generator[Any]:
    """Ban snapshots/assembly/install. Finite validation scratch is normally allowed."""
    hits: list[str] = []

    def deny(name: str) -> Any:
        def refused(*_args: Any, **_kwargs: Any) -> Any:
            hits.append(name)
            raise AssertionError(f"premature snapshot/installation: {name}")

        return refused

    slots = _slots(root)
    with monkeypatch.context() as patch:
        for name in ("clone", "copy_", "set_"):
            patch.setattr(native.torch.Tensor, name, deny("Tensor." + name))
        for name in ("cat", "stack"):
            patch.setattr(native.torch, name, deny("torch." + name))
        patch.setattr(native.torch.nn.functional, "pad", deny("functional.pad"))
        if finite:
            patch.setattr(
                native.torch, "isfinite", deny("torch.isfinite before structural preflight")
            )
        patch.setattr(native.adapter._Scope, "install", deny("scope.install"))
        for name in ("register_forward_pre_hook", "register_forward_hook", "__setattr__"):
            if name == "__setattr__":
                original = native.torch.nn.Module.__setattr__

                def guarded(module: Any, key: str, value: Any, *, setter: Any = original) -> None:
                    if key in ("processor", "_call_impl"):
                        hits.append("module." + key)
                        raise AssertionError("premature native slot mutation")
                    setter(module, key, value)

                patch.setattr(native.torch.nn.Module, name, guarded)
            else:
                patch.setattr(native.torch.nn.Module, name, deny(name))
        yield hits
    assert hits == []
    assert _slots(root) == slots


@pytest.mark.parametrize("kind", ["transformer", "unet"])
@pytest.mark.parametrize("layout", LAYOUTS)
def test_actual_encoder_converter_normal_native_forward_and_exact_restoration(
    native: Any, monkeypatch: Any, kind: str, layout: str
) -> None:
    source = _encode(native)
    pair = _convert(native, source)
    root = _transformer(native) if kind == "transformer" else native.pipeline.unet
    args = _arguments(
        native, root, negative=(pair.negative,), positive=(pair.positive,), layout=layout
    )
    before, state = _slots(root), _state(root)
    with _observe(native, root, monkeypatch) as seen:
        result = _run(native, root, args)
    assert len(seen.contexts) == len(seen.outputs) == len(seen.results) == 1
    assert result is seen.results[0]
    assert type(result).__name__ == (
        "Transformer2DModelOutput" if kind == "transformer" else "UNet2DConditionOutput"
    )
    assert result.sample.shape == args["sample"].shape
    assert native.torch.isfinite(result.sample).all()
    assert not result.sample.requires_grad and result.sample.grad_fn is None
    expected = (
        native.torch.cat((source.negative, source.positive))
        if layout == LAYOUTS[0]
        else source.positive
    )
    assert native.torch.equal(seen.contexts[0], expected)
    assert _slots(root) == before
    _assert_state(native, root, state)


def _ordered_case(native: Any, *, negative_longer: bool = False, equal: bool = False) -> Any:
    shape = Shape(2, 3)
    negative = (
        _binding(native, "z-neg-global", 1, -4),
        _binding(
            native,
            "a-neg-local",
            2 if negative_longer else 1,
            -2,
            coverage=Alpha8(shape, bytes((255, 0, 127, 128, 0, 255))),
        ),
    )
    positive = (
        _binding(native, "z-pos-global", 1, 3),
        _binding(
            native,
            "a-pos-local",
            1 if negative_longer or equal else 2,
            7,
            coverage=Alpha8(shape, bytes((0, 255, 128, 127, 255, 0))),
        ),
    )
    return negative, positive


@pytest.mark.parametrize("layout", LAYOUTS)
@pytest.mark.parametrize("case", ["positive-longer", "negative-longer", "equal-spatial"])
def test_literal_sign_order_padding_ranges_and_spatial_mask_native_oracle(
    native: Any, monkeypatch: Any, layout: str, case: str
) -> None:
    root = _transformer(native)
    negative, positive = _ordered_case(
        native, negative_longer=case == "negative-longer", equal=case == "equal-spatial"
    )
    args = _arguments(native, root, negative=negative, positive=positive, layout=layout)
    keys = 2 if case == "equal-spatial" else 3
    with _observe(native, root, monkeypatch) as seen:
        _run(native, root, args)
    assert len(seen.contexts) == len(seen.plans) == 1
    expected_negative = _literal_context(native, negative, keys)
    expected_positive = _literal_context(native, positive, keys)
    expected_context = (
        native.torch.cat((expected_negative, expected_positive))
        if layout == LAYOUTS[0]
        else expected_positive
    )
    assert native.torch.equal(seen.contexts[0], expected_context)
    plan = seen.plans[0]
    assert plan.key_length == keys
    assert plan.batch_signs == (("negative", "positive") if layout == LAYOUTS[0] else ("positive",))
    n_end = 3 if case == "negative-longer" else 2
    p_end = 2 if case in ("negative-longer", "equal-spatial") else 3
    _assert_ranges(plan, "negative", (("z-neg-global", 0, 1), ("a-neg-local", 1, n_end)))
    _assert_ranges(plan, "positive", (("z-pos-global", 0, 1), ("a-pos-local", 1, p_end)))
    masks = _mask(native, seen.masks[0], len(plan.batch_signs), 6, keys)
    # Literal alpha threshold expectations; never ask plan.query for an oracle.
    for batch, (visible, end) in enumerate(
        (
            ((True, False, False, True, False, True), n_end),
            ((False, True, True, False, True, False), p_end),
        )
        if layout == LAYOUTS[0]
        else ((((False, True, True, False, True, False), p_end)),)
    ):
        expected = native.torch.zeros(2, 6, keys, dtype=native.torch.bool)
        expected[:, :, 0] = True
        for query, permitted in enumerate(visible):
            expected[:, query, 1:end] = permitted
        assert native.torch.equal(masks[batch], expected)


def test_same_length_context_swap_mutation_red(native: Any, monkeypatch: Any) -> None:
    """MUTATION boundary: reverse context segments alone; literal plan stays fixed."""
    root = _transformer(native)
    negative, positive = _ordered_case(native, equal=True)
    args = _arguments(native, root, negative=negative, positive=positive)
    with _observe(native, root, monkeypatch) as seen:
        baseline = _run(native, root, args).sample
    assert native.torch.equal(seen.contexts[0][1, 0], positive[0].context[0, 0])
    assert native.torch.equal(seen.contexts[0][1, 1], positive[1].context[0, 0])
    _assert_ranges(seen.plans[0], "positive", (("z-pos-global", 0, 1), ("a-pos-local", 1, 2)))
    literal_context = native.torch.cat(
        (_literal_context(native, negative, 2), _literal_context(native, positive, 2))
    )
    literal_mask = native.torch.ones(2, 2, 6, 2, dtype=native.torch.bool)
    literal_mask[0, :, :, 1] = native.torch.tensor([True, False, False, True, False, True])
    literal_mask[1, :, :, 1] = native.torch.tensor([False, True, True, False, True, False])
    numerical = _dense_native_oracle(
        native, _first_attention(native, root), seen.queries[0], literal_context, literal_mask
    )
    assert native.torch.allclose(seen.outputs[0], numerical, atol=2e-6, rtol=2e-6)
    # Valid CONTROL: reorder COMPLETE records, including their coverage and IDs.
    with _observe(native, root, monkeypatch) as reordered:
        control = _run(native, root, {**args, "positive": positive[::-1]}).sample
    _assert_ranges(reordered.plans[0], "positive", (("a-pos-local", 0, 1), ("z-pos-global", 1, 2)))
    assert native.torch.equal(reordered.contexts[0][1, 0], positive[1].context[0, 0])
    assert native.torch.allclose(baseline, control, atol=2e-6, rtol=2e-6)


def test_single_stream_context_swap_control_green(native: Any, monkeypatch: Any) -> None:
    """Single-stream CONTROL for the root's two-segment concatenation mutation."""
    root = _transformer(native)
    n = _binding(native, "shared", 3, -3)
    p = _binding(native, "shared", 3, 5)
    args = _arguments(native, root, negative=(n,), positive=(p,))
    with _observe(native, root, monkeypatch) as seen:
        result = _run(native, root, args)
    assert native.torch.equal(seen.contexts[0][0:1], n.context)
    assert native.torch.equal(seen.contexts[0][1:2], p.context)
    assert _mask(native, seen.masks[0], 2, 6, 3).all()
    assert native.torch.isfinite(result.sample).all()


@pytest.mark.parametrize("factor,grid", [(1, (3, 5)), (2, (2, 3)), (4, (1, 2)), (8, (1, 1))])
def test_transformer_root_explicit_factor_matches_ceil_latent_grid(
    native: Any, factor: int, grid: Any
) -> None:
    root = _transformer(native)
    args = _arguments(native, root, factor=factor, shape=Shape(3, 5))
    assert tuple(args["sample"].shape[-2:]) == grid
    assert _run(native, root, args).sample.shape == args["sample"].shape


@pytest.mark.parametrize("empty", ["positive", "negative", "both"])
def test_real_empty_text_retains_actual_77_zero_rows(native: Any, empty: str) -> None:
    source = _encode(
        native,
        "" if empty in ("positive", "both") else "cat",
        "" if empty in ("negative", "both") else "blur",
    )
    pair = _convert(native, source)
    for sign in ("negative", "positive"):
        binding = getattr(pair, sign)
        assert binding.context.shape == (1, 77, 2048)
        if empty in (sign, "both"):
            assert native.torch.count_nonzero(binding.context) == 0
            assert native.torch.count_nonzero(binding.pooled) == 0
    root = _transformer(native)
    result = _run(
        native, root, _arguments(native, root, negative=(pair.negative,), positive=(pair.positive,))
    )
    assert native.torch.isfinite(result.sample).all()


def test_converter_true_lengths_internal_zero_alignment_and_detached_owned_storage(
    native: Any,
) -> None:
    torch = native.torch
    positive = _tensor(native, 154, 3)
    negative = torch.zeros(1, 154, 2048)
    with torch.no_grad():
        positive[:, 77:, :768] = 0  # Internal shorter-channel alignment, not sign padding.
        positive[:, 4] = 0  # Zero actual row must survive too.
    source = SdxlConditioning(
        positive, negative, torch.ones(1, 1280), torch.zeros(1, 1280), 154, 77
    )
    pair = _convert(native, source)
    assert pair.positive.context.shape == (1, 154, 2048)
    assert pair.negative.context.shape == (1, 77, 2048)
    assert torch.equal(pair.positive.context, source.positive)
    assert torch.count_nonzero(pair.positive.context[:, 77:, :768]) == 0
    snapshots = [
        item.detach().clone()
        for item in (
            pair.negative.context,
            pair.positive.context,
            pair.negative.pooled,
            pair.positive.pooled,
        )
    ]
    for owned, original in zip(
        (pair.negative.context, pair.positive.context, pair.negative.pooled, pair.positive.pooled),
        (source.negative, source.positive, source.negative_pooled, source.positive_pooled),
        strict=True,
    ):
        assert not owned.requires_grad and owned.grad_fn is None
        assert owned.untyped_storage().data_ptr() != original.untyped_storage().data_ptr()
        original.add_(9)
    for item, expected in zip(
        (pair.negative.context, pair.positive.context, pair.negative.pooled, pair.positive.pooled),
        snapshots,
        strict=True,
    ):
        assert torch.equal(item, expected)


@pytest.mark.parametrize("merged_first", [False, True])
@pytest.mark.parametrize(
    "words,long_rows,short_rows", [(1, 77, 77), (26, 154, 77), (51, 231, 77), (76, 308, 154)]
)
def test_real_unequal_dual_clip_tokenization_known_chunk_lengths_and_channel_placement(
    native: Any, monkeypatch: Any, merged_first: bool, words: int, long_rows: int, short_rows: int
) -> None:
    # Unmerged 'cat' is exactly three BPE tokens; valid c+a, ca+t</w> merges make one.
    merged = native.transformers.CLIPTokenizer(
        vocab=native.vocab, merges=[("c", "a"), ("ca", "t</w>")], model_max_length=77
    )
    unmerged = native.pipeline.tokenizer
    c, a, t = (native.vocab[token] for token in ("c", "a", "t</w>"))
    assert unmerged("cat", add_special_tokens=False)["input_ids"] == [c, a, t]
    assert merged("cat", add_special_tokens=False)["input_ids"] == [native.vocab["cat</w>"]]
    prompt = " ".join(["cat"] * words)
    assert len(unmerged(prompt, add_special_tokens=False)["input_ids"]) == words * 3
    assert len(merged(prompt, add_special_tokens=False)["input_ids"]) == words
    field = "tokenizer" if merged_first else "tokenizer_2"
    monkeypatch.setattr(native.pipeline, field, merged)
    inference = importlib.import_module("imagegen_worker.inference")
    original = inference._clip_embeddings
    calls: list[Any] = []

    def observe(*args: Any, **kwargs: Any) -> Any:
        result = original(*args, **kwargs)
        calls.append((args[0], kwargs["encoder"].config.hidden_size, result[0].detach().clone()))
        return result

    monkeypatch.setattr(inference, "_clip_embeddings", observe)
    source = _encode(native, prompt, "")
    assert source.positive_length == long_rows
    assert source.negative_length == 77
    assert source.negative.shape == source.positive.shape == (1, long_rows, 2048)
    actual = {width: tensor for text, width, tensor in calls if text == prompt}
    expected_lengths = {
        768: short_rows if merged_first else long_rows,
        1280: long_rows if merged_first else short_rows,
    }
    for width, offset in ((768, 0), (1280, 768)):
        length = expected_lengths[width]
        assert actual[width].shape == (1, length, width)
        assert native.torch.equal(
            source.positive[:, :length, offset : offset + width], actual[width]
        )
        assert native.torch.count_nonzero(source.positive[:, length:, offset : offset + width]) == 0
    pair = _convert(native, source)
    assert pair.positive.context.shape == (1, long_rows, 2048)
    assert pair.negative.context.shape == (1, 77, 2048)
    root = _transformer(native)
    result = _run(
        native, root, _arguments(native, root, negative=(pair.negative,), positive=(pair.positive,))
    )
    assert native.torch.isfinite(result.sample).all()


@pytest.mark.parametrize("layout", LAYOUTS)
def test_unet_explicit_nonfirst_sign_local_pooled_selection_and_time_ids(
    native: Any, monkeypatch: Any, layout: str
) -> None:
    torch = native.torch
    root = native.pipeline.unet
    n = (
        _binding(native, "first", marker=-2, pooled=torch.full((1, 1280), -99.0)),
        _binding(native, "chosen-n", marker=-3, pooled=torch.linspace(-1, 0, 1280).reshape(1, -1)),
    )
    p = (
        _binding(native, "first", marker=2, pooled=torch.full((1, 1280), 77.0)),
        _binding(native, "chosen-p", marker=4, pooled=torch.linspace(0, 1, 1280).reshape(1, -1)),
    )
    args = _arguments(native, root, negative=n, positive=p, layout=layout)
    args["time_ids"] = (
        torch.arange(args["sample"].shape[0] * 6, dtype=torch.float32).reshape(-1, 6) + 11
    )
    expected_time = args["time_ids"].clone()
    with _observe(native, root, monkeypatch) as seen:
        result = _run(native, root, args)
    inputs = seen.root_inputs[0]
    expected_pool = torch.cat((n[1].pooled, p[1].pooled)) if layout == LAYOUTS[0] else p[1].pooled
    assert torch.equal(inputs["added_cond_kwargs"]["text_embeds"], expected_pool)
    assert torch.equal(inputs["added_cond_kwargs"]["time_ids"], expected_time)
    assert torch.equal(inputs["timestep"], args["timestep"])
    assert result is seen.results[0]


def test_reencode_one_regional_positive_causal_first_native_attention_and_whole_root(
    native: Any, monkeypatch: Any
) -> None:
    torch = native.torch
    root = native.pipeline.unet
    global_pair = _convert(native, _encode(native, "portrait", "blur"), "global")
    region_a = _convert(
        native,
        _encode(native, "cat", ""),
        "region",
        positive_coverage=Alpha8(Shape(2, 3), bytes((255, 0, 255, 0, 255, 0))),
    )
    region_b = _convert(
        native, _encode(native, "dog", ""), "region", positive_coverage=region_a.positive.coverage
    )
    assert not torch.equal(region_a.positive.context, region_b.positive.context)
    assert region_a.positive.context.shape == region_b.positive.context.shape == (1, 77, 2048)
    # Nonfirst explicit global pool is held fixed even though regional pools differ.
    args = _arguments(
        native,
        root,
        negative=(global_pair.negative,),
        positive=(region_a.positive, global_pair.positive),
    )
    with _observe(native, root, monkeypatch) as seen:
        first = _run(native, root, args).sample.clone()
        second = _run(
            native, root, {**args, "positive": (region_b.positive, global_pair.positive)}
        ).sample.clone()
    a, b = seen.outputs
    assert torch.equal(a[0], b[0])
    blocked = torch.tensor([1, 3, 5])
    permitted = torch.tensor([0, 2, 4])
    assert torch.equal(a[1, blocked], b[1, blocked])
    assert (a[1, permitted] - b[1, permitted]).abs().max().item() > 1e-6
    assert torch.equal(first[0], second[0])
    assert (first[1] - second[1]).abs().max().item() > 1e-6
    assert torch.equal(
        seen.root_inputs[0]["added_cond_kwargs"]["text_embeds"],
        seen.root_inputs[1]["added_cond_kwargs"]["text_embeds"],
    )
    # No claim that final output pixels outside coverage are preserved.


def test_after_assembly_source_alias_mutation_cannot_retarget_owned_native_call(
    native: Any, monkeypatch: Any
) -> None:
    torch = native.torch
    root = native.pipeline.unet
    pair = _convert(native, _encode(native))
    args = _arguments(native, root, negative=(pair.negative,), positive=(pair.positive,))
    args["encoder_attention_mask"] = torch.ones(2, 77, dtype=torch.float32)
    inputs = [
        pair.negative.context,
        pair.positive.context,
        pair.negative.pooled,
        pair.positive.pooled,
        args["sample"],
        args["timestep"],
        args["time_ids"],
        args["encoder_attention_mask"],
    ]
    # Non-owning caller views; the inference profile admits no gradient inputs.
    bases = [item.detach().clone() for item in inputs]
    views = [base.view_as(base) for base in bases]
    args["negative"] = (dataclasses.replace(pair.negative, context=views[0], pooled=views[2]),)
    args["positive"] = (dataclasses.replace(pair.positive, context=views[1], pooled=views[3]),)
    for name, value in zip(
        ("sample", "timestep", "time_ids", "encoder_attention_mask"), views[4:], strict=True
    ):
        args[name] = value
    pristine = [value.clone() for value in views]
    model_state = _state(root)
    with _observe(native, root, monkeypatch) as baseline:
        expected = _run(native, root, args).sample.clone()
    changed: list[bool] = []

    def mutate(_module: Any, _args: Any, _kwargs: Any) -> None:
        assert not changed
        # Registered before one-shot entry; runs after assembly at native root.
        for value in views[:-1]:
            value.add_(0.4)
        views[-1][:, -1] = 0  # Still valid binary key permissions for a later call.
        changed.append(True)

    handle = root.register_forward_pre_hook(mutate, with_kwargs=True)
    try:
        with _observe(native, root, monkeypatch) as captured:
            actual = _run(native, root, args).sample.clone()
    finally:
        handle.remove()
    assert changed == [True]
    assert torch.equal(actual, expected)
    assert torch.equal(captured.contexts[0], baseline.contexts[0])
    assert torch.equal(captured.masks[0], baseline.masks[0])
    for current, original in zip(views, pristine, strict=True):
        assert not torch.equal(current, original)
    for current, original in zip(views[:-1], pristine[:-1], strict=True):
        assert torch.equal(current, original + 0.4)
    expected_mask = pristine[-1].clone()
    expected_mask[:, -1] = 0
    assert torch.equal(views[-1], expected_mask)
    owned = captured.root_inputs[0]
    for key in ("sample", "timestep"):
        assert torch.equal(owned[key], baseline.root_inputs[0][key])
    for key in ("text_embeds", "time_ids"):
        assert torch.equal(
            owned["added_cond_kwargs"][key], baseline.root_inputs[0]["added_cond_kwargs"][key]
        )
    for value, original in (
        (owned["sample"], views[4]),
        (owned["timestep"], views[5]),
        (owned["added_cond_kwargs"]["time_ids"], views[6]),
        (owned["added_cond_kwargs"]["text_embeds"], views[2]),
    ):
        assert value.untyped_storage().data_ptr() != original.untyped_storage().data_ptr()
        assert not value.requires_grad and value.grad_fn is None
    fresh = _run(native, root, args).sample
    assert (fresh - expected).abs().max().item() > 1e-6
    _assert_state(native, root, model_state)
    # This is a synchronous parent-prehook intervention, not atomic thread capture.


def test_records_frozen_slotted_and_one_shot_signature_has_no_override_channel(native: Any) -> None:
    binding = _binding(native, "record")
    pair = native.bridge.SdxlTensorBindings(binding, binding)
    for record, field in ((binding, "binding_id"), (pair, "negative")):
        assert dataclasses.is_dataclass(record)
        assert not hasattr(record, "__dict__")
        with pytest.raises(dataclasses.FrozenInstanceError):
            setattr(record, field, None)
    parameters = inspect.signature(native.bridge.run_illustrious_regional_conditioning).parameters
    assert tuple(parameters) == (
        "root",
        "negative",
        "positive",
        "latent_shape",
        "layout",
        "bindings",
        "sample",
        "timestep",
        "time_ids",
        "negative_pooled_source_id",
        "positive_pooled_source_id",
        "encoder_attention_mask",
        "tensor_profile",
    )
    assert parameters["tensor_profile"].default == "cpu-float32-v1"
    assert parameters["tensor_profile"].kind == inspect.Parameter.KEYWORD_ONLY
    assert all(item.kind != inspect.Parameter.VAR_KEYWORD for item in parameters.values())


@pytest.mark.parametrize(
    "extra",
    [
        "plan",
        "context",
        "encoder_hidden_states",
        "added_cond_kwargs",
        "cross_attention_kwargs",
        "return_dict",
    ],
)
def test_independent_plan_context_and_native_kwargs_overrides_typeerror_before_install(
    native: Any, monkeypatch: Any, extra: str
) -> None:
    root = _transformer(native)
    args = _arguments(native, root)
    args[extra] = object()
    with _tripwires(native, root, monkeypatch, finite=True), pytest.raises(TypeError):
        _run(native, root, args)


@pytest.mark.parametrize("operation", ["convert", "run"])
@pytest.mark.parametrize("profile", ["grad", "autocast"])
def test_inference_profile_required_without_silent_mode_changes(
    native: Any, monkeypatch: Any, operation: str, profile: str
) -> None:
    torch = native.torch
    root = _transformer(native)
    args = _arguments(native, root)
    source = _encode(native)
    context = (
        torch.enable_grad() if profile == "grad" else torch.autocast("cpu", dtype=torch.bfloat16)
    )
    with (
        _tripwires(native, root, monkeypatch),
        context,
        pytest.raises(native.bridge.IllustriousRegionalConditioningError) as error,
    ):
        if operation == "convert":
            _convert(native, source)
        else:
            _run(native, root, args)
    assert error.value.code == "PROFILE_INVALID"


STRUCTURAL_CASES = (
    "negative-list",
    "positive-list",
    "empty-negative",
    "empty-positive",
    "last-record",
    "last-negative-dtype",
    "last-positive-width",
    "context-rank",
    "context-batch",
    "context-empty",
    "context-dtype",
    "context-meta",
    "context-grad",
    "id-empty",
    "id-not-string",
    "id-surrogate",
    "id-utf8-over-limit",
    "id-duplicate",
    "streams-over-limit",
    "aggregate-over-limit",
    "coverage-missing",
    "coverage-wrong-grid",
    "coverage-wrong-count",
    "coverage-mutable",
    "unselected-pool-dtype",
    "unselected-pool-shape",
    "layout",
    "shape-zero",
    "shape-bool",
    "shape-over-limit",
    "sample-dtype",
    "sample-rank",
    "sample-batch",
    "sample-grid",
    "mask-dtype",
    "mask-rank",
    "mask-batch",
    "mask-keys",
    "binding-list",
    "binding-empty",
)


def _invalid_structural(native: Any, root: Any, case: str) -> tuple[dict[str, Any], str]:
    torch = native.torch
    args = _arguments(native, root)
    n, p = args["negative"][0], args["positive"][0]
    code = "INPUT_INVALID"

    def last(sign: str, **changes: Any) -> None:
        original = n if sign == "negative" else p
        args[sign] = (original, dataclasses.replace(original, binding_id="last", **changes))

    if case == "negative-list":
        args["negative"] = [n]
    elif case == "positive-list":
        args["positive"] = [p]
    elif case == "empty-negative":
        args["negative"] = ()
    elif case == "empty-positive":
        args["positive"] = ()
    elif case == "last-record":
        args["positive"] = (p, object())
    elif case == "last-negative-dtype":
        last("negative", context=n.context.double())
    elif case == "last-positive-width":
        last("positive", context=p.context[:, :, :1280])
    elif case == "context-rank":
        last("positive", context=p.context[0])
    elif case == "context-batch":
        last("positive", context=p.context.expand(2, -1, -1))
    elif case == "context-empty":
        last("positive", context=p.context[:, :0])
    elif case == "context-dtype":
        last("positive", context=p.context.to(torch.bfloat16))
    elif case == "context-meta":
        last("positive", context=torch.empty(1, 1, 2048, device="meta"))
    elif case == "context-grad":
        last("positive", context=p.context.clone().requires_grad_())
    elif case.startswith("id-"):
        invalid_ids = {
            "id-empty": "",
            "id-not-string": 42,
            "id-surrogate": "\ud800",
            "id-utf8-over-limit": "я" * 65,
            "id-duplicate": p.binding_id,
        }
        args["positive"] = (p, dataclasses.replace(p, binding_id=invalid_ids[case]))
        if case == "id-utf8-over-limit":
            code = "LIMIT"
    elif case == "streams-over-limit":
        args["negative"] = tuple(
            dataclasses.replace(n, binding_id=str(index)) for index in range(17)
        )
        code = "LIMIT"
    elif case == "aggregate-over-limit":
        # Expanded view, not a huge dense oracle or allocation.
        args["positive"] = (dataclasses.replace(p, context=p.context.expand(1, 309, 2048)),)
        code = "LIMIT"
    elif case.startswith("coverage-"):
        coverage = {
            "coverage-missing": None,
            "coverage-wrong-grid": Alpha8(Shape(3, 2), bytes(6)),
            "coverage-wrong-count": Alpha8(Shape(2, 3), bytes(5)),
            "coverage-mutable": Alpha8(Shape(2, 3), cast(Any, bytearray(6))),
        }[case]
        last("positive", coverage=coverage)
    elif case == "unselected-pool-dtype":
        last("positive", pooled=torch.zeros(1, 1280, dtype=torch.float64))
    elif case == "unselected-pool-shape":
        last("negative", pooled=torch.zeros(1, 1279))
    elif case == "layout":
        args["layout"] = "positive-first"
    elif case.startswith("shape-"):
        args["latent_shape"] = {
            "shape-zero": Shape(0, 3),
            "shape-bool": Shape(True, 3),
            "shape-over-limit": Shape(257, 3),
        }[case]
        if case == "shape-over-limit":
            code = "LIMIT"
    elif case.startswith("sample-"):
        sample = args["sample"]
        args["sample"] = {
            "sample-dtype": sample.double(),
            "sample-rank": sample[0],
            "sample-batch": sample[:1],
            "sample-grid": sample.transpose(-1, -2),
        }[case]
    elif case.startswith("mask-"):
        args["encoder_attention_mask"] = {
            "mask-dtype": torch.ones(2, 1, dtype=torch.int64),
            "mask-rank": torch.ones(2, 1, 1),
            "mask-batch": torch.ones(1, 1),
            "mask-keys": torch.ones(2, 2),
        }[case]
    elif case == "binding-list":
        args["bindings"] = list(args["bindings"])
    elif case == "binding-empty":
        args["bindings"] = ()
    else:
        raise AssertionError(case)
    return args, code


@pytest.mark.parametrize("case", STRUCTURAL_CASES)
def test_complete_structural_preflight_before_finite_scratch_snapshot_or_install(
    native: Any, monkeypatch: Any, case: str
) -> None:
    root = _transformer(native)
    args, code = _invalid_structural(native, root, case)
    with (
        _tripwires(native, root, monkeypatch, finite=True),
        pytest.raises(native.bridge.IllustriousRegionalConditioningError) as error,
    ):
        _run(native, root, args)
    assert error.value.code == code


def test_positive_only_still_validates_last_negative_before_finite_scratch(
    native: Any, monkeypatch: Any
) -> None:
    root = _transformer(native)
    args, _ = _invalid_structural(native, root, "last-negative-dtype")
    args.update(layout="positive-only", sample=args["sample"][:1])
    with (
        _tripwires(native, root, monkeypatch, finite=True),
        pytest.raises(native.bridge.IllustriousRegionalConditioningError) as error,
    ):
        _run(native, root, args)
    assert error.value.code == "INPUT_INVALID"


def test_late_structural_failure_precedes_earlier_nan_validation(
    native: Any, monkeypatch: Any
) -> None:
    root = _transformer(native)
    args, _ = _invalid_structural(native, root, "last-positive-width")
    args["negative"][0].context.fill_(float("nan"))
    with (
        _tripwires(native, root, monkeypatch, finite=True),
        pytest.raises(native.bridge.IllustriousRegionalConditioningError) as error,
    ):
        _run(native, root, args)
    assert error.value.code == "INPUT_INVALID"


@pytest.mark.parametrize(
    "site",
    [
        "last-negative-context",
        "last-positive-context",
        "unselected-pool",
        "sample",
        "time_ids",
        "timestep",
        "keymask",
    ],
)
@pytest.mark.parametrize("value", [float("nan"), float("inf")])
def test_finite_refusal_before_owned_snapshots_or_install(
    native: Any, monkeypatch: Any, site: str, value: float
) -> None:
    pair = _convert(native, _encode(native))
    root = native.pipeline.unet
    args = _arguments(native, root, negative=(pair.negative,), positive=(pair.positive,))
    if site.startswith("last-"):
        sign = "negative" if "negative" in site else "positive"
        extra = dataclasses.replace(
            args[sign][0], binding_id="last", context=args[sign][0].context.clone()
        )
        extra.context[0, 0, 0] = value
        args[sign] += (extra,)
    elif site == "unselected-pool":
        pool = pair.positive.pooled.clone()
        pool[0, 0] = value
        extra = dataclasses.replace(pair.positive, binding_id="unselected", pooled=pool)
        args["positive"] = (extra, pair.positive)
    elif site == "keymask":
        args["encoder_attention_mask"] = native.torch.ones(2, 77)
        args["encoder_attention_mask"][0, 0] = value
    else:
        args[site].view(-1)[-1] = value
    # Finite checking may allocate bounded Boolean scratch; snapshot spies stay live.
    with (
        _tripwires(native, root, monkeypatch),
        pytest.raises(native.bridge.IllustriousRegionalConditioningError) as error,
    ):
        _run(native, root, args)
    assert error.value.code == "INPUT_INVALID"


@pytest.mark.parametrize(
    "case",
    [
        "negative-missing",
        "positive-missing",
        "negative-unknown",
        "positive-wrong-sign",
        "selected-pool-missing",
        "time-missing",
        "time-shape",
        "time-dtype",
        "timestep-missing",
        "timestep-vector",
        "timestep-dtype",
    ],
)
@pytest.mark.parametrize("layout", LAYOUTS)
def test_unet_explicit_signed_pooled_and_time_refusals_before_snapshot(
    native: Any, monkeypatch: Any, case: str, layout: str
) -> None:
    pair = _convert(native, _encode(native))
    n = dataclasses.replace(pair.negative, binding_id="only-negative")
    p = dataclasses.replace(pair.positive, binding_id="only-positive")
    root = native.pipeline.unet
    args = _arguments(native, root, negative=(n,), positive=(p,), layout=layout)
    if case == "negative-missing":
        args["negative_pooled_source_id"] = None
    elif case == "positive-missing":
        args["positive_pooled_source_id"] = None
    elif case == "negative-unknown":
        args["negative_pooled_source_id"] = "unknown"
    elif case == "positive-wrong-sign":
        args["positive_pooled_source_id"] = "only-negative"
    elif case == "selected-pool-missing":
        args["negative"] = (dataclasses.replace(n, pooled=None),)
    elif case == "time-missing":
        args["time_ids"] = None
    elif case == "time-shape":
        args["time_ids"] = args["time_ids"][:, :5]
    elif case == "time-dtype":
        args["time_ids"] = args["time_ids"].double()
    elif case == "timestep-missing":
        args["timestep"] = None
    elif case == "timestep-vector":
        args["timestep"] = args["timestep"].reshape(1)
    elif case == "timestep-dtype":
        args["timestep"] = args["timestep"].to(native.torch.int64)
    with (
        _tripwires(native, root, monkeypatch, finite=True),
        pytest.raises(native.bridge.IllustriousRegionalConditioningError) as error,
    ):
        _run(native, root, args)
    assert error.value.code == "INPUT_INVALID"


@pytest.mark.parametrize(
    "field", ["timestep", "time_ids", "negative_pooled_source_id", "positive_pooled_source_id"]
)
def test_transformer_rejects_sdxl_extra_arguments_even_with_source_pools(
    native: Any, monkeypatch: Any, field: str
) -> None:
    pair = _convert(native, _encode(native))
    root = _transformer(native)
    args = _arguments(native, root, negative=(pair.negative,), positive=(pair.positive,))
    args[field] = {
        "timestep": native.torch.tensor(1.0),
        "time_ids": native.torch.zeros(2, 6),
        "negative_pooled_source_id": "stream",
        "positive_pooled_source_id": "stream",
    }[field]
    with (
        _tripwires(native, root, monkeypatch, finite=True),
        pytest.raises(native.bridge.IllustriousRegionalConditioningError) as error,
    ):
        _run(native, root, args)
    assert error.value.code == "INPUT_INVALID"


@pytest.mark.parametrize("dtype", ["bool", "float32"])
def test_root_binary_key_mask_normal_preprocessing_intersects_literal_spans(
    native: Any, monkeypatch: Any, dtype: str
) -> None:
    root = _transformer(native)
    n, p = _ordered_case(native)
    args = _arguments(native, root, negative=n, positive=p)
    args["encoder_attention_mask"] = native.torch.tensor(
        [[1, 0, 1], [1, 1, 0]], dtype=getattr(native.torch, dtype)
    )
    with _observe(native, root, monkeypatch) as seen:
        _run(native, root, args)
    masks = _mask(native, seen.masks[0], 2, 6, 3)
    assert masks[0, :, :, 0].all() and not masks[0, :, :, 1:].any()
    assert masks[1, :, :, 0].all() and not masks[1, :, :, 2].any()
    assert native.torch.equal(
        masks[1, 0, :, 1], native.torch.tensor([False, True, True, False, True, False])
    )


def test_binary_keymask_refuses_fractional_values_before_snapshots(
    native: Any, monkeypatch: Any
) -> None:
    root = _transformer(native)
    args = _arguments(native, root)
    args["encoder_attention_mask"] = native.torch.tensor([[1.0], [0.5]])
    with (
        _tripwires(native, root, monkeypatch),
        pytest.raises(native.bridge.IllustriousRegionalConditioningError) as error,
    ):
        _run(native, root, args)
    assert error.value.code == "INPUT_INVALID"


def test_sample_32mib_logical_cap_before_finite_scratch_on_expanded_view(
    native: Any, monkeypatch: Any
) -> None:
    root = _transformer(native, channels=72)
    # One underlying float; the shape exceeds 32 MiB logically without allocating it.
    args = _arguments(native, root)
    args.update(latent_shape=Shape(256, 256), sample=native.torch.zeros(1).expand(2, 72, 256, 256))
    assert args["sample"].numel() * 4 > 32 * 1024 * 1024
    with (
        _tripwires(native, root, monkeypatch, finite=True),
        pytest.raises(native.bridge.IllustriousRegionalConditioningError) as error,
    ):
        _run(native, root, args)
    assert error.value.code == "LIMIT"


def test_max_sign_length_and_16_records_accept_with_small_query_grid(native: Any) -> None:
    root = _transformer(native)
    n = _binding(native, "я" * 64, 1)
    p = _binding(native, "я" * 64, 1)
    negative = tuple(
        dataclasses.replace(
            n, binding_id=str(i), context=n.context.expand(1, 20 if i < 15 else 8, 2048)
        )
        for i in range(16)
    )
    positive = tuple(
        dataclasses.replace(
            p, binding_id=str(i), context=p.context.expand(1, 20 if i < 15 else 8, 2048)
        )
        for i in range(16)
    )
    args = _arguments(native, root, negative=negative, positive=positive, shape=Shape(1, 1))
    assert sum(record.context.shape[1] for record in negative) == 308
    assert 2 * 308 * 2048 * 4 + 2 * 1280 * 4 == 5_056_512
    assert native.torch.isfinite(_run(native, root, args).sample).all()
    # Exact 128-byte UTF-8 ID is independently accepted; same ID across signs is legal.
    args.update(negative=(n,), positive=(p,))
    assert native.torch.isfinite(_run(native, root, args).sample).all()


CONVERTER_CASES = (
    "wrong-record",
    "bool-length",
    "float-length",
    "zero-length",
    "past-k",
    "common-not-max",
    "unequal-k",
    "width",
    "zero-rows",
    "dtype",
    "negative-pool",
    "positive-pool",
    "last-coverage",
    "nonzero-terminal-padding",
    "nan",
    "inf",
    "over-limit",
)


@pytest.mark.parametrize("case", CONVERTER_CASES)
def test_converter_exact_record_lengths_paired_padding_and_complete_refusal(
    native: Any, monkeypatch: Any, case: str
) -> None:
    torch = native.torch
    root = _transformer(native)
    source: Any = SdxlConditioning(
        _tensor(native, 3),
        torch.zeros(1, 3, 2048),
        torch.zeros(1, 1280),
        torch.zeros(1, 1280),
        3,
        1,
    )
    options: dict[str, Any] = {}
    changes: dict[str, Any] = {}
    if case == "wrong-record":
        source = SimpleNamespace(**dataclasses.asdict(source))
    elif case in ("bool-length", "float-length", "zero-length", "past-k"):
        changes["negative_length"] = {
            "bool-length": True,
            "float-length": 1.0,
            "zero-length": 0,
            "past-k": 4,
        }[case]
    elif case == "common-not-max":
        changes["positive_length"] = 2
    elif case == "unequal-k":
        changes["negative"] = source.negative[:, :2]
    elif case == "width":
        changes["positive"] = source.positive[:, :, :768]
    elif case == "zero-rows":
        changes.update(
            negative=source.negative[:, :0],
            positive=source.positive[:, :0],
            positive_length=0,
            negative_length=0,
        )
    elif case == "dtype":
        changes["positive"] = source.positive.double()
    elif case == "negative-pool":
        changes["negative_pooled"] = torch.zeros(1, 1279)
    elif case == "positive-pool":
        changes["positive_pooled"] = None
    elif case == "last-coverage":
        options["positive_coverage"] = Alpha8(Shape(2, 3), bytes(5))
    elif case == "nonzero-terminal-padding":
        source.negative[:, 1:] = 1
    elif case in ("nan", "inf"):
        source.positive[0, 0, 0] = float(case)
    elif case == "over-limit":
        changes.update(
            positive=source.positive[:, :1].expand(1, 309, 2048),
            negative=source.negative[:, :1].expand(1, 309, 2048),
            positive_length=309,
        )
    if changes:
        source = dataclasses.replace(source, **changes)
    with (
        _tripwires(
            native,
            root,
            monkeypatch,
            finite=case not in ("nonzero-terminal-padding", "nan", "inf"),
        ),
        pytest.raises(native.bridge.IllustriousRegionalConditioningError) as error,
    ):
        _convert(native, source, **options)
    assert error.value.code == ("LIMIT" if case == "over-limit" else "INPUT_INVALID")


def _plan_for(args: dict[str, Any]) -> Any:
    return plan_illustrious_attention(
        latent_shape=args["latent_shape"],
        negative=tuple(
            EncodedSegment(x.binding_id, x.context.shape[1], x.coverage) for x in args["negative"]
        ),
        positive=tuple(
            EncodedSegment(x.binding_id, x.context.shape[1], x.coverage) for x in args["positive"]
        ),
        profile=PROFILE,
        layout=args["layout"],
    )


@pytest.mark.parametrize("invalid", [False, True])
def test_readonly_validator_preserves_model_and_registry_and_normal_call_still_works(
    native: Any, monkeypatch: Any, invalid: bool
) -> None:
    root = _transformer(native)
    args = _arguments(native, root)
    plan = _plan_for(args)
    bindings = args["bindings"] if not invalid else args["bindings"] * 2
    slots, state, owners = _slots(root), _state(root), dict(native.adapter._OWNERS)
    with _tripwires(native, root, monkeypatch):
        if invalid:
            with pytest.raises(native.adapter.IllustriousRegionalAdapterError) as error:
                native.adapter.validate_illustrious_regional_attention(
                    root, bindings=bindings, plan=plan
                )
            assert error.value.code == "INPUT_INVALID"
        else:
            assert (
                native.adapter.validate_illustrious_regional_attention(
                    root, bindings=bindings, plan=plan
                )
                is None
            )
        assert owners == native.adapter._OWNERS
    assert _slots(root) == slots
    _assert_state(native, root, state)
    assert native.torch.isfinite(_run(native, root, args).sample).all()
    assert owners == native.adapter._OWNERS


@pytest.mark.parametrize("case", ["train", "bad-processor", "call-entry"])
@pytest.mark.parametrize("entry", ["validator", "one-shot"])
def test_invalid_native_model_readonly_preflight_does_not_mutate_reserve_or_copy(
    native: Any, monkeypatch: Any, case: str, entry: str
) -> None:
    root = _transformer(native)
    args = _arguments(native, root)
    plan = _plan_for(args)
    if case == "train":
        root.train()
    elif case == "bad-processor":
        _first_attention(native, root).set_processor(object())
    else:
        root.__dict__["_call_impl"] = root._call_impl
    slots, owners = _slots(root), dict(native.adapter._OWNERS)
    with (
        _tripwires(native, root, monkeypatch, finite=entry == "one-shot"),
        pytest.raises(native.adapter.IllustriousRegionalAdapterError) as error,
    ):
        if entry == "validator":
            native.adapter.validate_illustrious_regional_attention(
                root, bindings=args["bindings"], plan=plan
            )
        else:
            _run(native, root, args)
    assert error.value.code == "PROFILE_INVALID"
    assert _slots(root) == slots and owners == native.adapter._OWNERS


@pytest.mark.parametrize("entry", ["validator", "one-shot"])
def test_overlapping_scope_conflict_precedes_new_bank_copy_and_preserves_outer(
    native: Any, monkeypatch: Any, entry: str
) -> None:
    root = _transformer(native)
    args = _arguments(native, root)
    plan = _plan_for(args)
    before = _slots(root)
    with native.adapter.scoped_illustrious_regional_attention(
        root, bindings=args["bindings"], plan=plan
    ):
        owners = dict(native.adapter._OWNERS)
        with (
            _tripwires(native, root, monkeypatch),
            pytest.raises(native.adapter.IllustriousRegionalAdapterError) as error,
        ):
            if entry == "validator":
                native.adapter.validate_illustrious_regional_attention(
                    root, bindings=args["bindings"], plan=plan
                )
            else:
                _run(native, root, args)
        assert error.value.code == "SCOPE_CONFLICT"
        assert owners == native.adapter._OWNERS
        # Satisfy the existing outer scope through its normal real consumer.
        context = native.torch.cat((args["negative"][0].context, args["positive"][0].context))
        root(args["sample"], encoder_hidden_states=context)
    assert _slots(root) == before
    assert native.torch.isfinite(_run(native, root, args).sample).all()


@pytest.mark.parametrize("case", ["native-original", "partial-setup", "all-masked"])
def test_failures_restore_exact_native_state_inputs_and_allow_fresh_consumer(
    native: Any, monkeypatch: Any, case: str
) -> None:
    root = _transformer(native)
    args = _arguments(native, root)
    slots, state, owners = _slots(root), _state(root), dict(native.adapter._OWNERS)
    source = tuple(
        item.clone()
        for item in (args["sample"], args["negative"][0].context, args["positive"][0].context)
    )
    failure = RuntimeError("injected original native failure")
    seen: list[str] = []
    with monkeypatch.context() as patch:
        if case == "native-original":
            original_call = native.processor_type.__call__
            attention = _first_attention(native, root)

            def failing(instance: Any, attn: Any, *a: Any, **kw: Any) -> Any:
                if attn is attention:
                    seen.append("native-original")
                    raise failure
                return original_call(instance, attn, *a, **kw)

            patch.setattr(native.processor_type, "__call__", failing)
        elif case == "partial-setup":
            register = native.torch.nn.Module.register_forward_pre_hook

            def registration(module: Any, *a: Any, **kw: Any) -> Any:
                if seen:
                    raise failure
                result = register(module, *a, **kw)
                seen.append("one-real-registration")
                return result

            patch.setattr(native.torch.nn.Module, "register_forward_pre_hook", registration)
        else:
            args["encoder_attention_mask"] = native.torch.zeros(2, 1, dtype=native.torch.bool)
        if case == "all-masked":
            with pytest.raises(native.adapter.IllustriousRegionalAdapterError) as error:
                _run(native, root, args)
            assert error.value.code == "ALL_MASKED"
        else:
            with pytest.raises(RuntimeError) as error:
                _run(native, root, args)
            assert error.value is failure
            assert len(seen) == 1
    assert _slots(root) == slots
    assert owners == native.adapter._OWNERS
    _assert_state(native, root, state)
    for original, current in zip(
        source,
        (args["sample"], args["negative"][0].context, args["positive"][0].context),
        strict=True,
    ):
        assert native.torch.equal(original, current)
    args.pop("encoder_attention_mask", None)
    assert native.torch.isfinite(_run(native, root, args).sample).all()
    assert _slots(root) == slots


def _declared_hook_case(native: Any) -> tuple[Any, dict[str, Any]]:
    """Two real-width rows per sign; swapping keys or signs changes association."""
    torch = native.torch
    root = native.pipeline.unet
    negative, positive = _ordered_case(native, equal=True)
    negative = tuple(
        dataclasses.replace(
            record, pooled=torch.linspace(-3 + index, -2 + index, 1280).reshape(1, 1280)
        )
        for index, record in enumerate(negative)
    )
    positive = tuple(
        dataclasses.replace(
            record, pooled=torch.linspace(2 + index, 3 + index, 1280).reshape(1, 1280)
        )
        for index, record in enumerate(positive)
    )
    for sign in (negative, positive):
        assert len(sign) == 2
        assert all(record.context.shape == (1, 1, 2048) for record in sign)
        assert type(sign[0].coverage) is Everywhere
        assert type(sign[1].coverage) is Alpha8
        assert not torch.equal(sign[0].context, sign[1].context)
    assert negative[1].coverage != positive[1].coverage
    args = _arguments(native, root, negative=negative, positive=positive)
    args["encoder_attention_mask"] = torch.ones(2, 2, dtype=torch.float32)
    return root, args


def _bound_hook_arguments(module: Any, args: Any, kwargs: Any) -> Any:
    signature = inspect.signature(cast(Any, type(module)).forward)
    return signature.bind_partial(module, *args, **kwargs)


def _exercise_existing_declared_input_hook(
    native: Any,
    monkeypatch: Any,
    *,
    site: str,
    field: str,
    mode: str,
) -> None:
    """Keep all native math; intervene only through an ordinary existing prehook.

    Replacement hooks construct NEW tensors and NEW argument dictionaries. They
    never change the borrowed bank, source buffers, model state, or hook tables.
    Observation hooks return None. Value-equal copies deliberately change storage
    identity, which the owner's declared-value association must tolerate.
    """
    torch = native.torch
    root, args = _declared_hook_case(native)
    transformer = args["bindings"][0].transformer
    attention = transformer.transformer_blocks[0].attn2
    target = {"root-unet": root, "first-transformer": transformer, "first-attn2": attention}[site]
    refuses = mode in ("flip-keys", "flip-cfg", "replace")
    sources = [
        tensor
        for sign in (args["negative"], args["positive"])
        for record in sign
        for tensor in (record.context, record.pooled)
    ] + [args[name] for name in ("sample", "timestep", "time_ids", "encoder_attention_mask")]
    borrowed: list[Any] = []

    def retain(label: str, tensor: Any) -> None:
        borrowed.append(
            (label, tensor, tensor.detach().clone(), tensor.untyped_storage().data_ptr())
        )

    for index, tensor in enumerate(sources):
        retain(f"source-{index}", tensor)
    slots, state, owners = _slots(root), _state(root), dict(native.adapter._OWNERS)
    literal_context = torch.cat(
        (
            _literal_context(native, args["negative"], 2),
            _literal_context(native, args["positive"], 2),
        )
    )
    with _observe(native, root, monkeypatch) as baseline:
        expected = _run(native, root, args).sample.detach().clone()
    assert len(baseline.contexts) == 1
    assert torch.equal(baseline.contexts[0], literal_context)
    assert _slots(root) == slots
    interceptions: list[Any] = []
    audits: list[Any] = []

    def audit(module: Any, original_args: Any, original_kwargs: Any) -> None:
        values = _bound_hook_arguments(module, original_args, original_kwargs).arguments
        audits.append(values["encoder_hidden_states"])
        # This observer precedes the replacement hook even when the root is its target.
        for name in ("sample", "timestep", "encoder_hidden_states", "encoder_attention_mask"):
            retain("owned-root-" + name, values[name])
        for name in ("text_embeds", "time_ids"):
            retain("owned-root-" + name, values["added_cond_kwargs"][name])

    def intervene(module: Any, original_args: Any, original_kwargs: Any) -> Any:
        bound = _bound_hook_arguments(module, original_args, original_kwargs)
        values = bound.arguments
        nested = field in ("text_embeds", "time_ids")
        original = values["added_cond_kwargs"][field] if nested else values[field]
        retain("hook-original-" + field, original)
        if mode == "observe":
            interceptions.append((original, None))
            return None
        if mode == "clone":
            replacement = original.clone()
        elif mode == "flip-keys":
            replacement = original.flip(1)
        elif mode == "flip-cfg":
            replacement = original.flip(0)
        elif field == "encoder_attention_mask":
            # Binary, same shape; the global key stays allowed for every query.
            replacement = original - original.new_tensor([[0, 1], [0, 0]])
        else:
            replacement = original + 0.25
        assert replacement is not original
        assert replacement.untyped_storage().data_ptr() != original.untyped_storage().data_ptr()
        assert replacement.shape == original.shape
        assert replacement.dtype == original.dtype == torch.float32
        assert replacement.device == original.device
        assert replacement.layout == original.layout
        assert not replacement.requires_grad and replacement.grad_fn is None
        assert torch.isfinite(replacement).all()
        assert torch.equal(replacement, original) == (mode == "clone")
        if field == "encoder_attention_mask":
            assert ((replacement == 0) | (replacement == 1)).all()
        if nested:
            # Never edit the passed-in added_cond_kwargs mapping in place.
            bound.arguments["added_cond_kwargs"] = {
                **values["added_cond_kwargs"],
                field: replacement,
            }
        else:
            bound.arguments[field] = replacement
        retain("hook-returned-" + field, replacement)
        interceptions.append((original, replacement))
        # BoundArguments includes native forward's self; Module.__call__ supplies it.
        return bound.args[1:], dict(bound.kwargs)

    handles: list[Any] = []
    try:
        handles.append(root.register_forward_pre_hook(audit, with_kwargs=True))
        handles.append(target.register_forward_pre_hook(intervene, with_kwargs=True))
        installed = _slots(root)
        with _observe(native, root, monkeypatch) as seen:
            if refuses:
                with pytest.raises(native.bridge.IllustriousRegionalConditioningError) as error:
                    _run(native, root, args)
                assert error.value.code == "INPUT_INVALID"
                # Observe the exact ORIGINAL first processor, not a synthetic result.
                assert all(
                    not items for items in (seen.contexts, seen.queries, seen.masks, seen.outputs)
                )
                assert seen.results == []
            else:
                result = _run(native, root, args)
                assert len(seen.contexts) == len(seen.outputs) == len(seen.results) == 1
                assert result is seen.results[0]
                assert torch.equal(result.sample, expected)
                assert torch.isfinite(result.sample).all()
                assert torch.equal(seen.contexts[0], literal_context)
                assert torch.equal(seen.masks[0], baseline.masks[0])
                assert torch.equal(seen.outputs[0], baseline.outputs[0])
        assert len(audits) == len(interceptions) == 1
        assert _slots(root) == installed
        assert owners == native.adapter._OWNERS
        _assert_state(native, root, state)
        for label, tensor, snapshot, pointer in borrowed:
            assert torch.equal(tensor, snapshot), label
            assert tensor.untyped_storage().data_ptr() == pointer, label
        # Refusal/success must retain exactly the existing hook identities.
        assert root._forward_pre_hooks[handles[0].id] is audit
        assert target._forward_pre_hooks[handles[1].id] is intervene
    finally:
        for handle in reversed(handles):
            handle.remove()
    assert _slots(root) == slots
    assert owners == native.adapter._OWNERS
    # A fresh normal consumer after removal proves the failed owner left no latch.
    assert torch.equal(_run(native, root, args).sample, expected)
    assert _slots(root) == slots
    _assert_state(native, root, state)


@pytest.mark.parametrize("site", ["root-unet", "first-transformer", "first-attn2"])
@pytest.mark.parametrize("mode", ["flip-keys", "flip-cfg"])
def test_existing_context_replacement_hook_refused_before_original_attention(
    native: Any, monkeypatch: Any, site: str, mode: str
) -> None:
    """RED regression: same-shape context replacements retarget declared streams."""
    _exercise_existing_declared_input_hook(
        native, monkeypatch, site=site, field="encoder_hidden_states", mode=mode
    )


@pytest.mark.parametrize("site", ["root-unet", "first-transformer", "first-attn2"])
@pytest.mark.parametrize("mode", ["clone", "observe"])
def test_existing_context_hook_equal_value_controls_consume_native_attention(
    native: Any, monkeypatch: Any, site: str, mode: str
) -> None:
    """GREEN controls: association follows exact values, not pointer identity."""
    _exercise_existing_declared_input_hook(
        native, monkeypatch, site=site, field="encoder_hidden_states", mode=mode
    )


@pytest.mark.parametrize(
    "field", ["sample", "timestep", "text_embeds", "time_ids", "encoder_attention_mask"]
)
def test_existing_root_declared_input_replacement_refused_before_original_attention(
    native: Any, monkeypatch: Any, field: str
) -> None:
    """RED regression: original native inputs retain their declared exact values."""
    _exercise_existing_declared_input_hook(
        native, monkeypatch, site="root-unet", field=field, mode="replace"
    )


@pytest.mark.parametrize(
    "field", ["sample", "timestep", "text_embeds", "time_ids", "encoder_attention_mask"]
)
def test_existing_root_declared_input_equal_clone_preserves_native_consumer(
    native: Any, monkeypatch: Any, field: str
) -> None:
    """GREEN controls: value-equal replacements of each declared input are allowed."""
    _exercise_existing_declared_input_hook(
        native, monkeypatch, site="root-unet", field=field, mode="clone"
    )


def test_partial_owned_guard_registration_failure_restores_native_state_and_recovers(
    native: Any, monkeypatch: Any
) -> None:
    """Fail the second NEW bridge guard after the unchanged adapter installed.

    The first bridge guard gets a real native handle. Arming depends on the real
    old Scope.install returning, never on how many hooks that adapter registers.
    Native installation, restoration and subsequent forward all remain real.
    """
    torch = native.torch
    root, args = _declared_hook_case(native)
    attention = _first_attention(native, root)
    sources = [
        tensor
        for sign in (args["negative"], args["positive"])
        for record in sign
        for tensor in (record.context, record.pooled)
    ] + [args[name] for name in ("sample", "timestep", "time_ids", "encoder_attention_mask")]
    source_snapshots = [tensor.detach().clone() for tensor in sources]
    initial_slots, state, owners = _slots(root), _state(root), dict(native.adapter._OWNERS)
    existing_calls: list[Any] = []
    existing_handles: list[Any] = []
    bridge_handles: list[Any] = []

    def existing_observer(module: Any, _args: Any, _kwargs: Any) -> None:
        existing_calls.append(module)

    try:
        existing_handles.append(root.register_forward_pre_hook(existing_observer, with_kwargs=True))
        existing_handles.append(
            attention.register_forward_pre_hook(existing_observer, with_kwargs=True)
        )
        slots = _slots(root)
        with _observe(native, root, monkeypatch) as baseline:
            expected = _run(native, root, args).sample.detach().clone()
        assert len(baseline.contexts) == 1
        assert len(existing_calls) == 2
        existing_calls.clear()
        original_install = native.adapter._Scope.install
        original_register = torch.nn.Module.register_forward_pre_hook
        original_processor_call = native.processor_type.__call__
        failure = RuntimeError("injected second owned bridge guard registration failure")
        armed = False
        installs: list[Any] = []
        guard_attempts: list[Any] = []
        original_processor_calls: list[Any] = []
        events: list[str] = []

        def install(scope: Any, *positional: Any, **keywords: Any) -> Any:
            nonlocal armed
            assert not armed
            installs.append(scope)
            events.append("old-install-enter")
            result = original_install(scope, *positional, **keywords)
            # Only a successfully completed REAL old installation arms failure.
            events.append("old-install-return")
            armed = True
            return result

        def register(module: Any, *positional: Any, **keywords: Any) -> Any:
            if not armed:
                return original_register(module, *positional, **keywords)
            guard_attempts.append(module)
            if len(guard_attempts) == 2:
                events.append("bridge-guard-2-failed")
                raise failure
            handle = original_register(module, *positional, **keywords)
            assert handle.id in module._forward_pre_hooks
            bridge_handles.append((module, handle))
            events.append("bridge-guard-1-returned")
            return handle

        def processor(instance: Any, attn: Any, *positional: Any, **keywords: Any) -> Any:
            original_processor_calls.append(attn)
            return original_processor_call(instance, attn, *positional, **keywords)

        with monkeypatch.context() as patch:
            patch.setattr(native.adapter._Scope, "install", install)
            patch.setattr(torch.nn.Module, "register_forward_pre_hook", register)
            patch.setattr(native.processor_type, "__call__", processor)
            with pytest.raises(RuntimeError) as error:
                _run(native, root, args)
            assert error.value is failure
            assert len(installs) == 1
            assert len(guard_attempts) == 2
            assert len(bridge_handles) == 1
            assert events == [
                "old-install-enter",
                "old-install-return",
                "bridge-guard-1-returned",
                "bridge-guard-2-failed",
            ]
            assert original_processor_calls == []
            assert existing_calls == []
            module, first_handle = bridge_handles[0]
            # Keep the real returned handle alive; production must have removed it.
            assert first_handle.id not in module._forward_pre_hooks
            assert _slots(root) == slots
            assert owners == native.adapter._OWNERS
            _assert_state(native, root, state)
        for tensor, snapshot in zip(sources, source_snapshots, strict=True):
            assert torch.equal(tensor, snapshot)
        with _observe(native, root, monkeypatch) as fresh:
            result = _run(native, root, args)
        assert result is fresh.results[0]
        assert len(fresh.contexts) == len(fresh.outputs) == len(fresh.results) == 1
        assert torch.equal(result.sample, expected)
        assert torch.isfinite(result.sample).all()
        assert torch.equal(fresh.contexts[0], baseline.contexts[0])
        assert torch.equal(fresh.masks[0], baseline.masks[0])
        assert len(existing_calls) == 2
        assert _slots(root) == slots
        assert owners == native.adapter._OWNERS
        _assert_state(native, root, state)
    finally:
        # Teardown is after the cleanup assertions; it cannot conceal a leak.
        for _module, handle in reversed(bridge_handles):
            handle.remove()
        for handle in reversed(existing_handles):
            handle.remove()
    assert _slots(root) == initial_slots
    assert owners == native.adapter._OWNERS
