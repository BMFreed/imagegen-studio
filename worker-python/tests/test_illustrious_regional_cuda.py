"""Authored CUDA contracts; root alone collects, executes and mutates.

Random local native models prove private mechanics, never Main transport,
installed checkpoint identity, trained quality, public readiness or capacity.
Optional packages/hardware may skip in base CI; GPU qualification needs zero
skips. No downloads, artifacts, backend forcing or allocator policy changes.

Root mutation pair: remove ONLY second-step spatial restrictions, preserving
padding, context, pools, seed, ranges, dtype/device and native mathematics.
test_cuda_second_step_spatial_mutation_red observes permissions on BOTH calls
and actual downstream Euler predictions. The unaffected two-step control is
test_cuda_zero_region_spatial_control_green. No mutation is implemented here.
The force_upcast mutation pair is the explicitly named refusal/manual control.
"""

from __future__ import annotations

import copy
import dataclasses
import importlib
import inspect
import math
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from functools import wraps
from types import SimpleNamespace
from typing import Any, cast

import pytest

from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.illustrious_regional_attention import (
    EncodedSegment,
    Everywhere,
    Shape,
    plan_illustrious_attention,
)
from imagegen_worker.inference import build_sdxl_conditioning, select_inference_scheduler
from imagegen_worker.inference_embeddings import EmbeddingConditioningInputs
from test_illustrious_regional_attention_adapter import (
    _context as _small_context,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_attention_adapter import (
    _plan as _small_plan,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_attention_adapter import (
    _transformer as _small_transformer,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_conditioning import (
    _assert_ranges,  # pyright: ignore[reportPrivateUsage]
    _bindings,  # pyright: ignore[reportPrivateUsage]
    _first_attention,  # pyright: ignore[reportPrivateUsage]
    _slots,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_conditioning import (
    native as _cpu_builder,
)
from test_illustrious_regional_denoising import (
    _copy_tensors,  # pyright: ignore[reportPrivateUsage]
    _fixed_parameters,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_denoising import (
    _observe as _cpu_observer,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_denoising import (
    _preserved as _cpu_preserved,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    BBOX,
    LAYOUTS,
    LOCAL_ALPHA,
    LOCAL_VISIBLE,
    REGIONS,
    _coverage,  # pyright: ignore[reportPrivateUsage]
    _no_encoding,  # pyright: ignore[reportPrivateUsage]
    _parameters,  # pyright: ignore[reportPrivateUsage]
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
)

ENCODING = "ordinary-canvas-static-dualclip-cuda-fp16-v1"
EXECUTION = "ordinary-canvas-euler-txt2img-cuda-fp16-v1"
TENSORS = "cuda-float16-v1"
CPU_ENCODING = "ordinary-canvas-static-dualclip-cpu-v1"
CPU_EXECUTION = "ordinary-canvas-euler-txt2img-cpu-v1"
NUMERICAL = "alpha8-ge128-ceil2x2-max-v1"


@pytest.fixture(scope="module")
def gpu() -> Iterator[Any]:
    """Own a separate invocation of the real-width native fixture builder.

    Calling its unwrapped generator constructs new models/tokenizers, rather
    than requesting/reconfiguring another module's cached CPU fixture. All
    placement, half conversion, eval and lazy CLIP initialization happen here,
    before any observed consumer. The unused one-shot VAE exception has its
    own control below. No native package is imported by static author checks.
    """
    torch = pytest.importorskip("torch")
    if not torch.cuda.is_available():
        pytest.skip("optional native CUDA hardware unavailable")
    # Explicit device 0, with all-device RNG preservation during fixture setup.
    with torch.random.fork_rng(devices=list(range(torch.cuda.device_count()))):
        builder: Generator[Any] = cast(Any, _cpu_builder).__wrapped__()
        base: Any = next(builder)
        try:
            with torch.no_grad():
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
                    text_encoder=base.pipeline.text_encoder,
                    text_encoder_2=base.pipeline.text_encoder_2,
                    tokenizer=base.pipeline.tokenizer,
                    tokenizer_2=base.pipeline.tokenizer_2,
                    unet=base.pipeline.unet,
                    scheduler=base.pipeline.scheduler,
                    add_watermarker=False,
                )
                for model in (pipeline.text_encoder, pipeline.text_encoder_2, pipeline.unet, vae):
                    model.to(device="cuda:0", dtype=torch.float16).eval()
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
                    }
                )
                _encode(native, "cat", "blur")
                assert pipeline.vae_scale_factor == 8
                for encoder in (pipeline.text_encoder, pipeline.text_encoder_2):
                    assert encoder.text_model._output_capturing_hooks_installed is True
                yield native
        finally:
            builder.close()


@contextmanager
def _preserved(native: Any) -> Generator[None]:
    """Extend the existing exact lifecycle oracle to CUDA and all native buffers.

    The reused oracle includes every root forward slot (including absence),
    nested call slots, hooks/processors, weights, configs, vocabulary, borrowed
    pipeline/scheduler dictionaries and both reservation registries. Supplement
    its value comparison with exact parameter/buffer identity/device/dtype,
    including nonpersistent integer/bool buffers, and every CUDA RNG state.
    """
    torch = native.torch
    roots = tuple(
        getattr(native.pipeline, name) for name in ("text_encoder", "text_encoder_2", "unet", "vae")
    )
    state = tuple(
        (module, name, value, value.device, value.dtype, value.detach().clone())
        for root in roots
        for module in root.modules()
        for mapping in (module._parameters, module._buffers)
        for name, value in mapping.items()
        if value is not None
    )
    torch.cuda.synchronize(0)  # Observation boundary, never per kernel/layer.
    cuda_rng = tuple(value.clone() for value in torch.cuda.get_rng_state_all())
    with _cpu_preserved(native):
        try:
            yield
        finally:
            torch.cuda.synchronize(0)
            for module, name, value, device, dtype, contents in state:
                actual = getattr(module, name)
                assert actual is value and actual.device == device and actual.dtype == dtype
                assert torch.equal(actual, contents)
            assert all(
                torch.equal(actual, expected)
                for actual, expected in zip(torch.cuda.get_rng_state_all(), cuda_rng, strict=True)
            )


@pytest.fixture(autouse=True)
def preserved_gpu(gpu: Any) -> Generator[None]:
    with _preserved(gpu):
        yield


def _args(native: Any, *, layout: str = LAYOUTS[0], **changes: Any) -> dict[str, Any]:
    return {
        "pipeline": native.pipeline,
        "runtime": native.runtime,
        "parameters": _parameters(
            scheduler="euler", vae_precision="FP16", cfg_scale=5.0 if layout == LAYOUTS[0] else 1.0
        ),
        "profile": ENCODING,
        "denoising_profile": EXECUTION,
        "global_negative_coverage": Everywhere(),
        "global_positive_coverage": Everywhere(),
        "negative_pooled_source_id": "current-canvas",
        "positive_pooled_source_id": "current-canvas",
        "bindings": _bindings(native, native.pipeline.unet),
        "layout": layout,
        **changes,
    }


def _run(native: Any, recipe: Any, args: dict[str, Any] | None = None) -> Any:
    return native.denoising.run_current_canvas_regional_denoising(
        recipe, **(_args(native) if args is None else args)
    )


def _encode(native: Any, positive: str, negative: str) -> Any:
    return build_sdxl_conditioning(
        _parameters(positive, negative, scheduler="euler", vae_precision="FP16"),
        native.pipeline,
        native.runtime,
        embedding_inputs=EmbeddingConditioningInputs((positive, negative), (None, None)),
    )


def _half(native: Any, value: Any) -> Any:
    return native.torch.as_tensor(value, dtype=native.torch.float16, device="cuda:0")


def _profile(native: Any, value: Any, *, dtype: Any = None) -> None:
    assert type(value) is native.torch.Tensor
    assert value.device == native.torch.device("cuda:0")
    assert value.dtype == (native.torch.float16 if dtype is None else dtype)
    assert not value.requires_grad and native.torch.isfinite(value).all()


def _bank(native: Any, streams: tuple[Any, ...], sign: str, keys: int) -> Any:
    bank = native.torch.zeros((1, keys, 2048), dtype=native.torch.float16, device="cuda:0")
    cursor = 0
    for stream in streams:
        if stream is not None:
            length = getattr(stream, sign + "_length")
            source = getattr(stream, sign)
            _profile(native, source)
            bank[:, cursor : cursor + length] = source[:, :length]
            cursor += length
    return bank


def _permissions(
    native: Any,
    *,
    negative: tuple[int, ...],
    positive: tuple[int, ...],
    visibility: tuple[tuple[bool, ...], ...] = (LOCAL_VISIBLE,),
    layout: str = LAYOUTS[0],
    heads: int = 2,
    queries: int = 6,
) -> Any:
    """Literal independent spans; no production plan/pyramid result reads."""
    keys = max(sum(negative), sum(positive))
    signs = (0, 1) if layout == LAYOUTS[0] else (1,)
    result = native.torch.zeros(
        (len(signs), heads, queries, keys), dtype=native.torch.bool, device="cuda:0"
    )
    for batch, sign in enumerate(signs):
        cursor = 0
        for index, length in enumerate((negative, positive)[sign]):
            for query in range(queries):
                visible = index == 0 or visibility[index - 1][query]
                result[batch, :, query, cursor : cursor + length] = visible
            cursor += length
    return result


def _mask(native: Any, value: Any, batch: int, heads: int, queries: int, keys: int) -> Any:
    assert type(value) is native.torch.Tensor
    assert value.device == native.torch.device("cuda:0")
    assert value.dtype == native.torch.bool  # Owned final SDPA permissions stay exact.
    if value.ndim == 3:
        value = value.reshape(batch, -1, value.shape[-2], keys)
    return value.expand(batch, heads, queries, keys)


@contextmanager
def _observe(native: Any, monkeypatch: Any) -> Generator[Any]:
    """Transparent CLASS spies installed before admission; no UNet/VAE hooks.

    Reuse the original whole-loop observer and add every actual Transformer
    parent grid and cross-attention consumption. All original calls and return
    identities remain unchanged. The processor spy delegates original SDPA.
    """
    transformer_type = native.diffusers.Transformer2DModel
    parent_forward = transformer_type.forward
    processor_call = native.processor_type.__call__
    parents = {
        id(value) for value in native.pipeline.unet.modules() if type(value) is transformer_type
    }
    sites = {
        id(block.attn2): (parent, block.attn2)
        for parent in native.pipeline.unet.modules()
        if type(parent) is transformer_type
        for block in parent.transformer_blocks
    }
    grids: list[Any] = []
    consumed: list[Any] = []

    @wraps(parent_forward)
    def parent(current: Any, *args: Any, **kwargs: Any) -> Any:
        if id(current) in parents:
            hidden = args[0] if args else kwargs["hidden_states"]
            grids.append((current, tuple(hidden.shape[-2:])))
        return parent_forward(current, *args, **kwargs)

    @wraps(processor_call)
    def processor(current: Any, attention: Any, *args: Any, **kwargs: Any) -> Any:
        selected = id(attention) in sites
        record = None
        if selected:
            record = SimpleNamespace(
                attention=attention,
                parent=sites[id(attention)][0],
                queries=args[0].detach().clone(),
                context=kwargs["encoder_hidden_states"].detach().clone(),
                mask=_copy_tensors(native, kwargs.get("attention_mask")),
            )
        result = processor_call(current, attention, *args, **kwargs)
        if record is not None:
            record.output = result.detach().clone()
            consumed.append(record)
        return result

    with monkeypatch.context() as patch:
        patch.setattr(transformer_type, "forward", parent)
        patch.setattr(native.processor_type, "__call__", processor)
        with _cpu_observer(native.denoising, native, monkeypatch) as seen:
            seen.grids, seen.consumed = grids, consumed
            yield seen


def _image(native: Any, result: Any, shape: tuple[int, int] = (16, 24)) -> Any:
    output = importlib.import_module(
        "diffusers.pipelines.stable_diffusion_xl.pipeline_output"
    ).StableDiffusionXLPipelineOutput
    assert type(result) is output
    _profile(native, result.images)
    assert tuple(result.images.shape) == (1, 3, *shape)
    return result.images


def _lifecycle(
    native: Any, seen: Any, result: Any, steps: int, shape: tuple[int, int] = (16, 24)
) -> None:
    _image(native, result, shape)
    assert seen.pipeline_results == [result]
    assert seen.pipelines[0] is not native.pipeline
    assert seen.pipelines[0].unet is native.pipeline.unet
    assert seen.pipelines[0].vae is native.pipeline.vae
    assert len(seen.root_inputs) == len(seen.unet_results) == len(seen.steps) == steps
    assert len(seen.decodes) == len(seen.decode_results) == 1
    assert seen.decode_reserved == [True]
    assert seen.events == [event for _ in range(steps) for event in ("unet", "step")] + ["decode"]
    assert seen.generators[0].device.type == "cpu"
    assert seen.generators[0].initial_seed() == 42
    scheduler = seen.schedulers[0]
    assert scheduler is not native.pipeline.scheduler
    assert type(scheduler) is native.diffusers.EulerDiscreteScheduler
    config = scheduler.config
    assert config.beta_schedule == "scaled_linear" and config.trained_betas is None
    assert config.beta_start == 0.00085 and config.beta_end == 0.012
    assert config.num_train_timesteps == 1000 and config.steps_offset == 1
    assert config.timestep_spacing == "linspace" and config.rescale_betas_zero_snr is False
    assert config.prediction_type == "epsilon"
    for root, prediction, transition in zip(
        seen.root_inputs, seen.unet_results, seen.steps, strict=True
    ):
        _profile(native, root["sample"])
        _profile(native, root["timestep"], dtype=native.torch.float32)
        assert root["timestep"].ndim == 0
        _profile(native, root["encoder_hidden_states"])
        for value in root["added_cond_kwargs"].values():
            _profile(native, value)
        tensor: Any = (
            cast(tuple[Any, ...], prediction)[0]
            if isinstance(prediction, tuple)
            else prediction.sample
        )
        _profile(native, tensor)
        _profile(native, transition["model_output"])
    _profile(native, seen.decodes[0])
    decoded = seen.decode_results[0]
    _profile(native, decoded[0] if isinstance(decoded, tuple) else decoded.sample)


def _assert_consumption(native: Any, seen: Any, context: Any, pools: Any, permissions: Any) -> None:
    batch, heads, queries, keys = permissions.shape
    assert seen.consumed
    for root in seen.root_inputs:
        assert native.torch.equal(root["encoder_hidden_states"], context)
        assert native.torch.equal(root["added_cond_kwargs"]["text_embeds"], pools)
        expected_time = _half(native, [[1024, 1024, 0, 0, 1024, 1024]]).repeat(batch, 1)
        assert native.torch.equal(root["added_cond_kwargs"]["time_ids"], expected_time)
    for record in seen.consumed:
        assert native.torch.equal(record.context, context)
        assert native.torch.equal(
            _mask(native, record.mask, batch, heads, queries, keys), permissions
        )
        _profile(native, record.queries)
        _profile(native, record.output)


def _errors(native: Any) -> tuple[type[Exception], ...]:
    return (
        native.recipe.IllustriousRegionalRecipeError,
        native.denoising.IllustriousRegionalDenoisingError,
        native.adapter.IllustriousRegionalAdapterError,
        native.bridge.IllustriousRegionalConditioningError,
    )


@pytest.mark.parametrize("layout", LAYOUTS)
@pytest.mark.parametrize("steps", [1, 2])
def test_cuda_whole_recipe_real_clip_compel_euler_decode(
    gpu: Any, monkeypatch: Any, layout: str, steps: int
) -> None:
    long_text = " ".join(["cat"] * 26)
    global_stream = _encode(gpu, "cat", "blur")
    regional_stream = _encode(gpu, long_text, "grain")
    assert (regional_stream.negative_length, regional_stream.positive_length) == (77, 154)
    context = gpu.torch.cat(
        tuple(
            _bank(gpu, (global_stream, regional_stream), sign, 231)
            for sign in ("negative", "positive")
        )
    )
    pools = gpu.torch.cat((regional_stream.negative_pooled, regional_stream.positive_pooled))
    if layout == LAYOUTS[1]:
        context, pools = context[1:2], pools[1:2]
    args = _args(
        gpu,
        layout=layout,
        negative_pooled_source_id=REGIONS[0],
        positive_pooled_source_id=REGIONS[0],
    )
    args["parameters"] = dataclasses.replace(args["parameters"], steps=steps)
    with _observe(gpu, monkeypatch) as seen:
        result = _run(gpu, _recipe(_region(positive=long_text)), args)
    _lifecycle(gpu, seen, result, steps)
    _assert_consumption(
        gpu,
        seen,
        context,
        pools,
        _permissions(gpu, negative=(77, 77), positive=(77, 154), layout=layout),
    )
    assert seen.builds == [("cat", "blur"), (long_text, "grain")]
    assert [text for text, width in seen.clips if width == 768] == [
        "cat",
        "blur",
        long_text,
        "grain",
    ]
    assert {width for _, width in seen.clips} == {768, 1280}
    plan = seen.scopes[0].plan
    _assert_ranges(plan, "negative", (("current-canvas", 0, 77), (REGIONS[0], 77, 154)))
    _assert_ranges(plan, "positive", (("current-canvas", 0, 77), (REGIONS[0], 77, 231)))
    if layout == LAYOUTS[0]:
        assert gpu.torch.count_nonzero(context[0, 154:]) == 0


@pytest.mark.parametrize("layout", LAYOUTS)
def test_cuda_order_inherited_local_empty_negative_only_and_zero_support(
    gpu: Any, monkeypatch: Any, layout: str
) -> None:
    global_stream = _encode(gpu, "cat", "blur")
    inherited = _encode(gpu, "", "blur")
    empty = _encode(gpu, "", "")
    local = _encode(gpu, "dog", "grain")
    regions = (
        _region(0, positive=None, negative="blur", inherited=True),
        _region(1, positive="", negative=""),
        _region(2, positive="dog", kind="intersecting-empty"),
    )
    context = gpu.torch.cat(
        (
            _bank(gpu, (global_stream, inherited, empty, local), "negative", 308),
            _bank(gpu, (global_stream, None, empty, local), "positive", 308),
        )
    )
    pools = gpu.torch.cat((empty.negative_pooled, empty.positive_pooled))
    args = _args(
        gpu,
        layout=layout,
        negative_pooled_source_id=REGIONS[1],
        positive_pooled_source_id=REGIONS[1],
    )
    if layout == LAYOUTS[1]:
        context, pools = context[1:2], pools[1:2]
    with _observe(gpu, monkeypatch) as seen:
        result = _run(gpu, _recipe(*regions), args)
    _lifecycle(gpu, seen, result, 2)
    _assert_consumption(
        gpu,
        seen,
        context,
        pools,
        _permissions(
            gpu,
            negative=(77, 77, 77, 77),
            positive=(77, 0, 77, 77),
            visibility=(LOCAL_VISIBLE, LOCAL_VISIBLE, (False,) * 6),
            layout=layout,
        ),
    )
    plan = seen.scopes[0].plan
    _assert_ranges(
        plan,
        "negative",
        (
            ("current-canvas", 0, 77),
            (REGIONS[0], 77, 154),
            (REGIONS[1], 154, 231),
            (REGIONS[2], 231, 308),
        ),
    )
    _assert_ranges(
        plan, "positive", (("current-canvas", 0, 77), (REGIONS[1], 77, 154), (REGIONS[2], 154, 231))
    )
    assert seen.builds == [("cat", "blur"), ("", "blur"), ("", ""), ("dog", "grain")]
    assert empty.positive_length == empty.negative_length == 77
    assert gpu.torch.count_nonzero(empty.negative) == 0
    assert gpu.torch.count_nonzero(empty.negative_pooled) == 0
    # Empty positive owns 77 zero rows; absence contributed no positive span.
    assert gpu.torch.count_nonzero(empty.positive) == 0


def test_cuda_second_step_spatial_mutation_red(gpu: Any, monkeypatch: Any) -> None:
    global_stream, local = _encode(gpu, "cat", "blur"), _encode(gpu, "dog", "grain")
    context = gpu.torch.cat(
        tuple(_bank(gpu, (global_stream, local), sign, 154) for sign in ("negative", "positive"))
    )
    pools = gpu.torch.cat((global_stream.negative_pooled, global_stream.positive_pooled))
    observations: list[tuple[Any, Any]] = []
    for alpha, visible in (
        (LOCAL_ALPHA, LOCAL_VISIBLE),
        (bytes((0, 255, 255, 0, 255, 0)), (False, True, True, False, True, False)),
    ):
        region = _region()
        region["coverage"] = _coverage(alpha)
        with _observe(gpu, monkeypatch) as seen:
            result = _run(gpu, _recipe(region))
        _lifecycle(gpu, seen, result, 2)
        # Permission assertion covers every original processor on BOTH steps.
        _assert_consumption(
            gpu,
            seen,
            context,
            pools,
            _permissions(gpu, negative=(77, 77), positive=(77, 77), visibility=(visible,)),
        )
        observations.append((seen, result.images.clone()))
    (left, left_image), (right, right_image) = observations
    assert gpu.torch.equal(left.root_inputs[0]["sample"], right.root_inputs[0]["sample"])
    for step in (0, 1):
        # Actual native CFG prediction entering original Euler, not a synthetic
        # oracle or final-pixel locality assertion.
        assert not gpu.torch.equal(
            left.steps[step]["model_output"], right.steps[step]["model_output"]
        )
    assert not gpu.torch.equal(left_image, right_image)


def _ordinary(native: Any, parameters: Any) -> Any:
    source = native.pipeline
    fresh = native.diffusers.StableDiffusionXLPipeline(
        vae=source.vae,
        text_encoder=source.text_encoder,
        text_encoder_2=source.text_encoder_2,
        tokenizer=source.tokenizer,
        tokenizer_2=source.tokenizer_2,
        unet=source.unet,
        scheduler=select_inference_scheduler(_fixed_parameters(parameters), source, native.runtime),
        add_watermarker=False,
    )
    fresh.set_progress_bar_config(disable=True)
    encoded = _encode(native, parameters.positive_prompt, parameters.negative_prompt)
    return fresh(
        prompt_embeds=encoded.positive,
        negative_prompt_embeds=encoded.negative,
        pooled_prompt_embeds=encoded.positive_pooled,
        negative_pooled_prompt_embeds=encoded.negative_pooled,
        width=24,
        height=16,
        num_inference_steps=parameters.steps,
        guidance_scale=parameters.cfg_scale,
        guidance_rescale=0.0,
        num_images_per_prompt=1,
        original_size=(1024, 1024),
        target_size=(1024, 1024),
        negative_original_size=(1024, 1024),
        negative_target_size=(1024, 1024),
        crops_coords_top_left=(0, 0),
        negative_crops_coords_top_left=(0, 0),
        generator=native.torch.Generator(device="cpu").manual_seed(parameters.seed),
        output_type="pt",
    )


@pytest.mark.parametrize("layout", LAYOUTS)
def test_cuda_zero_region_spatial_control_green(gpu: Any, monkeypatch: Any, layout: str) -> None:
    args = _args(gpu, layout=layout)
    ordinary = _ordinary(gpu, args["parameters"])
    with _observe(gpu, monkeypatch) as first:
        result = _run(gpu, _recipe(), args)
    with _observe(gpu, monkeypatch) as second:
        repeated = _run(gpu, _recipe(), args)
    _lifecycle(gpu, first, result, 2)
    _lifecycle(gpu, second, repeated, 2)
    # Historical CUDA qualification measured max abs difference 0.0009765625
    # when the adapter supplied an all-true mask instead of native None.
    # The single unrestricted bank now preserves native None. Keep this earlier
    # bound as a neighboring regression check; the dedicated native-mask and
    # trained tests require exact ordinary execution for that path. No particular
    # fused kernel or general FP16 error bound is claimed.
    gpu.torch.testing.assert_close(result.images, _image(gpu, ordinary), atol=0.001, rtol=0.001)
    assert gpu.torch.equal(result.images, repeated.images)
    assert first.generators[0] is not second.generators[0]
    assert first.schedulers[0] is not second.schedulers[0]
    assert first.builds == second.builds == [("cat", "blur")]
    for record in first.consumed + second.consumed:
        if record.mask is not None:
            assert _mask(gpu, record.mask, 2 if layout == LAYOUTS[0] else 1, 2, 6, 77).all()


def test_cuda_changed_seed_changes_actual_native_output(gpu: Any) -> None:
    baseline = _run(gpu, _recipe())
    recipe, args = _recipe(), _args(gpu)
    recipe["item"]["seed"] = 43
    args["parameters"] = dataclasses.replace(args["parameters"], seed=43)
    changed = _run(gpu, recipe, args)
    assert not gpu.torch.equal(_image(gpu, baseline), _image(gpu, changed))


@pytest.fixture(scope="module")
def multires(gpu: Any) -> Any:
    """Separate owned three-stage native UNet, configured before observation."""
    with gpu.torch.random.fork_rng(devices=[0]), gpu.torch.no_grad():
        gpu.torch.manual_seed(261026)
        unet = (
            gpu.diffusers.UNet2DConditionModel(
                sample_size=16,
                in_channels=4,
                out_channels=4,
                layers_per_block=1,
                block_out_channels=(8, 16, 16),
                down_block_types=("DownBlock2D", "CrossAttnDownBlock2D", "CrossAttnDownBlock2D"),
                up_block_types=("CrossAttnUpBlock2D", "CrossAttnUpBlock2D", "UpBlock2D"),
                cross_attention_dim=2048,
                attention_head_dim=2,
                addition_embed_type="text_time",
                addition_time_embed_dim=4,
                projection_class_embeddings_input_dim=1304,
                norm_num_groups=4,
                dropout=0.0,
            )
            .eval()
            .to(device="cuda:0", dtype=gpu.torch.float16)
        )
    source = gpu.pipeline
    pipeline = gpu.diffusers.StableDiffusionXLPipeline(
        vae=source.vae,
        text_encoder=source.text_encoder,
        text_encoder_2=source.text_encoder_2,
        tokenizer=source.tokenizer,
        tokenizer_2=source.tokenizer_2,
        unet=unet,
        scheduler=source.scheduler,
        add_watermarker=False,
    )
    pipeline.set_progress_bar_config(disable=True)
    return SimpleNamespace(**{**vars(gpu), "pipeline": pipeline})


def _multires_bindings(native: Any) -> tuple[Any, ...]:
    # Explicit architecture association, never blanket factor 1 or sqrt(Q).
    stages = {
        "down_blocks.1.": 2,
        "down_blocks.2.": 4,
        "mid_block.": 4,
        "up_blocks.0.": 4,
        "up_blocks.1.": 2,
    }
    bindings: list[Any] = []
    counts = dict.fromkeys(stages, 0)
    for name, module in native.pipeline.unet.named_modules():
        if type(module) is native.diffusers.Transformer2DModel:
            matches = [
                (prefix, factor) for prefix, factor in stages.items() if name.startswith(prefix)
            ]
            assert len(matches) == 1, name
            prefix, factor = matches[0]
            counts[prefix] += 1
            bindings.append(native.adapter.TransformerBinding(module, factor))
    assert tuple(counts.values()) == (1, 1, 1, 2, 2)
    assert len(bindings) == 7
    return tuple(bindings)


def _grid_recipe(height: int, width: int) -> tuple[Any, tuple[bool, ...]]:
    recipe = _recipe(_region())
    bbox = {**BBOX, "height": height * 8, "width": width * 8}
    recipe["bbox"] = bbox
    visible = tuple((y + 2 * x) % 3 == 0 for y in range(height) for x in range(width))
    # Off-grid decoys remain excluded by the existing nearest8 geometry.
    alpha = bytearray([255] * (bbox["height"] * bbox["width"]))
    for y in range(height):
        for x in range(width):
            alpha[(y * 8) * bbox["width"] + x * 8] = 128 if visible[y * width + x] else 127
    recipe["regions"][0]["coverage"] = {
        "alpha": bytes(alpha),
        "bounds": dict(bbox),
        "intersection": dict(bbox),
        "kind": "covered",
    }
    return recipe, visible


def _coarse(visible: tuple[bool, ...], height: int, width: int, factor: int) -> tuple[bool, ...]:
    return tuple(
        any(
            visible[sy * width + sx]
            for sy in range(y * factor, min((y + 1) * factor, height))
            for sx in range(x * factor, min((x + 1) * factor, width))
        )
        for y in range((height + factor - 1) // factor)
        for x in range((width + factor - 1) // factor)
    )


@pytest.mark.parametrize("grid", [(3, 5), (5, 7)])
def test_cuda_multires_real_unet_every_parent_grid_and_spatial_consumption(
    multires: Any, monkeypatch: Any, grid: tuple[int, int]
) -> None:
    native = multires
    bindings = _multires_bindings(native)
    factors = {id(binding.transformer): binding.factor for binding in bindings}
    recipe, visible = _grid_recipe(*grid)
    global_stream, local = _encode(native, "cat", "blur"), _encode(native, "dog", "grain")
    context = native.torch.cat(
        tuple(_bank(native, (global_stream, local), sign, 154) for sign in ("negative", "positive"))
    )
    pools = native.torch.cat((global_stream.negative_pooled, global_stream.positive_pooled))
    with _preserved(native), _observe(native, monkeypatch) as seen:
        result = _run(native, recipe, _args(native, bindings=bindings))
    _lifecycle(native, seen, result, 2, (grid[0] * 8, grid[1] * 8))
    assert len(seen.grids) == len(seen.consumed) == 2 * len(bindings)
    for parent, actual in seen.grids:
        factor = factors[id(parent)]
        assert actual == tuple((value + factor - 1) // factor for value in grid)
    for binding in bindings:
        assert sum(parent is binding.transformer for parent, _ in seen.grids) == 2
        records = [record for record in seen.consumed if record.parent is binding.transformer]
        assert len(records) == 2
        coarse = _coarse(visible, *grid, binding.factor)
        for record in records:
            assert native.torch.equal(record.context, context)
            expected = _permissions(
                native,
                negative=(77, 77),
                positive=(77, 77),
                visibility=(coarse,),
                queries=len(coarse),
            )
            assert native.torch.equal(_mask(native, record.mask, 2, 2, len(coarse), 154), expected)
    for root in seen.root_inputs:
        assert native.torch.equal(root["added_cond_kwargs"]["text_embeds"], pools)
        assert native.torch.equal(
            root["added_cond_kwargs"]["time_ids"],
            _half(native, [[1024, 1024, 0, 0, 1024, 1024]]).repeat(2, 1),
        )
    assert seen.builds == [("cat", "blur"), ("dog", "grain")]


def test_cuda_multires_wrong_factor_refuses_at_actual_parent_boundary_and_recovers(
    multires: Any, monkeypatch: Any
) -> None:
    native = multires
    correct = _multires_bindings(native)
    wrong = (dataclasses.replace(correct[0], factor=1), *correct[1:])
    recipe, _ = _grid_recipe(3, 5)
    with _preserved(native), _observe(native, monkeypatch) as seen:
        with pytest.raises(native.adapter.IllustriousRegionalAdapterError) as error:
            _run(native, recipe, _args(native, bindings=wrong))
        assert error.value.code == "INPUT_INVALID"
        # Encoding/admission succeeded; the factor fails when native traversal
        # supplies down1's ACTUAL 2x3 parent, before that original processor.
        assert seen.builds == [("cat", "blur"), ("dog", "grain")]
        assert len(seen.root_inputs) == 1 and seen.consumed == []
    with _preserved(native):
        _image(native, _run(native, recipe, _args(native, bindings=correct)), (24, 40))


def _dense_half(native: Any, attention: Any, queries: Any, context: Any, allowed: Any) -> Any:
    """Independent float32 dense softmax with native half projection rounding.

    Projection/output rounding remains FP16; only the small reference attention
    accumulation/softmax is promoted. atol/rtol 4e-3 allows half kernel rounding
    and SDPA reduction ordering, never tolerance for permission associations.
    No specific fused SDPA implementation is selected or required.
    """
    torch = native.torch
    assert attention.norm_q is attention.norm_k is None
    assert attention.group_norm is attention.spatial_norm is None
    assert not attention.norm_cross and not attention.residual_connection
    linear = torch.nn.functional.linear
    q = linear(queries, attention.to_q.weight, attention.to_q.bias)
    k = linear(context, attention.to_k.weight, attention.to_k.bias)
    v = linear(context, attention.to_v.weight, attention.to_v.bias)
    batch, count, channels = q.shape
    heads, width = attention.heads, channels // attention.heads
    q = q.reshape(batch, count, heads, width).transpose(1, 2).float()
    k = k.reshape(batch, context.shape[1], heads, width).transpose(1, 2).float()
    v = v.reshape(batch, context.shape[1], heads, width).transpose(1, 2).float()
    probability = (
        ((q @ k.transpose(-1, -2)) / math.sqrt(width)).masked_fill(~allowed, -math.inf).softmax(-1)
    )
    output = (probability @ v).transpose(1, 2).reshape(batch, count, channels).half()
    return (
        linear(output, attention.to_out[0].weight, attention.to_out[0].bias)
        / attention.rescale_output_factor
    )


@contextmanager
def _small_model(native: Any) -> Generator[Any]:
    with native.torch.random.fork_rng(devices=[0]):
        model = _small_transformer(native).to(device="cuda:0", dtype=native.torch.float16).eval()
    slots = _slots(model)
    values = tuple(
        (value, value.detach().clone(), value.device, value.dtype)
        for value in (*model.parameters(), *model.buffers())
    )
    try:
        yield model
    finally:
        assert _slots(model) == slots
        for value, expected, device, dtype in values:
            assert value.device == device and value.dtype == dtype
            assert native.torch.equal(value, expected)


def _direct(native: Any, monkeypatch: Any, model: Any, context: Any, *, prior: Any = None) -> Any:
    """Drive attn2 from a transparent parent CLASS spy, after adapter capture.

    The parent still executes its unchanged complete forward afterward. No
    local hook, instance shadow, replacement result or altered math is used.
    Identical explicit queries isolate first-attention context interventions.
    """
    torch = native.torch
    attention = model.transformer_blocks[0].attn2
    parent_forward = cast(Any, type(model)).forward
    original = native.processor_type.__call__
    records: list[Any] = []
    queries = _half(native, torch.linspace(-0.4, 0.6, 2 * 15 * 8).reshape(2, 15, 8))
    hidden = _half(native, torch.linspace(-0.3, 0.5, 2 * 8 * 15).reshape(2, 8, 3, 5))
    first: list[Any] = []

    @wraps(parent_forward)
    def parent(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is model:
            first.append(attention(queries, encoder_hidden_states=context, attention_mask=prior))
        return parent_forward(current, *args, **kwargs)

    @wraps(original)
    def processor(current: Any, attn: Any, *args: Any, **kwargs: Any) -> Any:
        if attn is attention:
            records.append(kwargs["attention_mask"].detach().clone())
        return original(current, attn, *args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(type(model), "forward", parent)
        patch.setattr(native.processor_type, "__call__", processor)
        with native.adapter.scoped_illustrious_regional_attention(
            model,
            bindings=(native.adapter.TransformerBinding(model, 1),),
            plan=_small_plan(),
            tensor_profile=TENSORS,
        ):
            result = model(hidden, encoder_hidden_states=context)
    assert len(first) == 1 and len(records) == 2
    _profile(native, result.sample)
    return SimpleNamespace(output=first[0], mask=records[0], queries=queries)


def _small_permissions(native: Any) -> Any:
    negative = (255, 0, 127, 128, 0, 0, 255, 0, 0, 128, 0, 0, 255, 0, 0)
    positive = (0, 255, 128, 0, 127, 255, 0, 0, 128, 0, 0, 255, 0, 0, 255)
    return (
        native.torch.stack(
            (
                native.torch.tensor(
                    [[True, value >= 128, False] for value in negative], device="cuda:0"
                ),
                native.torch.tensor(
                    [[True, value >= 128, value >= 128] for value in positive], device="cuda:0"
                ),
            )
        )
        .unsqueeze(1)
        .expand(2, 2, 15, 3)
    )


@pytest.mark.parametrize("kind", ["bool", "half-minus10000", "half-minusinf"])
def test_cuda_native_half_prior_mask_exact_intersection_dense_oracle(
    gpu: Any, monkeypatch: Any, kind: str
) -> None:
    with _small_model(gpu) as model:
        context = _small_context(gpu).to(device="cuda:0", dtype=gpu.torch.float16)
        prior = gpu.torch.ones((2, 1, 15, 3), dtype=gpu.torch.bool, device="cuda:0")
        # Block one positive local token while keeping the global token; this
        # distinguishes half additive zeros (allowed) from binary permissions.
        prior[1, :, :, 2] = False
        expected = _small_permissions(gpu) & prior
        if kind != "bool":
            prior = gpu.torch.where(
                prior, _half(gpu, 0), _half(gpu, -10000 if kind == "half-minus10000" else -math.inf)
            )
        observed = _direct(gpu, monkeypatch, model, context, prior=prior)
        assert gpu.torch.equal(_mask(gpu, observed.mask, 2, 2, 15, 3), expected)
        oracle = _dense_half(
            gpu, model.transformer_blocks[0].attn2, observed.queries, context, expected
        )
        gpu.torch.testing.assert_close(observed.output, oracle, atol=4e-3, rtol=4e-3)


def test_cuda_first_attention_permitted_blocked_and_padding_context_interventions(
    gpu: Any, monkeypatch: Any
) -> None:
    with _small_model(gpu) as model:
        context = _small_context(gpu).to(device="cuda:0", dtype=gpu.torch.float16)
        baseline = _direct(gpu, monkeypatch, model, context)
        changed = context.clone()
        changed[1, 1:] += _half(gpu, [1.0, -0.7, 0.4, -0.2, 0.8, -0.3, 0.6, -0.9])
        local = _direct(gpu, monkeypatch, model, changed)
        allowed = _small_permissions(gpu)[1, 0, :, 1]
        assert allowed.any() and (~allowed).any()
        assert gpu.torch.equal(baseline.output[1, ~allowed], local.output[1, ~allowed])
        assert not gpu.torch.equal(baseline.output[1, allowed], local.output[1, allowed])
        assert gpu.torch.equal(baseline.output[0], local.output[0])
        padding = context.clone()
        padding[0, 2] *= -17
        excluded = _direct(gpu, monkeypatch, model, padding)
        assert gpu.torch.equal(baseline.output, excluded.output)


@pytest.mark.parametrize("case", ["all-masked", "float32", "cpu", "soft-half", "integer"])
def test_cuda_prior_masks_refuse_before_original_processor(
    gpu: Any, monkeypatch: Any, case: str
) -> None:
    with _small_model(gpu) as model:
        attention = model.transformer_blocks[0].attn2
        prior = gpu.torch.ones((2, 1, 15, 3), dtype=gpu.torch.bool, device="cuda:0")
        if case == "all-masked":
            prior[1, :, 0] = False
        elif case == "float32":
            prior = prior.float()
        elif case == "cpu":
            prior = prior.cpu()
        elif case == "soft-half":
            prior = prior.half() * -0.5
        else:
            prior = prior.long()
        calls: list[Any] = []
        original = gpu.processor_type.__call__

        @wraps(original)
        def processor(current: Any, attn: Any, *args: Any, **kwargs: Any) -> Any:
            if attn is attention:
                calls.append(attn)
            return original(current, attn, *args, **kwargs)

        with monkeypatch.context() as patch:
            patch.setattr(gpu.processor_type, "__call__", processor)
            with pytest.raises(gpu.adapter.IllustriousRegionalAdapterError) as error:
                _direct(
                    gpu,
                    monkeypatch,
                    model,
                    _small_context(gpu).to(device="cuda:0", dtype=gpu.torch.float16),
                    prior=prior,
                )
            assert error.value.code == ("ALL_MASKED" if case == "all-masked" else "INPUT_INVALID")
        assert calls == []


def _refused(
    native: Any,
    monkeypatch: Any,
    recipe: Any,
    args: dict[str, Any],
    *,
    tokenize: bool = False,
    codes: tuple[str, ...] | None = None,
) -> Any:
    # No early encoder, model body, decode, attention installation or owned
    # call-slot mutation can masquerade as a semantic profile refusal. This
    # also makes force_upcast mutation failures semantic (never setup/OOM RED).
    def deny_decode(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("profile refusal reached VAE decode")

    with (
        _preserved(native),
        _no_encoding(native, monkeypatch, tokenize=tokenize),
        monkeypatch.context() as patch,
    ):
        patch.setattr(type(native.pipeline.vae), "decode", deny_decode)
        with pytest.raises(_errors(native)) as error:
            _run(native, recipe, args)
        if codes is not None:
            assert cast(Any, error.value).code in codes
        return error.value


@pytest.mark.parametrize(
    "encoding,execution", [(CPU_ENCODING, EXECUTION), (ENCODING, CPU_EXECUTION)]
)
def test_cuda_cpu_encoding_execution_cross_pairs_refuse_before_tokenization(
    gpu: Any, monkeypatch: Any, encoding: str, execution: str
) -> None:
    _refused(
        gpu,
        monkeypatch,
        _recipe(),
        _args(gpu, profile=encoding, denoising_profile=execution),
        codes=("PROFILE_INVALID",),
    )


@pytest.mark.parametrize(
    "case",
    [
        "grad",
        "cpu-autocast",
        "cuda-autocast",
        "cold-clip",
        "offload",
        "compile",
        "unet-float32",
        "clip-cpu",
        "vae-cpu",
    ],
)
def test_cuda_model_runtime_refusals_precede_encoding_and_recover(
    gpu: Any, monkeypatch: Any, case: str
) -> None:
    torch = gpu.torch
    if case == "grad":
        with torch.enable_grad():
            _refused(gpu, monkeypatch, _recipe(), _args(gpu), codes=("PROFILE_INVALID",))
    elif case.endswith("autocast"):
        with torch.autocast("cpu" if case.startswith("cpu") else "cuda"):
            _refused(gpu, monkeypatch, _recipe(), _args(gpu), codes=("PROFILE_INVALID",))
    else:
        target = gpu.pipeline.text_encoder.text_model if case == "cold-clip" else gpu.pipeline.unet
        with monkeypatch.context() as patch:
            if case == "cold-clip":
                patch.setattr(target, "_output_capturing_hooks_installed", False)
            elif case in ("offload", "compile"):
                # _compiled_call_impl has a class-level None default. Patching
                # its dictionary entry restores original instance-slot ABSENCE
                # instead of leaving a new instance None shadow at teardown.
                patch.setitem(
                    target.__dict__,
                    "_hf_hook" if case == "offload" else "_compiled_call_impl",
                    object(),
                )
            else:
                # Alter one fixture-owned native Parameter before consumer
                # observation, preserving the exact original reference.
                model = (
                    gpu.pipeline.unet
                    if case == "unet-float32"
                    else gpu.pipeline.text_encoder
                    if case == "clip-cpu"
                    else gpu.pipeline.vae
                )
                owner = next(
                    module
                    for module in model.modules()
                    if any(value is not None for value in module._parameters.values())
                )
                name, original = next(
                    (name, value) for name, value in owner._parameters.items() if value is not None
                )
                replacement = torch.nn.Parameter(
                    original.detach().float()
                    if case == "unet-float32"
                    else original.detach().cpu(),
                    requires_grad=original.requires_grad,
                )
                patch.setitem(owner._parameters, name, replacement)
            _refused(gpu, monkeypatch, _recipe(), _args(gpu), codes=("PROFILE_INVALID",))
    _image(gpu, _run(gpu, _recipe()))


@pytest.mark.parametrize("precision", ["Auto", "FP32"])
def test_cuda_vae_precision_refuses_before_encoding(
    gpu: Any, monkeypatch: Any, precision: str
) -> None:
    args = _args(gpu)
    args["parameters"] = dataclasses.replace(args["parameters"], vae_precision=precision)
    _refused(gpu, monkeypatch, _recipe(), args, codes=("UNSUPPORTED",))


def test_cuda_vae_force_upcast_refusal_before_encoder_or_model_mutation(
    gpu: Any, monkeypatch: Any
) -> None:
    """Direct semantic RED for root's separate force_upcast-validation mutation."""
    vae = gpu.pipeline.vae
    previous = vae._internal_dict
    vae.register_to_config(force_upcast=True)
    try:
        assert vae.config.force_upcast is True
        assert all(value.dtype == gpu.torch.float16 for value in vae.parameters())
        _refused(
            gpu,
            monkeypatch,
            _recipe(_region()),
            _args(gpu),
            codes=("PROFILE_INVALID", "UNSUPPORTED"),
        )
        assert vae.config.force_upcast is True
    finally:
        vae._internal_dict = previous


def test_cuda_vae_manual_fp16_control_green(gpu: Any, monkeypatch: Any) -> None:
    """Unaffected native half VAE control for root's force_upcast mutation."""
    assert gpu.pipeline.vae.config.force_upcast is False
    with _observe(gpu, monkeypatch) as seen:
        result = _run(gpu, _recipe(_region()))
    _lifecycle(gpu, seen, result, 2)
    assert seen.builds == [("cat", "blur"), ("dog", "grain")]


@pytest.mark.parametrize("where", ["unet-root", "unet-leaf", "vae-root", "vae-leaf"])
@pytest.mark.parametrize("post", [False, True])
def test_cuda_complete_used_unet_vae_hook_trees_refuse(
    gpu: Any, monkeypatch: Any, where: str, post: bool
) -> None:
    root = gpu.pipeline.unet if where.startswith("unet") else gpu.pipeline.vae
    target = root if where.endswith("root") else tuple(root.modules())[-1]
    hits: list[Any] = []

    def observer(*args: Any) -> None:
        hits.append(args)

    register = target.register_forward_hook if post else target.register_forward_pre_hook
    handle = register(observer)
    try:
        _refused(gpu, monkeypatch, _recipe(), _args(gpu), codes=("PROFILE_INVALID",))
        assert hits == []
    finally:
        handle.remove()
    _image(gpu, _run(gpu, _recipe()))


@pytest.mark.parametrize(
    "case",
    ["missing-binding", "duplicate-binding", "mask-budget", "invalid-negative-positive-only"],
)
def test_cuda_malformed_binding_budget_and_selected_negative_refusals(
    gpu: Any, monkeypatch: Any, case: str
) -> None:
    recipe, args = _recipe(_region()), _args(gpu)
    if case == "missing-binding":
        args["bindings"] = args["bindings"][:-1]
    elif case == "duplicate-binding":
        args["bindings"] = (*args["bindings"], args["bindings"][0])
    elif case == "mask-budget":
        recipe, _ = _grid_recipe(248, 248)  # 1984 squared <4,000,000 pixels.
        # 2*2*61504*154 = 37,886,464 bool elements >32MiB.
    else:
        args = _args(gpu, layout=LAYOUTS[1])
        recipe["regions"][0]["negative"]["prompt"]["embeddingRefs"] = [{}]
    error = _refused(
        gpu,
        monkeypatch,
        recipe,
        args,
        tokenize=case in ("missing-binding", "duplicate-binding", "mask-budget"),
    )
    assert error.code == (
        "LIMIT"
        if case == "mask-budget"
        else "UNSUPPORTED"
        if case == "invalid-negative-positive-only"
        else "INPUT_INVALID"
    )


def _one_shot_args(native: Any, **changes: Any) -> dict[str, Any]:
    args = _args(native)
    args.pop("denoising_profile")
    return {
        **args,
        "sample": _half(native, native.torch.linspace(-0.8, 0.9, 48).reshape(2, 4, 2, 3)),
        "timestep": native.torch.tensor(7.0, dtype=native.torch.float32, device="cuda:0"),
        "time_ids": _half(native, [[16, 24, 0, 0, 16, 24]]).repeat(2, 1),
        **changes,
    }


def _one_shot_native_control(
    native: Any, monkeypatch: Any, recipe: Any, args: dict[str, Any]
) -> None:
    """Valid neighboring path and post-refusal recovery use original attention."""
    with _preserved(native):
        global_stream = _encode(native, "cat", "blur")
        local = _encode(native, "dog", "grain")
        context = native.torch.cat(
            tuple(
                _bank(native, (global_stream, local), sign, 154)
                for sign in ("negative", "positive")
            )
        )
        pools = native.torch.cat((global_stream.negative_pooled, global_stream.positive_pooled))
        permissions = _permissions(native, negative=(77, 77), positive=(77, 77))
        with _observe(native, monkeypatch) as seen:
            result = native.recipe.run_current_canvas_regional_recipe(recipe, **args)
        _profile(native, result.sample)
        assert tuple(result.sample.shape) == (2, 4, 2, 3)
        assert len(seen.unet_results) == 1 and result is seen.unet_results[0]
        assert len(seen.root_inputs) == 1
        assert len(seen.consumed) == sum(
            len(binding.transformer.transformer_blocks) for binding in args["bindings"]
        )
        assert seen.builds == [("cat", "blur"), ("dog", "grain")]
        assert seen.steps == seen.decodes == []
        root = seen.root_inputs[0]
        assert native.torch.equal(root["sample"], args["sample"])
        assert native.torch.equal(root["timestep"], args["timestep"])
        assert native.torch.equal(root["encoder_hidden_states"], context)
        assert native.torch.equal(root["added_cond_kwargs"]["text_embeds"], pools)
        assert native.torch.equal(root["added_cond_kwargs"]["time_ids"], args["time_ids"])
        for record in seen.consumed:
            assert native.torch.equal(record.context, context)
            assert native.torch.equal(_mask(native, record.mask, 2, 2, 6, 154), permissions)
            _profile(native, record.queries)
            _profile(native, record.output)


@pytest.mark.parametrize("bad", ["cpu", "float32"])
def test_cuda_one_shot_invalid_unet_profile_refuses_before_snapshot_or_tokenization(
    gpu: Any, monkeypatch: Any, bad: str
) -> None:
    """A valid input must never be snapshotted for an inadmissible native UNet.

    Root's pre-fix run should fail at the actual supplied-input clone, before
    tokenization. After repair, PROFILE_INVALID must precede both boundaries.
    The spy permits every unrelated clone and is absent during preservation
    setup/teardown. No production behavior is replaced or repaired by this test.
    """
    recipe, args = _recipe(_region()), _one_shot_args(gpu)
    supplied = {name: args[name] for name in ("sample", "timestep", "time_ids")}
    inputs = tuple(
        (
            value,
            value.detach().clone(),
            value.device,
            value.dtype,
            value.untyped_storage().data_ptr(),
        )
        for value in supplied.values()
    )
    owner = next(
        module
        for module in gpu.pipeline.unet.modules()
        if any(value is not None for value in module._parameters.values())
    )
    slot, original = next(
        (name, value) for name, value in owner._parameters.items() if value is not None
    )
    assert original.device == gpu.torch.device("cuda:0") and original.dtype == gpu.torch.float16
    replacement = gpu.torch.nn.Parameter(
        original.detach().cpu() if bad == "cpu" else original.detach().float(),
        requires_grad=original.requires_grad,
    )
    original_clone = gpu.torch.Tensor.clone
    snapshots: list[str] = []

    @wraps(original_clone)
    def clone(current: Any, *clone_args: Any, **clone_kwargs: Any) -> Any:
        for name, value in supplied.items():
            if current is value:
                snapshots.append(name)
                raise AssertionError("inadmissible one-shot UNet reached input snapshot: " + name)
        return original_clone(current, *clone_args, **clone_kwargs)

    with _preserved(gpu), monkeypatch.context() as injection:
        injection.setitem(owner._parameters, slot, replacement)
        # Snapshot the complete injected state first. Remove the clone spy and
        # encoding tripwires before checking that exact state at scope exit.
        with (
            _preserved(gpu),
            _no_encoding(gpu, monkeypatch, tokenize=False),
            monkeypatch.context() as observation,
        ):
            observation.setattr(gpu.torch.Tensor, "clone", clone)
            with pytest.raises(_errors(gpu)) as error:
                gpu.recipe.run_current_canvas_regional_recipe(recipe, **args)
            assert cast(Any, error.value).code == "PROFILE_INVALID"
            assert snapshots == []
            assert owner._parameters[slot] is replacement
    assert owner._parameters[slot] is original
    _one_shot_native_control(gpu, monkeypatch, recipe, args)
    for value, snapshot, device, dtype, pointer in inputs:
        assert value.device == device and value.dtype == dtype
        assert value.untyped_storage().data_ptr() == pointer
        assert gpu.torch.equal(value, snapshot)


def test_cuda_one_shot_valid_unet_profile_control_green(gpu: Any, monkeypatch: Any) -> None:
    _one_shot_native_control(gpu, monkeypatch, _recipe(_region()), _one_shot_args(gpu))


@pytest.mark.parametrize("field", ["sample", "timestep", "time_ids"])
@pytest.mark.parametrize("bad", ["cpu", "wrong-dtype", "meta"])
def test_cuda_one_shot_profile_fields_refuse_before_encoding_or_copy(
    gpu: Any, monkeypatch: Any, field: str, bad: str
) -> None:
    args = _one_shot_args(gpu)
    value = args[field]
    args[field] = (
        value.cpu()
        if bad == "cpu"
        else value.to(device="meta")
        if bad == "meta"
        else value.half()
        if field == "timestep"
        else value.float()
    )
    copied: list[bool] = []
    original = gpu.torch.Tensor.copy_

    def copy_checked(current: Any, *args: Any, **kwargs: Any) -> Any:
        copied.append(True)
        return original(current, *args, **kwargs)

    with _no_encoding(gpu, monkeypatch), monkeypatch.context() as patch:
        patch.setattr(gpu.torch.Tensor, "copy_", copy_checked)
        with pytest.raises(_errors(gpu)) as error:
            gpu.recipe.run_current_canvas_regional_recipe(_recipe(_region()), **args)
        assert cast(Any, error.value).code == "INPUT_INVALID"
    assert copied == []


def test_cuda_one_shot_unused_cpu_vae_is_not_a_used_resource(gpu: Any, monkeypatch: Any) -> None:
    # Independent tiny native VAE; never move the shared GPU VAE to CPU.
    with gpu.torch.random.fork_rng(devices=[]):
        vae = gpu.diffusers.AutoencoderKL(
            in_channels=3,
            out_channels=3,
            down_block_types=("DownEncoderBlock2D",) * 4,
            up_block_types=("UpDecoderBlock2D",) * 4,
            block_out_channels=(8, 8, 8, 8),
            layers_per_block=1,
            latent_channels=4,
            norm_num_groups=4,
        ).eval()
    pipeline = copy.copy(gpu.pipeline)
    pipeline.__dict__["vae"] = vae
    before = tuple(
        (value, value.device, value.dtype, value.detach().clone()) for value in vae.parameters()
    )
    with _observe(gpu, monkeypatch) as seen:
        result = gpu.recipe.run_current_canvas_regional_recipe(
            _recipe(_region()), **_one_shot_args(gpu, pipeline=pipeline)
        )
    _profile(gpu, result.sample)
    assert len(seen.root_inputs) == 1 and seen.decodes == []
    assert id(vae) not in gpu.recipe._RESERVATIONS
    for value, device, dtype, expected in before:
        assert value.device == device and value.dtype == dtype and gpu.torch.equal(value, expected)


@pytest.mark.parametrize("api", ["validate", "scope", "convert", "consume"])
def test_cuda_inputs_do_not_implicitly_select_lower_cpu_default(gpu: Any, api: str) -> None:
    if api in ("validate", "scope"):
        plan = plan_illustrious_attention(
            latent_shape=Shape(2, 3),
            negative=(EncodedSegment("n", 77, Everywhere()),),
            positive=(EncodedSegment("p", 77, Everywhere()),),
            profile=NUMERICAL,
            layout=LAYOUTS[0],
        )
        kwargs = {"bindings": _bindings(gpu, gpu.pipeline.unet), "plan": plan}
        with pytest.raises(gpu.adapter.IllustriousRegionalAdapterError) as error:
            if api == "validate":
                gpu.adapter.validate_illustrious_regional_attention(gpu.pipeline.unet, **kwargs)
            else:
                with gpu.adapter.scoped_illustrious_regional_attention(gpu.pipeline.unet, **kwargs):
                    pytest.fail("CUDA native state admitted by default CPU profile")
        assert error.value.code == "PROFILE_INVALID"
    else:
        source = _encode(gpu, "cat", "blur")
        with pytest.raises(gpu.bridge.IllustriousRegionalConditioningError) as error:
            if api == "convert":
                gpu.bridge.encoded_bindings_from_sdxl_conditioning(
                    "global", source, negative_coverage=Everywhere(), positive_coverage=Everywhere()
                )
            else:
                records = gpu.bridge.encoded_bindings_from_sdxl_conditioning(
                    "global",
                    source,
                    negative_coverage=Everywhere(),
                    positive_coverage=Everywhere(),
                    tensor_profile=TENSORS,
                )
                gpu.bridge.run_illustrious_regional_conditioning(
                    gpu.pipeline.unet,
                    negative=(records.negative,),
                    positive=(records.positive,),
                    latent_shape=Shape(2, 3),
                    layout=LAYOUTS[0],
                    bindings=_bindings(gpu, gpu.pipeline.unet),
                    sample=_one_shot_args(gpu)["sample"],
                    timestep=_one_shot_args(gpu)["timestep"],
                    time_ids=_one_shot_args(gpu)["time_ids"],
                    negative_pooled_source_id="global",
                    positive_pooled_source_id="global",
                )
        assert error.value.code == "INPUT_INVALID"


@pytest.mark.parametrize(
    "field", ["negative-context", "positive-context", "negative-pool", "positive-pool"]
)
@pytest.mark.parametrize("bad", ["cpu", "float32", "meta"])
def test_cuda_owned_assembly_revalidates_both_signs_before_allocation_or_copy(
    gpu: Any, monkeypatch: Any, field: str, bad: str
) -> None:
    source = _encode(gpu, "cat", "blur")
    records = gpu.bridge.encoded_bindings_from_sdxl_conditioning(
        "global",
        source,
        negative_coverage=Everywhere(),
        positive_coverage=Everywhere(),
        tensor_profile=TENSORS,
    )
    negative, positive = records.negative, records.positive
    sign, member = field.split("-")
    attribute = "context" if member == "context" else "pooled"
    selected = negative if sign == "negative" else positive
    value = getattr(selected, attribute)
    wrong = (
        value.cpu()
        if bad == "cpu"
        else value.float()
        if bad == "float32"
        else value.to(device="meta")
    )
    changed = dataclasses.replace(selected, **{attribute: wrong})
    negative, positive = (changed, positive) if sign == "negative" else (negative, changed)
    hits: list[str] = []

    def deny(*_args: Any, **_kwargs: Any) -> Any:
        hits.append("owned allocation/copy")
        raise AssertionError("unvalidated dtype/device reached owned allocation/copy")

    with monkeypatch.context() as patch:
        patch.setattr(gpu.torch, "zeros", deny)
        patch.setattr(gpu.torch, "empty", deny)
        patch.setattr(gpu.torch.Tensor, "copy_", deny)
        with pytest.raises(gpu.bridge.IllustriousRegionalConditioningError) as error:
            # positive-only still validates the unused negative sign and pool.
            gpu.bridge._assemble_owned_conditioning(
                gpu.torch,
                negative=(negative,),
                positive=(positive,),
                signs=("positive",),
                keys=77,
                selected=(negative.pooled, positive.pooled),
                tensor_profile=TENSORS,
            )
        assert error.value.code == "INPUT_INVALID"
    assert hits == []


@pytest.mark.parametrize("dtype", ["bool", "half"])
def test_cuda_binary_root_key_mask_is_intersected(gpu: Any, monkeypatch: Any, dtype: str) -> None:
    source = _encode(gpu, "cat", "blur")
    records = gpu.bridge.encoded_bindings_from_sdxl_conditioning(
        "global",
        source,
        negative_coverage=Everywhere(),
        positive_coverage=Everywhere(),
        tensor_profile=TENSORS,
    )
    keymask = gpu.torch.ones(
        (2, 77), dtype=gpu.torch.bool if dtype == "bool" else gpu.torch.float16, device="cuda:0"
    )
    keymask[:, -1] = 0
    args = _one_shot_args(gpu)
    with _observe(gpu, monkeypatch) as seen:
        result = gpu.bridge.run_illustrious_regional_conditioning(
            gpu.pipeline.unet,
            negative=(records.negative,),
            positive=(records.positive,),
            latent_shape=Shape(2, 3),
            layout=LAYOUTS[0],
            bindings=args["bindings"],
            sample=args["sample"],
            timestep=args["timestep"],
            time_ids=args["time_ids"],
            negative_pooled_source_id="global",
            positive_pooled_source_id="global",
            encoder_attention_mask=keymask,
            tensor_profile=TENSORS,
        )
    _profile(gpu, result.sample)
    assert seen.consumed
    for record in seen.consumed:
        actual = _mask(gpu, record.mask, 2, 2, 6, 77)
        assert actual[..., :-1].all() and not actual[..., -1].any()


@pytest.mark.parametrize("second", [False, True])
@pytest.mark.parametrize("site", ["encoder-root", "text-model"])
@pytest.mark.parametrize("field", ["input_ids", "attention_mask"])
@pytest.mark.parametrize("mode", ["observe", "clone", "replace"])
def test_cuda_clip_input_value_guards_preserve_device_dtype_and_refuse_retargeting(
    gpu: Any, monkeypatch: Any, second: bool, site: str, field: str, mode: str
) -> None:
    encoder = gpu.pipeline.text_encoder_2 if second else gpu.pipeline.text_encoder
    target = encoder if site == "encoder-root" else encoder.text_model
    baseline = _run(gpu, _recipe(_region()))
    signature = inspect.signature(cast(Any, type(target)).forward)
    original = cast(Any, type(target)).forward
    borrowed: list[Any] = []
    bodies: list[Any] = []

    def hook(module: Any, args: Any, kwargs: Any) -> Any:
        bound = signature.bind_partial(module, *args, **kwargs)
        value = bound.arguments[field]
        if value is None:  # CLIP-G's separate pooling call may lack a mask.
            assert field == "attention_mask" and mode != "replace"
            return None
        assert value.device == gpu.torch.device("cuda:0") and value.dtype in (
            gpu.torch.int64,
            gpu.torch.bool,
        )
        assert tuple(value.shape) == (1, 77)
        snapshot = value.detach().clone()
        borrowed.append(
            (value, snapshot, value.dtype, value.device, value.untyped_storage().data_ptr())
        )
        if mode == "observe":
            return None
        replacement = value.clone()
        if mode == "replace":
            replacement[0, 1] = (
                (2 if int(value[0, 1]) != 2 else 3) if field == "input_ids" else 1 - value[0, 1]
            )
            assert not gpu.torch.equal(value, replacement)
        assert replacement.device == value.device and replacement.dtype == value.dtype
        assert replacement.untyped_storage().data_ptr() != value.untyped_storage().data_ptr()
        bound.arguments[field] = replacement
        return bound.args[1:], bound.kwargs

    @wraps(original)
    def body(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is target:
            bodies.append(current)
        return original(current, *args, **kwargs)

    handle = target.register_forward_pre_hook(hook, with_kwargs=True)
    try:
        with monkeypatch.context() as patch:
            patch.setattr(type(target), "forward", body)
            with _preserved(gpu), _observe(gpu, monkeypatch) as seen:
                if mode == "replace":
                    with pytest.raises(gpu.recipe.IllustriousRegionalRecipeError) as error:
                        _run(gpu, _recipe(_region()))
                    assert error.value.code == "INPUT_INVALID"
                    assert len(borrowed) == 1 and bodies == []
                    assert seen.root_inputs == seen.steps == seen.decodes == []
                else:
                    result = _run(gpu, _recipe(_region()))
                    _lifecycle(gpu, seen, result, 2)
                    assert bodies and borrowed
                    assert gpu.torch.equal(result.images, baseline.images)
        assert target._forward_pre_hooks[handle.id] is hook
        for value, snapshot, dtype, device, pointer in borrowed:
            assert value.dtype == dtype and value.device == device
            assert value.untyped_storage().data_ptr() == pointer
            assert gpu.torch.equal(value, snapshot)
    finally:
        handle.remove()
    assert gpu.torch.equal(_run(gpu, _recipe(_region())).images, baseline.images)


@pytest.mark.parametrize("second", [False, True])
@pytest.mark.parametrize("mode", ["observe", "clone", "replace"])
def test_cuda_clip_layer_output_equal_value_guards(
    gpu: Any, monkeypatch: Any, second: bool, mode: str
) -> None:
    encoder = gpu.pipeline.text_encoder_2 if second else gpu.pipeline.text_encoder
    layer, downstream = encoder.text_model.encoder.layers
    expected = _run(gpu, _recipe(_region()))
    calls: list[Any] = []
    observed: list[Any] = []
    original = cast(Any, type(downstream)).forward

    def hook(_module: Any, _args: Any, _kwargs: Any, output: Any) -> Any:
        _profile(gpu, output)
        observed.append((output, output.detach().clone()))
        if mode == "observe":
            return None
        replacement = output.clone()
        if mode == "replace":
            replacement += 0.125
        assert replacement.dtype == output.dtype and replacement.device == output.device
        return replacement

    @wraps(original)
    def body(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is downstream:
            calls.append(current)
        return original(current, *args, **kwargs)

    handle = layer.register_forward_hook(hook, with_kwargs=True)
    try:
        with monkeypatch.context() as patch:
            patch.setattr(type(downstream), "forward", body)
            with _preserved(gpu), _observe(gpu, monkeypatch) as seen:
                if mode == "replace":
                    with pytest.raises(gpu.recipe.IllustriousRegionalRecipeError) as error:
                        _run(gpu, _recipe(_region()))
                    assert error.value.code == "INPUT_INVALID"
                    assert observed and calls == [] and seen.root_inputs == []
                else:
                    result = _run(gpu, _recipe(_region()))
                    assert observed and calls
                    assert gpu.torch.equal(result.images, expected.images)
        assert layer._forward_hooks[handle.id] is hook
        for value, snapshot in observed:
            assert gpu.torch.equal(value, snapshot)
    finally:
        handle.remove()
    assert gpu.torch.equal(_run(gpu, _recipe(_region())).images, expected.images)


@pytest.mark.parametrize("stage", ["encoder", "second-unet", "second-scheduler", "decode"])
def test_cuda_injected_native_failures_restore_exact_state_and_fresh_call(
    gpu: Any, monkeypatch: Any, stage: str
) -> None:
    target: Any = (
        cast(Any, type(gpu.pipeline.text_encoder))
        if stage == "encoder"
        else cast(Any, type(gpu.pipeline.unet))
        if stage == "second-unet"
        else gpu.diffusers.EulerDiscreteScheduler
        if stage == "second-scheduler"
        else cast(Any, type(gpu.pipeline.vae))
    )
    name = (
        "forward"
        if stage in ("encoder", "second-unet")
        else "step"
        if stage == "second-scheduler"
        else "decode"
    )
    original = getattr(target, name)
    sentinel = (
        DerivativeError("GENERATION_WORKER_FAILED", "CUDA original decode sentinel")
        if stage == "decode"
        else RuntimeError("CUDA original failure sentinel")
    )
    calls: list[Any] = []
    stop = 2 if stage.startswith("second") else 1

    @wraps(original)
    def fail(current: Any, *args: Any, **kwargs: Any) -> Any:
        calls.append(current)
        if len(calls) == stop:
            raise sentinel
        return original(current, *args, **kwargs)

    with _preserved(gpu), monkeypatch.context() as patch:
        patch.setattr(target, name, fail)
        with pytest.raises(type(sentinel)) as error:
            _run(gpu, _recipe(_region()))
        assert error.value is sentinel and len(calls) == stop
    _image(gpu, _run(gpu, _recipe(_region())))


def test_cuda_real_partial_late_guard_setup_failure_restores_root_forward_and_recovers(
    gpu: Any, monkeypatch: Any
) -> None:
    # Confirmed seam in the current denoising owner: root.forward is installed
    # before late attn2 guards, after the adapter and finite observers. Let the
    # first REAL registration succeed, then fail the second. No invented API.
    root = gpu.pipeline.unet
    sites = tuple(
        block.attn2
        for binding in _bindings(gpu, root)
        for block in binding.transformer.transformer_blocks
    )
    assert len(sites) >= 2 and "forward" not in root.__dict__
    original = gpu.torch.nn.Module.register_forward_pre_hook
    original_processor = _first_attention(gpu, root).processor
    installed: list[Any] = []
    sentinel = RuntimeError("CUDA second late guard registration")

    @wraps(original)
    def register(module: Any, *args: Any, **kwargs: Any) -> Any:
        late = any(module is site for site in sites) and "forward" in root.__dict__
        if late and installed:
            assert installed[0].id in sites[0]._forward_pre_hooks
            assert sites[0].processor is not original_processor
            raise sentinel
        handle = original(module, *args, **kwargs)
        if late:
            installed.append(handle)
        return handle

    with _preserved(gpu), monkeypatch.context() as patch:
        patch.setattr(gpu.torch.nn.Module, "register_forward_pre_hook", register)
        with pytest.raises(RuntimeError) as error:
            _run(gpu, _recipe(_region()))
        assert error.value is sentinel and len(installed) == 1
    assert "forward" not in root.__dict__
    _image(gpu, _run(gpu, _recipe(_region())))


@pytest.mark.parametrize("stage", ["unet", "scheduler", "vae"])
def test_cuda_nonfinite_native_outputs_refuse_before_clamp_then_recover(
    gpu: Any, monkeypatch: Any, stage: str
) -> None:
    target: Any = (
        cast(Any, type(gpu.pipeline.unet))
        if stage == "unet"
        else gpu.diffusers.EulerDiscreteScheduler
        if stage == "scheduler"
        else cast(Any, type(gpu.pipeline.vae.decoder))
    )
    name = "step" if stage == "scheduler" else "forward"
    original = getattr(target, name)
    calls: list[Any] = []

    @wraps(original)
    def nonfinite(current: Any, *args: Any, **kwargs: Any) -> Any:
        # Always execute real native mathematics first. Only this explicit
        # failure injection changes its resulting tensor before native clamp.
        result = original(current, *args, **kwargs)
        value: Any = (
            result
            if stage == "vae"
            else cast(tuple[Any, ...], result)[0]
            if isinstance(result, tuple)
            else result.prev_sample
            if stage == "scheduler"
            else result.sample
        )
        _profile(gpu, value)
        value.fill_(math.inf)
        calls.append(current)
        return cast(Any, result)

    with _preserved(gpu), monkeypatch.context() as patch:
        patch.setattr(target, name, nonfinite)
        with pytest.raises((*_errors(gpu), DerivativeError)) as error:
            _run(gpu, _recipe(_region()))
        assert calls and cast(Any, error.value).code in (
            "INPUT_INVALID",
            "GENERATION_WORKER_FAILED",
        )
    _image(gpu, _run(gpu, _recipe(_region())))


def test_cuda_used_vae_reservation_reentry_refuses_and_releases(gpu: Any) -> None:
    hits: list[str] = []
    guard = False

    def before(_module: Any, _args: Any, _kwargs: Any) -> None:
        nonlocal guard
        if guard:
            return
        guard = True
        assert id(gpu.pipeline.vae) in gpu.recipe._RESERVATIONS
        assert all(id(module) in gpu.recipe._RESERVATIONS for module in gpu.pipeline.vae.modules())
        with pytest.raises(gpu.recipe.IllustriousRegionalRecipeError) as error:
            _run(gpu, _recipe(_region()))
        assert error.value.code == "SCOPE_CONFLICT"
        hits.append("used-vae-reserved")

    handle = gpu.pipeline.text_encoder.register_forward_pre_hook(before, with_kwargs=True)
    try:
        with _preserved(gpu):
            _image(gpu, _run(gpu, _recipe(_region())))
        assert hits == ["used-vae-reserved"]
    finally:
        handle.remove()
    assert not gpu.recipe._RESERVATIONS and not gpu.adapter._OWNERS
    _image(gpu, _run(gpu, _recipe()))


def test_cuda_mask_support_plane_allocations_use_exact_selected_device(
    gpu: Any, monkeypatch: Any
) -> None:
    combined = gpu.adapter._combined_mask
    active = False
    allocations: list[Any] = []

    @wraps(combined)
    def mask(*args: Any, **kwargs: Any) -> Any:
        nonlocal active
        active = True
        try:
            return combined(*args, **kwargs)
        finally:
            active = False

    def observe(factory: Any) -> Any:
        @wraps(factory)
        def allocate(*args: Any, **kwargs: Any) -> Any:
            result = factory(*args, **kwargs)
            if active:
                assert result.device == gpu.torch.device("cuda:0")
                assert result.dtype == gpu.torch.bool
                allocations.append(result.shape)
            return result

        return allocate

    with monkeypatch.context() as patch:
        patch.setattr(gpu.adapter, "_combined_mask", mask)
        for name in ("tensor", "zeros", "empty", "as_tensor"):
            patch.setattr(gpu.torch, name, observe(getattr(gpu.torch, name)))
        _image(gpu, _run(gpu, _recipe(_region())))
    assert allocations


def test_cuda_attention_caught_failure_remains_latched_and_fresh_scope_recovers(
    gpu: Any, monkeypatch: Any
) -> None:
    with _small_model(gpu) as model:
        attention = model.transformer_blocks[0].attn2
        original = cast(Any, type(model)).forward
        caught: list[Any] = []
        context = _small_context(gpu).to(device="cuda:0", dtype=gpu.torch.float16)
        queries = _half(gpu, gpu.torch.zeros(2, 15, 8))
        hidden = _half(gpu, gpu.torch.zeros(2, 8, 3, 5))
        prior = gpu.torch.zeros((2, 1, 15, 3), dtype=gpu.torch.bool, device="cuda:0")

        @wraps(original)
        def forward(current: Any, *args: Any, **kwargs: Any) -> Any:
            if current is model:
                try:
                    attention(queries, encoder_hidden_states=context, attention_mask=prior)
                except gpu.adapter.IllustriousRegionalAdapterError as error:
                    caught.append(error)
            return original(current, *args, **kwargs)

        with monkeypatch.context() as patch:
            patch.setattr(type(model), "forward", forward)
            with (
                pytest.raises(gpu.adapter.IllustriousRegionalAdapterError) as error,
                gpu.adapter.scoped_illustrious_regional_attention(
                    model,
                    bindings=(gpu.adapter.TransformerBinding(model, 1),),
                    plan=_small_plan(),
                    tensor_profile=TENSORS,
                ),
            ):
                model(hidden, encoder_hidden_states=context)
            assert caught and error.value is caught[0]
        assert not gpu.adapter._OWNERS
        _profile(gpu, _direct(gpu, monkeypatch, model, context).output)
