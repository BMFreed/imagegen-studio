"""Authored, unexecuted contract for private native regional SDXL denoising.

Only the new runner is exercised. The imported recipe fixture has production
CLIP widths and a real four-stage VAE; fixture labels never name resources to
open. These canonical Python recipes do not prove the Main-producer seam.
Root owns execution, native qualification and isolated semantic mutation.

The named spatial RED/control pair must run the original attention, Euler
steps and VAE. Removing the runner's regional restriction must fail literal
permissions on both steps and the causal scheduler-input/output contrast;
the zero-region ordinary-pipeline control must remain green. There is no
claim that final pixels outside the region are invariant.

Observers patch classes before admission and delegate unchanged originals.
They never install UNet/VAE hooks, shadow instance methods, replace model
outputs or implement a denoising loop. Failure injection is explicitly named.
Direct concurrent forwards and in-place model/hook mutation are excluded.
"""

from __future__ import annotations

import copy
import dataclasses
import importlib
import inspect
from collections.abc import Generator, Mapping
from contextlib import contextmanager
from functools import wraps
from types import SimpleNamespace
from typing import Any, cast

import pytest

from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.illustrious_regional_attention import Alpha8, Everywhere, Shape
from imagegen_worker.inference import (
    build_sdxl_conditioning,
    run_sdxl_pipeline,
    select_inference_scheduler,
)
from imagegen_worker.inference_embeddings import EmbeddingConditioningInputs
from imagegen_worker.protocol import IllustriousNoiseProfile
from test_illustrious_regional_conditioning import (
    _assert_ranges,  # pyright: ignore[reportPrivateUsage]
    _assert_state,  # pyright: ignore[reportPrivateUsage]
    _bindings,  # pyright: ignore[reportPrivateUsage]
    _dense_native_oracle,  # pyright: ignore[reportPrivateUsage]
    _first_attention,  # pyright: ignore[reportPrivateUsage]
    _mask,  # pyright: ignore[reportPrivateUsage]
    _slots,  # pyright: ignore[reportPrivateUsage]
    _state,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    LAYOUTS,
    LOCAL_VISIBLE,
    PROFILE,
    REGIONS,
    REVISION,
    _coverage,  # pyright: ignore[reportPrivateUsage]
    _embedding_ref,  # pyright: ignore[reportPrivateUsage]
    _literal_bank,  # pyright: ignore[reportPrivateUsage]
    _literal_masks,  # pyright: ignore[reportPrivateUsage]
    _no_encoding,  # pyright: ignore[reportPrivateUsage]
    _parameters,  # pyright: ignore[reportPrivateUsage]
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _reference,  # pyright: ignore[reportPrivateUsage]
    _refusal_types,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import native as _recipe_native
from test_illustrious_regional_recipe import native_producer as _recipe_native_producer

recipe_native = _recipe_native
native_producer = _recipe_native_producer
DENOISING_PROFILE = "ordinary-canvas-euler-txt2img-cpu-v1"


def _fixed_parameters(parameters: Any) -> Any:
    return dataclasses.replace(
        parameters,
        noise_profile=IllustriousNoiseProfile(
            rescale_betas_zero_snr=False, timestep_spacing="linspace"
        ),
    )


@pytest.fixture(scope="module")
def native(recipe_native: Any) -> Any:
    # Retain the real recipe models/tokenizers, with a separately owned borrowed
    # pipeline and scheduler. No original fixture object is reconfigured.
    pipeline = copy.copy(recipe_native.pipeline)
    pipeline.scheduler = select_inference_scheduler(
        _fixed_parameters(_parameters(scheduler="euler")), pipeline, recipe_native.runtime
    )
    return SimpleNamespace(**{**vars(recipe_native), "pipeline": pipeline})


@pytest.fixture
def denoising() -> Any:
    # No target/native imports are performed by the authoring/static commands.
    return importlib.import_module("imagegen_worker.illustrious_regional_denoising")


def _snapshot(native: Any, value: Any) -> Any:
    """Retain identity and bounded value snapshots, without copying models."""
    if isinstance(value, native.torch.Tensor):
        return ("tensor", value, value.detach().clone())
    if isinstance(value, Mapping):
        mapping = cast(Mapping[Any, Any], value)
        return ("mapping", value, tuple((key, _snapshot(native, v)) for key, v in mapping.items()))
    if type(value) in (tuple, list):
        return ("sequence", value, tuple(_snapshot(native, v) for v in value))
    if type(value) in (str, bytes, int, float, bool, type(None)):
        return ("scalar", type(value), value)
    return ("identity", value)


def _assert_snapshot(native: Any, value: Any, prior: Any) -> None:
    kind = prior[0]
    if kind == "tensor":
        assert value is prior[1]
        assert value.dtype == prior[2].dtype and value.device == prior[2].device
        assert native.torch.equal(value, prior[2])
    elif kind == "mapping":
        assert value is prior[1]
        assert tuple(value) == tuple(key for key, _ in prior[2])
        for key, child in prior[2]:
            _assert_snapshot(native, value[key], child)
    elif kind == "sequence":
        assert value is prior[1] and len(value) == len(prior[2])
        for current, child in zip(value, prior[2], strict=True):
            _assert_snapshot(native, current, child)
    elif kind == "scalar":
        assert type(value) is prior[1] and value == prior[2]
    else:
        assert value is prior[1]


@contextmanager
def _preserved(native: Any) -> Generator[None]:
    pipeline = native.pipeline
    roots = (pipeline.text_encoder, pipeline.text_encoder_2, pipeline.unet, pipeline.vae)
    states = tuple(_state(root) for root in roots)
    slots = tuple(_slots(root) for root in roots)
    # _slots covers processor/hook/training identity. These additional records
    # include absent instance slots, config values and borrowed scheduler state.
    call_keys = (
        "forward",
        "__call__",
        "_call_impl",
        "_wrapped_call_impl",
        "_slow_forward",
        "_compiled_call_impl",
        "decode",
        "encode",
        "_hf_hook",
    )
    calls: tuple[tuple[Any, Any, Any, dict[str, Any]], ...] = tuple(
        (
            module,
            cast(Any, type(module)),
            cast(Any, type(module)).forward,
            {key: module.__dict__[key] for key in call_keys if key in module.__dict__},
        )
        for root in roots
        for module in root.modules()
    )
    configs = tuple(
        (module, _snapshot(native, module.config))
        for root in roots
        for module in root.modules()
        if hasattr(module, "config")
    )
    pipe_state = _snapshot(native, vars(pipeline))
    scheduler_state = _snapshot(native, vars(pipeline.scheduler))
    vocabs = tuple(
        (tokenizer, dict(tokenizer.get_vocab()), dict(tokenizer.get_added_vocab()))
        for tokenizer in (pipeline.tokenizer, pipeline.tokenizer_2)
    )
    owners = dict(native.adapter._OWNERS)
    reservations = dict(native.recipe._RESERVATIONS)
    rng = native.torch.random.get_rng_state().clone()
    try:
        yield
    finally:
        _assert_snapshot(native, vars(pipeline), pipe_state)
        _assert_snapshot(native, vars(pipeline.scheduler), scheduler_state)
        for root, state, prior in zip(roots, states, slots, strict=True):
            assert _slots(root) == prior
            _assert_state(native, root, state)
        for module, cls, class_forward, prior in calls:
            assert type(module) is cls and cls.forward is class_forward
            assert {
                key: module.__dict__[key] for key in call_keys if key in module.__dict__
            } == prior
        for module, prior in configs:
            _assert_snapshot(native, module.config, prior)
        for tokenizer, vocab, added in vocabs:
            assert tokenizer.get_vocab() == vocab and tokenizer.get_added_vocab() == added
        assert owners == native.adapter._OWNERS
        assert reservations == native.recipe._RESERVATIONS
        assert native.torch.equal(native.torch.random.get_rng_state(), rng)


@pytest.fixture(autouse=True)
def preserved_native_state(native: Any) -> Generator[None]:
    with _preserved(native):
        yield


def _args(native: Any, *, layout: str = LAYOUTS[0], **changes: Any) -> dict[str, Any]:
    return {
        "pipeline": native.pipeline,
        "runtime": native.runtime,
        "parameters": _parameters(
            scheduler="euler", cfg_scale=5.0 if layout == LAYOUTS[0] else 1.0
        ),
        "profile": PROFILE,
        "denoising_profile": DENOISING_PROFILE,
        "global_negative_coverage": Everywhere(),
        "global_positive_coverage": Everywhere(),
        "negative_pooled_source_id": "current-canvas",
        "positive_pooled_source_id": "current-canvas",
        "bindings": _bindings(native, native.pipeline.unet),
        "layout": layout,
        **changes,
    }


def _run(denoising: Any, native: Any, recipe: Any, args: dict[str, Any] | None = None) -> Any:
    return denoising.run_current_canvas_regional_denoising(
        recipe, **(_args(native) if args is None else args)
    )


def _encode(native: Any, positive: str, negative: str) -> Any:
    return build_sdxl_conditioning(
        _parameters(positive, negative, scheduler="euler"),
        native.pipeline,
        native.runtime,
        embedding_inputs=EmbeddingConditioningInputs((positive, negative), (None, None)),
    )


def _copy_tensors(native: Any, value: Any) -> Any:
    if isinstance(value, native.torch.Tensor):
        return value.detach().clone()
    if type(value) is dict:
        mapping = cast(dict[Any, Any], value)
        return {key: _copy_tensors(native, v) for key, v in mapping.items()}
    return value


@contextmanager
def _observe(denoising: Any, native: Any, monkeypatch: Any) -> Generator[Any]:
    """Transparent original native calls, with no forbidden local hooks."""
    pipeline = native.pipeline
    attention = _first_attention(native, pipeline.unet)
    original_processor = attention.processor
    pipeline_call = type(pipeline).__call__
    unet_forward = cast(Any, type(pipeline.unet)).forward
    decode = cast(Any, type(pipeline.vae)).decode
    processor_call = native.processor_type.__call__
    scheduler_step = native.diffusers.EulerDiscreteScheduler.step
    install = native.adapter._Scope.install
    inference = importlib.import_module("imagegen_worker.inference")
    clip = inference._clip_embeddings
    build = build_sdxl_conditioning
    seen = SimpleNamespace(
        contexts=[],
        queries=[],
        masks=[],
        outputs=[],
        root_inputs=[],
        unet_results=[],
        pipeline_inputs=[],
        pipeline_results=[],
        pipelines=[],
        schedulers=[],
        generators=[],
        steps=[],
        decodes=[],
        decode_results=[],
        decode_processors=[],
        decode_reserved=[],
        scopes=[],
        processors=[],
        builds=[],
        clips=[],
        events=[],
    )

    @wraps(pipeline_call)
    def call(current: Any, *args: Any, **kwargs: Any) -> Any:
        seen.pipelines.append(current)
        seen.schedulers.append(current.scheduler)
        seen.generators.append(kwargs["generator"])
        seen.pipeline_inputs.append(_copy_tensors(native, kwargs))
        result = pipeline_call(current, *args, **kwargs)
        seen.pipeline_results.append(result)
        return result

    @wraps(unet_forward)
    def forward(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is pipeline.unet:
            bound = inspect.signature(unet_forward).bind(current, *args, **kwargs)
            seen.root_inputs.append(_copy_tensors(native, dict(bound.arguments)))
            seen.processors.append(attention.processor)
            seen.events.append("unet")
        result = unet_forward(current, *args, **kwargs)
        if current is pipeline.unet:
            seen.unet_results.append(result)
        return result

    @wraps(processor_call)
    def processor(current: Any, attn: Any, *args: Any, **kwargs: Any) -> Any:
        selected = attn is attention
        if selected:
            assert current is original_processor
            seen.queries.append(args[0].detach().clone())
            seen.contexts.append(kwargs["encoder_hidden_states"].detach().clone())
            seen.masks.append(_copy_tensors(native, kwargs.get("attention_mask")))
        result = processor_call(current, attn, *args, **kwargs)
        if selected:
            seen.outputs.append(result.detach().clone())
        return result

    @wraps(scheduler_step)
    def step(current: Any, *args: Any, **kwargs: Any) -> Any:
        bound = inspect.signature(scheduler_step).bind(current, *args, **kwargs)
        seen.steps.append(_copy_tensors(native, dict(bound.arguments)))
        seen.events.append("step")
        return scheduler_step(current, *args, **kwargs)

    @wraps(decode)
    def decode_original(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is pipeline.vae:
            seen.decodes.append(_copy_tensors(native, args[0]))
            seen.events.append("decode")
            seen.decode_processors.append(attention.processor)
            seen.decode_reserved.append(id(current) in native.recipe._RESERVATIONS)
        result = decode(current, *args, **kwargs)
        if current is pipeline.vae:
            seen.decode_results.append(result)
        return result

    @wraps(install)
    def install_original(scope: Any) -> Any:
        seen.scopes.append(scope)
        return install(scope)

    @wraps(build)
    def build_original(parameters: Any, *args: Any, **kwargs: Any) -> Any:
        seen.builds.append((parameters.positive_prompt, parameters.negative_prompt))
        return build(parameters, *args, **kwargs)

    @wraps(clip)
    def clip_original(text: str, **kwargs: Any) -> Any:
        seen.clips.append((text, kwargs["encoder"].config.hidden_size))
        return clip(text, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(type(pipeline), "__call__", call)
        patch.setattr(type(pipeline.unet), "forward", forward)
        patch.setattr(type(pipeline.vae), "decode", decode_original)
        patch.setattr(native.processor_type, "__call__", processor)
        patch.setattr(native.diffusers.EulerDiscreteScheduler, "step", step)
        patch.setattr(native.adapter._Scope, "install", install_original)
        patch.setattr(inference, "_clip_embeddings", clip_original)
        # Cover already-bound aliases of the same public producer, whichever
        # module owns the shared extraction. No private helper is invented.
        for module in (inference, native.recipe, denoising):
            for name, value in tuple(vars(module).items()):
                if value is build:
                    patch.setattr(module, name, build_original)
        yield seen


def _image(native: Any, result: Any) -> Any:
    output_type = importlib.import_module(
        "diffusers.pipelines.stable_diffusion_xl.pipeline_output"
    ).StableDiffusionXLPipelineOutput
    assert type(result) is output_type
    image = result.images
    assert image.shape == (1, 3, 16, 24)
    assert image.dtype == native.torch.float32 and image.device.type == "cpu"
    assert native.torch.isfinite(image).all()
    return image


def _assert_lifecycle(
    native: Any, result: Any, seen: Any, steps: int, *, require_regional_scope: bool = True
) -> None:
    _image(native, result)
    assert len(seen.pipeline_results) == 1 and result is seen.pipeline_results[0]
    assert len(seen.decodes) == len(seen.decode_results) == 1
    assert seen.decode_reserved == [True]
    if require_regional_scope:
        assert len(seen.scopes) == 1
        assert seen.decode_processors[0] is seen.processors[0]
        assert (
            seen.decode_processors[0]
            is not _first_attention(native, native.pipeline.unet).processor
        )
    assert len(seen.root_inputs) == len(seen.steps) == len(seen.contexts) == steps
    assert seen.events == [event for _ in range(steps) for event in ("unet", "step")] + ["decode"]
    assert all(processor is seen.processors[0] for processor in seen.processors)
    assert seen.pipelines[0] is not native.pipeline
    assert seen.pipelines[0].unet is native.pipeline.unet
    assert seen.pipelines[0].vae is native.pipeline.vae
    assert type(seen.schedulers[0]) is native.diffusers.EulerDiscreteScheduler
    assert seen.schedulers[0] is not native.pipeline.scheduler
    assert seen.schedulers[0].config.prediction_type == "epsilon"
    config = seen.schedulers[0].config
    assert config.num_train_timesteps == 1000
    assert config.beta_start == 0.00085 and config.beta_end == 0.012
    assert config.beta_schedule == "scaled_linear" and config.trained_betas is None
    assert config.steps_offset == 1 and config.timestep_spacing == "linspace"
    assert config.rescale_betas_zero_snr is False
    assert seen.generators[0].device.type == "cpu" and seen.generators[0].initial_seed() == 42
    options = seen.pipeline_inputs[0]
    assert options["output_type"] == "pt" and options["num_images_per_prompt"] == 1
    assert options["width"] == 24 and options["height"] == 16
    assert options["guidance_rescale"] == 0 and options["num_inference_steps"] == steps
    for name in ("original_size", "target_size", "negative_original_size", "negative_target_size"):
        assert options[name] == (1024, 1024)
    assert options["crops_coords_top_left"] == options["negative_crops_coords_top_left"] == (0, 0)
    assert options.get("callback_on_step_end") is None


def _assert_attention(native: Any, seen: Any, context: Any, permissions: Any, pools: Any) -> None:
    assert len(seen.contexts) in (1, 2)
    for index, observed in enumerate(seen.contexts):
        assert native.torch.equal(observed, context)
        assert type(seen.masks[index]) is native.torch.Tensor, (
            "Original native attention consumed no required spatial permissions."
        )
        assert native.torch.equal(
            _mask(native, seen.masks[index], len(context), 6, context.shape[1]), permissions
        )
        root = seen.root_inputs[index]
        assert native.torch.equal(root["added_cond_kwargs"]["text_embeds"], pools)
        assert native.torch.equal(
            root["added_cond_kwargs"]["time_ids"],
            native.torch.tensor([[1024.0, 1024.0, 0.0, 0.0, 1024.0, 1024.0]]).repeat(
                len(context), 1
            ),
        )
        expected = _dense_native_oracle(
            native,
            _first_attention(native, native.pipeline.unet),
            seen.queries[index],
            context,
            permissions,
        )
        assert native.torch.allclose(seen.outputs[index], expected, atol=2e-6, rtol=2e-6)


@pytest.mark.parametrize("layout", LAYOUTS)
@pytest.mark.parametrize("steps", [1, 2])
def test_native_rectangular_loop_encodes_once_true_lengths_padding_and_nonfirst_pools(
    denoising: Any, native: Any, monkeypatch: Any, layout: str, steps: int
) -> None:
    long_text = " ".join(["cat"] * 26)  # Real unmerged tokenizer: 154 rows, not 77.
    global_stream = _encode(native, "cat", "blur")
    regional_stream = _encode(native, long_text, "grain")
    assert (regional_stream.positive_length, regional_stream.negative_length) == (154, 77)
    recipe = _recipe(_region(positive=long_text))
    args = _args(
        native,
        layout=layout,
        negative_pooled_source_id=REGIONS[0],
        positive_pooled_source_id=REGIONS[0],
    )
    args["parameters"] = dataclasses.replace(args["parameters"], steps=steps)
    negative = _literal_bank(native, (global_stream, regional_stream), "negative", 231)
    positive = _literal_bank(native, (global_stream, regional_stream), "positive", 231)
    context = native.torch.cat((negative, positive)) if layout == LAYOUTS[0] else positive
    pools = (
        native.torch.cat((regional_stream.negative_pooled, regional_stream.positive_pooled))
        if layout == LAYOUTS[0]
        else regional_stream.positive_pooled
    )
    permissions = _literal_masks(
        native, negative_lengths=(77, 77), positive_lengths=(77, 154), layout=layout
    )
    with _observe(denoising, native, monkeypatch) as seen:
        result = _run(denoising, native, recipe, args)
    _assert_lifecycle(native, result, seen, steps)
    _assert_attention(native, seen, context, permissions, pools)
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
        assert native.torch.count_nonzero(seen.contexts[0][0, 154:]) == 0
        assert not permissions[0, :, :, 154:].any()


def test_region_spatial_mask_mutation_red(denoising: Any, native: Any, monkeypatch: Any) -> None:
    global_stream = _encode(native, "cat", "blur")
    local_stream = _encode(native, "dog", "grain")
    context = native.torch.cat(
        tuple(
            _literal_bank(native, (global_stream, local_stream), sign, 154)
            for sign in ("negative", "positive")
        )
    )
    pools = native.torch.cat((global_stream.negative_pooled, global_stream.positive_pooled))
    complement = (False, True, True, False, True, False)
    observations: list[Any] = []
    images: list[Any] = []
    for values, visible in (
        (bytes((255, 0, 127, 128, 1, 255)), LOCAL_VISIBLE),
        (bytes((0, 255, 255, 0, 255, 0)), complement),
    ):
        region = _region()
        region["coverage"] = _coverage(values)
        with _observe(denoising, native, monkeypatch) as seen:
            result = _run(denoising, native, _recipe(region))
        # Literal spatial permission is observed at the ORIGINAL processor on
        # BOTH steps, after it has actually consumed the native queries/context.
        permissions = _literal_masks(
            native, negative_lengths=(77, 77), positive_lengths=(77, 77), visibility=(visible,)
        )
        _assert_attention(native, seen, context, permissions, pools)
        _assert_lifecycle(native, result, seen, 2)
        observations.append(seen)
        images.append(result.images.clone())
    left, right = observations
    assert native.torch.equal(left.root_inputs[0]["sample"], right.root_inputs[0]["sample"])
    # Only coverage changed. This is the Euler scheduler's actual model input,
    # not an independently substituted prediction or a final-pixel locality test.
    assert not native.torch.equal(left.steps[0]["model_output"], right.steps[0]["model_output"])
    assert not native.torch.equal(images[0], images[1])


def _ordinary(native: Any, parameters: Any) -> Any:
    """Independent original pipeline call, same selector/config/seed/size."""
    borrowed = native.pipeline
    scheduler = select_inference_scheduler(_fixed_parameters(parameters), borrowed, native.runtime)
    pipeline = native.diffusers.StableDiffusionXLPipeline(
        vae=borrowed.vae,
        text_encoder=borrowed.text_encoder,
        text_encoder_2=borrowed.text_encoder_2,
        tokenizer=borrowed.tokenizer,
        tokenizer_2=borrowed.tokenizer_2,
        unet=borrowed.unet,
        scheduler=scheduler,
        add_watermarker=False,
    )
    pipeline.set_progress_bar_config(disable=True)
    encoded = _encode(native, parameters.positive_prompt, parameters.negative_prompt)
    return pipeline(
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
@pytest.mark.parametrize("steps", [1, 2])
def test_zero_region_spatial_mask_control_green(
    denoising: Any, native: Any, monkeypatch: Any, layout: str, steps: int
) -> None:
    args = _args(native, layout=layout)
    args["parameters"] = dataclasses.replace(args["parameters"], steps=steps)
    ordinary = _ordinary(native, args["parameters"])
    with _observe(denoising, native, monkeypatch) as seen:
        first = _run(denoising, native, _recipe(), args)
    _assert_lifecycle(native, first, seen, steps, require_regional_scope=False)
    assert native.torch.equal(first.images, _image(native, ordinary))
    with _observe(denoising, native, monkeypatch) as repeated:
        second = _run(denoising, native, _recipe(), args)
    assert native.torch.equal(first.images, _image(native, second))
    assert seen.schedulers[0] is not repeated.schedulers[0]
    assert seen.pipelines[0] is not repeated.pipelines[0]
    assert seen.generators[0] is not repeated.generators[0]
    assert seen.builds == repeated.builds == [("cat", "blur")]
    assert len(seen.outputs) == steps  # Original attention genuinely ran.
    for mask in seen.masks:
        if mask is not None:  # Native no-mask and explicit all-true are Everywhere.
            assert _mask(native, mask, 2 if layout == LAYOUTS[0] else 1, 6, 77).all()


@pytest.mark.parametrize("control", ["seed", "positive"])
def test_real_output_changes_with_seed_or_global_text_control(
    denoising: Any, native: Any, control: str
) -> None:
    baseline = _image(native, _run(denoising, native, _recipe())).clone()
    recipe, args = _recipe(), _args(native)
    if control == "seed":
        recipe["item"]["seed"] = 43
        args["parameters"] = dataclasses.replace(args["parameters"], seed=43)
    else:
        recipe = _recipe(positive="dog")
        args["parameters"] = dataclasses.replace(args["parameters"], positive_prompt="dog")
    assert not native.torch.equal(baseline, _image(native, _run(denoising, native, recipe, args)))


def test_fixed_schedule_ignores_borrowed_config_and_advanced_scheduler_state(
    denoising: Any, native: Any, monkeypatch: Any
) -> None:
    args = _args(native)
    expected = _image(native, _ordinary(native, args["parameters"])).clone()
    alternate = native.diffusers.EulerDiscreteScheduler(
        num_train_timesteps=17,
        beta_start=0.01,
        beta_end=0.3,
        beta_schedule="linear",
        timestep_spacing="trailing",
        steps_offset=0,
        rescale_betas_zero_snr=True,
        prediction_type="epsilon",
    )
    alternate.set_timesteps(4, device="cpu")
    alternate._step_index = 2
    alternate.is_scale_input_called = True
    prior = _snapshot(native, vars(alternate))
    with monkeypatch.context() as patch:
        # Journal only the borrowed reference. Diffusers' __setattr__ also
        # registers config, which would outlive pytest's attribute restoration.
        patch.setitem(native.pipeline.__dict__, "scheduler", alternate)
        with _observe(denoising, native, monkeypatch) as seen:
            result = _run(denoising, native, _recipe(), args)
        _assert_lifecycle(native, result, seen, 2)
        assert native.torch.equal(result.images, expected)
        _assert_snapshot(native, vars(alternate), prior)
    assert args["parameters"].noise_profile is None


@pytest.mark.parametrize("positive", [None, ""])
def test_negative_only_and_explicit_empty_positive_keep_distinct_ranges_all_steps(
    denoising: Any, native: Any, monkeypatch: Any, positive: str | None
) -> None:
    global_stream, local = _encode(native, "cat", "blur"), _encode(native, "", "grain")
    negative = _literal_bank(native, (global_stream, local), "negative", 154)
    positive_streams = (global_stream,) if positive is None else (global_stream, local)
    positive_bank = _literal_bank(native, positive_streams, "positive", 154)
    context = native.torch.cat((negative, positive_bank))
    permissions = _literal_masks(
        native, negative_lengths=(77, 77), positive_lengths=(77,) if positive is None else (77, 77)
    )
    pools = native.torch.cat((global_stream.negative_pooled, global_stream.positive_pooled))
    with _observe(denoising, native, monkeypatch) as seen:
        result = _run(denoising, native, _recipe(_region(positive=positive)))
    _assert_lifecycle(native, result, seen, 2)
    _assert_attention(native, seen, context, permissions, pools)
    _assert_ranges(
        seen.scopes[0].plan,
        "positive",
        (("current-canvas", 0, 77),)
        if positive is None
        else (("current-canvas", 0, 77), (REGIONS[0], 77, 154)),
    )
    assert seen.builds == [("cat", "blur"), ("", "grain")]


def test_order_inherited_dormant_local_empty_and_zero_support_remain_owned(
    denoising: Any, native: Any, monkeypatch: Any
) -> None:
    inherited = _region(2, positive="dog", negative="blur", inherited=True)
    inherited["authoredPrompts"]["negative"] = {
        "text": "{dormant|grain} <lora:no:1>",
        "embeddingRefs": [_embedding_ref()],
    }
    empty = _region(0, positive="", negative="", kind="outside")
    args = _args(native, negative_pooled_source_id=REGIONS[0], positive_pooled_source_id=REGIONS[0])
    global_stream = _encode(native, "cat", "blur")
    local, zeros = _encode(native, "dog", "blur"), _encode(native, "", "")
    context = native.torch.cat(
        tuple(
            _literal_bank(native, (global_stream, local, zeros), sign, 231)
            for sign in ("negative", "positive")
        )
    )
    permissions = _literal_masks(
        native,
        negative_lengths=(77, 77, 77),
        positive_lengths=(77, 77, 77),
        visibility=(LOCAL_VISIBLE, (False,) * 6),
    )
    with _observe(denoising, native, monkeypatch) as seen:
        result = _run(denoising, native, _recipe(inherited, empty), args)
    _assert_lifecycle(native, result, seen, 2)
    _assert_attention(native, seen, context, permissions, native.torch.zeros(2, 1280))
    assert seen.builds == [("cat", "blur"), ("dog", "blur"), ("", "")]
    assert [text for text, width in seen.clips if width == 768] == [
        "cat",
        "blur",
        "dog",
        "blur",
        "",
        "",
    ]
    for sign in ("negative", "positive"):
        _assert_ranges(
            seen.scopes[0].plan,
            sign,
            (("current-canvas", 0, 77), (REGIONS[2], 77, 154), (REGIONS[0], 154, 231)),
        )


def _refused(
    denoising: Any,
    native: Any,
    monkeypatch: Any,
    recipe: Any,
    args: dict[str, Any],
    *,
    codes: tuple[str, ...] | None = None,
    tokenize: bool = False,
) -> Any:
    # Existing tripwires ban every encoder, scope installation and instance slot
    # mutation. Add decode: malformed late inputs must never touch the VAE.
    def deny_decode(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("premature VAE decode")

    with _no_encoding(native, monkeypatch, tokenize=tokenize), monkeypatch.context() as patch:
        patch.setattr(type(native.pipeline.vae), "decode", deny_decode)
        with pytest.raises(
            (denoising.IllustriousRegionalDenoisingError, *_refusal_types(native))
        ) as error:
            _run(denoising, native, recipe, args)
    refusal = cast(Any, error.value)
    assert isinstance(refusal.code, str) and refusal.code
    if codes is not None:
        assert refusal.code in codes
    return refusal


@pytest.mark.parametrize(
    "case",
    [
        "late-invalid",
        "overbudget",
        "positive-only-negative",
        "static",
        "refs",
        "image",
        "bindings",
        "all-masked",
    ],
)
def test_complete_recipe_preflight_before_first_encoder_or_install(
    denoising: Any, native: Any, monkeypatch: Any, case: str
) -> None:
    recipe, args = _recipe(_region(), _region(1), _region(2)), _args(native)
    codes = ("INPUT_INVALID",)
    tokenize = False
    if case == "late-invalid":
        recipe["regions"][-1]["negative"]["prompt"]["text"] = 13
    elif case in ("overbudget", "positive-only-negative"):
        if case == "positive-only-negative":
            args = _args(native, layout="positive-only")
        recipe["regions"][-1]["negative"]["prompt"]["text"] = " ".join(["cat"] * 101)
        recipe["regions"][-1]["authoredPrompts"]["negative"]["text"] = " ".join(["cat"] * 101)
        codes, tokenize = ("LIMIT", "GENERATION_PROMPT_UNSUPPORTED"), True
    elif case == "static":
        recipe["regions"][-1]["negative"]["prompt"]["text"] = "{grain|noise}"
        recipe["regions"][-1]["authoredPrompts"]["negative"]["text"] = "{grain|noise}"
        codes = ("GENERATION_PROMPT_UNSUPPORTED",)
    elif case == "refs":
        recipe["regions"][-1]["negative"]["prompt"]["embeddingRefs"] = [_embedding_ref()]
        codes = ("UNSUPPORTED",)
    elif case == "image":
        recipe["regions"][-1]["referenceImages"] = [_reference()]
        codes = ("UNSUPPORTED",)
    elif case == "bindings":
        args["bindings"] = ()
        codes, tokenize = ("INPUT_INVALID",), True
    else:
        args["global_positive_coverage"] = Alpha8(Shape(2, 3), bytes(6))
        recipe = _recipe(_region(kind="outside"))
        codes, tokenize = ("ALL_MASKED",), True
    _refused(denoising, native, monkeypatch, recipe, args, codes=codes, tokenize=tokenize)
    _image(native, _run(denoising, native, _recipe()))


@pytest.mark.parametrize(
    "case",
    [
        "profile",
        "steps-zero",
        "steps-three",
        "steps-bool",
        "cfg-low",
        "cfg-high",
        "cfg-nan",
        "layout",
        "scheduler",
        "prediction",
        "rescale",
        "noise",
        "seed",
        "fp16",
        "external-vae",
    ],
)
def test_new_execution_preflight_precedes_encoding_and_restores_for_fresh_call(
    denoising: Any, native: Any, monkeypatch: Any, case: str
) -> None:
    args = _args(native)
    changes: dict[str, Any] = {
        "steps-zero": {"steps": 0},
        "steps-three": {"steps": 3},
        "steps-bool": {"steps": True},
        "cfg-low": {"cfg_scale": 0.5},
        "cfg-high": {"cfg_scale": 31.0},
        "cfg-nan": {"cfg_scale": float("nan")},
        "scheduler": {"scheduler": "euler_a"},
        "prediction": {"prediction_type": "v_prediction"},
        "rescale": {"cfg_rescale": 0.1},
        "noise": {"noise_profile": SimpleNamespace()},
        "seed": {"seed": 43},
        "fp16": {"vae_precision": "FP16"},
        "external-vae": {"vae": SimpleNamespace()},
    }
    if case == "profile":
        args["denoising_profile"] = PROFILE
    elif case == "layout":
        args["layout"] = "positive-only"  # cfg=5 still asks native CFG.
    else:
        args["parameters"] = dataclasses.replace(args["parameters"], **changes[case])
    _refused(denoising, native, monkeypatch, _recipe(), args)
    _image(native, _run(denoising, native, _recipe()))


@pytest.mark.parametrize("precision,cfg", [("Auto", 1.0), ("FP32", 30.0)])
def test_allowed_precision_and_cfg_endpoints_without_model_mutation(
    denoising: Any, native: Any, precision: str, cfg: float
) -> None:
    args = _args(native, layout="positive-only" if cfg == 1 else "cfg-negative-first")
    args["parameters"] = dataclasses.replace(
        args["parameters"], vae_precision=precision, cfg_scale=cfg
    )
    _image(native, _run(denoising, native, _recipe(_region()), args))


@pytest.mark.parametrize(
    "case",
    [
        "vae-offload",
        "vae-scale",
        "vae-scaling-factor",
        "vae-shadow",
        "vae-training",
        "unet-training",
    ],
)
def test_native_vae_and_model_profile_refuse_before_first_encoder(
    denoising: Any, native: Any, monkeypatch: Any, case: str
) -> None:
    with monkeypatch.context() as patch:
        if case == "vae-offload":
            patch.setitem(native.pipeline.vae.__dict__, "_hf_hook", object())
        elif case == "vae-scale":
            patch.setattr(native.pipeline, "vae_scale_factor", 4)
        elif case == "vae-scaling-factor":
            config = native.pipeline.vae.config
            patch.setitem(
                native.pipeline.vae.__dict__,
                "_internal_dict",
                type(config)({**dict(config), "scaling_factor": 0.0}),
            )
        elif case == "vae-shadow":
            patch.setitem(native.pipeline.vae.__dict__, "decode", native.pipeline.vae.decode)
        else:
            patch.setattr(
                native.pipeline.vae if case == "vae-training" else native.pipeline.unet,
                "training",
                True,
            )
        _refused(
            denoising,
            native,
            monkeypatch,
            _recipe(),
            _args(native),
            codes=("PROFILE_INVALID",),
            tokenize=True,
        )
    _image(native, _run(denoising, native, _recipe()))


@pytest.mark.parametrize("owner", ["unet", "vae"])
@pytest.mark.parametrize("internal", [False, True])
@pytest.mark.parametrize("post", [False, True])
def test_existing_unet_vae_hook_refusal_leaves_exact_registries_then_remove_succeeds(
    denoising: Any, native: Any, monkeypatch: Any, owner: str, internal: bool, post: bool
) -> None:
    root = getattr(native.pipeline, owner)
    target = next(child for child in root.modules() if child is not root) if internal else root
    hits: list[bool] = []

    def observer(*_args: Any, **_kwargs: Any) -> None:
        hits.append(True)

    register = target.register_forward_hook if post else target.register_forward_pre_hook
    handle = register(observer, with_kwargs=True)
    with_hook = _slots(root)
    try:
        _refused(denoising, native, monkeypatch, _recipe(), _args(native), tokenize=True)
        assert hits == [] and _slots(root) == with_hook
    finally:
        handle.remove()
    _image(native, _run(denoising, native, _recipe()))


@pytest.mark.parametrize("post", [False, True])
def test_global_forward_hooks_refuse_without_touching_them_then_recover(
    denoising: Any, native: Any, monkeypatch: Any, post: bool
) -> None:
    hooks = importlib.import_module("torch.nn.modules.module")
    hits: list[bool] = []

    def observer(*_args: Any) -> None:
        hits.append(True)

    register = (
        hooks.register_module_forward_hook if post else hooks.register_module_forward_pre_hook
    )
    handle = register(observer)
    keys = (
        "_global_forward_pre_hooks",
        "_global_forward_hooks",
        "_global_forward_hooks_always_called",
    )
    prior = {key: tuple(getattr(hooks, key).items()) for key in keys}
    try:
        _refused(
            denoising, native, monkeypatch, _recipe(), _args(native), codes=("PROFILE_INVALID",)
        )
        assert hits == []
        assert {key: tuple(getattr(hooks, key).items()) for key in keys} == prior
    finally:
        handle.remove()
    _image(native, _run(denoising, native, _recipe()))


@pytest.mark.parametrize("stage", ["encoder", "second-unet", "second-step", "decode"])
def test_native_failures_keep_exception_identity_restore_and_allow_fresh_call(
    denoising: Any, native: Any, monkeypatch: Any, stage: str
) -> None:
    failure = (
        DerivativeError("GENERATION_WORKER_FAILED", "original decode failure sentinel")
        if stage == "decode"
        else RuntimeError("original stage failure sentinel")
    )
    target: Any = (
        cast(Any, type(native.pipeline.text_encoder))
        if stage == "encoder"
        else cast(Any, type(native.pipeline.unet))
        if stage == "second-unet"
        else native.diffusers.EulerDiscreteScheduler
        if stage == "second-step"
        else cast(Any, type(native.pipeline.vae))
    )
    name = (
        "forward"
        if stage in ("encoder", "second-unet")
        else "step"
        if stage == "second-step"
        else "decode"
    )
    original = getattr(target, name)
    calls: list[bool] = []

    @wraps(original)
    def fail(current: Any, *args: Any, **kwargs: Any) -> Any:
        calls.append(True)
        if len(calls) == (1 if stage in ("encoder", "decode") else 2):
            raise failure
        return original(current, *args, **kwargs)

    with _preserved(native), monkeypatch.context() as patch:
        patch.setattr(target, name, fail)
        with pytest.raises(type(failure)) as error:
            _run(denoising, native, _recipe(_region()))
        assert error.value is failure
        if stage == "decode":
            assert cast(Any, error.value).code == "GENERATION_WORKER_FAILED"
        assert len(calls) == (1 if stage in ("encoder", "decode") else 2)
    _image(native, _run(denoising, native, _recipe(_region())))


def test_partial_owned_registration_failure_rolls_back_real_late_guards_and_recovers(
    denoising: Any, native: Any, monkeypatch: Any
) -> None:
    # Source-confirmed boundary: _scoped_denoising_value_guards installs its
    # root forward slot, then appends one prehook to each real attn2 site.
    # The adapter and finite-output hooks are already installed at this point.
    root = native.pipeline.unet
    sites = tuple(
        block.attn2
        for binding in _bindings(native, root)
        for block in binding.transformer.transformer_blocks
    )
    assert len(sites) >= 2
    original = native.torch.nn.Module.register_forward_pre_hook
    installed: list[Any] = []
    failure = RuntimeError("second real late-guard registration sentinel")

    @wraps(original)
    def register(module: Any, *args: Any, **kwargs: Any) -> Any:
        late = any(module is site for site in sites) and "forward" in root.__dict__
        if late and installed:
            assert installed[0].id in sites[0]._forward_pre_hooks
            assert _first_attention(native, root).processor is not original_processor
            raise failure
        handle = original(module, *args, **kwargs)
        if late:
            installed.append(handle)
        return handle

    original_processor = _first_attention(native, root).processor
    with _preserved(native), monkeypatch.context() as patch:
        patch.setattr(native.torch.nn.Module, "register_forward_pre_hook", register)
        with pytest.raises(RuntimeError) as error:
            _run(denoising, native, _recipe(_region()))
        assert error.value is failure and len(installed) == 1
    _image(native, _run(denoising, native, _recipe(_region())))


@pytest.mark.parametrize("site", ["scheduler", "decode"])
def test_nonfinite_native_values_refuse_before_image_clamp_and_fresh_call_recovers(
    denoising: Any, native: Any, monkeypatch: Any, site: str
) -> None:
    # Run native mathematics first; inject one explicit failure value afterward.
    target: Any = (
        native.diffusers.EulerDiscreteScheduler
        if site == "scheduler"
        else cast(Any, type(native.pipeline.vae.decoder))
    )
    name = "step" if site == "scheduler" else "forward"
    original = getattr(target, name)
    calls: list[bool] = []

    @wraps(original)
    def nonfinite(current: Any, *args: Any, **kwargs: Any) -> Any:
        result = original(current, *args, **kwargs)
        calls.append(True)
        tensor: Any = (
            (cast(tuple[Any, ...], result)[0] if isinstance(result, tuple) else result.prev_sample)
            if site == "scheduler"
            else result
        )
        # +inf would become a finite white pixel if only post-clamp validation ran.
        tensor.fill_(float("inf"))
        return cast(Any, result)

    with _preserved(native), monkeypatch.context() as patch:
        patch.setattr(target, name, nonfinite)
        with pytest.raises((denoising.IllustriousRegionalDenoisingError, *_refusal_types(native))):
            _run(denoising, native, _recipe(_region()))
        assert calls
    _image(native, _run(denoising, native, _recipe()))


def test_recipe_and_explicit_coverage_aliases_frozen_at_existing_clip_observer(
    denoising: Any, native: Any, monkeypatch: Any
) -> None:
    recipe = _recipe(_region())
    args = _args(native)
    parameters = args["parameters"]
    global_coverage = Alpha8(Shape(2, 3), bytes((255, 255, 255, 255, 255, 255)))
    args["global_positive_coverage"] = global_coverage
    expected_global, local = _encode(native, "cat", "blur"), _encode(native, "dog", "grain")
    context = native.torch.cat(
        tuple(
            _literal_bank(native, (expected_global, local), sign, 154)
            for sign in ("negative", "positive")
        )
    )
    pools = native.torch.cat((expected_global.negative_pooled, expected_global.positive_pooled))
    barrier: list[bool] = []

    def before(_module: Any, _args: Any, _kwargs: Any) -> None:
        if barrier:
            return
        barrier.append(True)
        recipe["documentId"] = REVISION
        recipe["bbox"]["width"] = 8
        recipe["item"]["seed"] = 99
        recipe["globalPrompts"]["negative"]["text"] = "noise"
        recipe["regions"][0]["negative"]["prompt"]["text"] = "noise"
        recipe["regions"][0]["positive"]["text"] = "fox"
        recipe["regions"][0]["coverage"]["alpha"] = bytes(24 * 16)
        recipe["regions"].clear()
        # Frozen DTO escape hatches model borrowed caller aliases; never change
        # the encoder's own input IDs, weights, hooks or outputs.
        object.__setattr__(parameters, "seed", 99)
        object.__setattr__(parameters, "steps", 1)
        object.__setattr__(global_coverage, "samples", bytes(6))
        args["bindings"] = ()

    handle = native.pipeline.text_encoder.register_forward_pre_hook(before, with_kwargs=True)
    try:
        with _observe(denoising, native, monkeypatch) as seen:
            result = _run(denoising, native, recipe, args)
    finally:
        handle.remove()
    assert barrier == [True]
    _assert_lifecycle(native, result, seen, 2)
    _assert_attention(
        native,
        seen,
        context,
        _literal_masks(native, negative_lengths=(77, 77), positive_lengths=(77, 77)),
        pools,
    )


def test_converted_producer_tensor_aliases_detached_before_later_encoder_hook(
    denoising: Any, native: Any, monkeypatch: Any
) -> None:
    global_stream = _encode(native, "cat", "blur")
    local = _encode(native, "dog", "grain")
    context = native.torch.cat(
        tuple(
            _literal_bank(native, (global_stream, local), sign, 154)
            for sign in ("negative", "positive")
        )
    )
    pools = native.torch.cat((global_stream.negative_pooled, global_stream.positive_pooled))
    aliases: list[Any] = []
    mutated: list[bool] = []
    original = native.recipe.build_sdxl_conditioning

    @wraps(original)
    def producer(*args: Any, **kwargs: Any) -> Any:
        result = original(*args, **kwargs)
        aliases.append(result)
        return result

    def before(_module: Any, _args: Any, _kwargs: Any) -> None:
        if not aliases or mutated:
            return
        mutated.append(True)
        # The previous real producer result has already passed through the
        # existing owned converter. Change these borrowed source aliases at the
        # next encoder barrier; no encoder/model arguments or outputs are replaced.
        for field in ("positive", "negative", "positive_pooled", "negative_pooled"):
            getattr(aliases[0], field).fill_(9.0)

    handle = native.pipeline.text_encoder.register_forward_pre_hook(before, with_kwargs=True)
    try:
        with monkeypatch.context() as patch:
            patch.setattr(native.recipe, "build_sdxl_conditioning", producer)
            with _observe(denoising, native, monkeypatch) as seen:
                result = _run(denoising, native, _recipe(_region()))
    finally:
        handle.remove()
    assert mutated == [True] and len(aliases) == 2
    _assert_lifecycle(native, result, seen, 2)
    _assert_attention(
        native,
        seen,
        context,
        _literal_masks(native, negative_lengths=(77, 77), positive_lengths=(77, 77)),
        pools,
    )


@pytest.mark.parametrize("shared", ["pipeline", "vae", "vae-submodule"])
def test_reentry_and_used_vae_overlap_refuse_at_clip_barrier_then_recover(
    denoising: Any, native: Any, monkeypatch: Any, shared: str
) -> None:
    inner = _args(native)
    if shared != "pipeline":
        pipeline = copy.copy(native.pipeline)
        for field in ("tokenizer", "tokenizer_2", "text_encoder", "text_encoder_2", "unet", "vae"):
            if field == "vae" and shared == "vae":
                continue
            setattr(pipeline, field, copy.deepcopy(getattr(native.pipeline, field)))
        if shared == "vae-submodule":
            pipeline.vae.decoder.conv_out = native.pipeline.vae.decoder.conv_out
        inner.update(pipeline=pipeline, bindings=_bindings(native, pipeline.unet))
    calls: list[bool] = []

    def before(_module: Any, _args: Any, _kwargs: Any) -> None:
        if calls:
            return
        calls.append(True)
        _refused(
            denoising,
            native,
            monkeypatch,
            _recipe(),
            inner,
            codes=("SCOPE_CONFLICT",),
            tokenize=True,
        )

    handle = native.pipeline.text_encoder.register_forward_pre_hook(before, with_kwargs=True)
    try:
        _image(native, _run(denoising, native, _recipe(_region())))
    finally:
        handle.remove()
    assert calls == [True]
    _image(native, _run(denoising, native, _recipe(), inner))


def test_disjoint_used_models_including_vae_can_nest_with_shared_runtime(
    denoising: Any, native: Any
) -> None:
    pipeline = copy.copy(native.pipeline)
    for field in ("tokenizer", "tokenizer_2", "text_encoder", "text_encoder_2", "unet", "vae"):
        setattr(pipeline, field, copy.deepcopy(getattr(native.pipeline, field)))
    args = _args(native, pipeline=pipeline, bindings=_bindings(native, pipeline.unet))
    results: list[Any] = []

    def before(_module: Any, _args: Any, _kwargs: Any) -> None:
        if results:
            return
        # Hook belongs to the outer CLIP only. All used inner owners are disjoint.
        results.append(_run(denoising, native, _recipe(), args))

    handle = native.pipeline.text_encoder.register_forward_pre_hook(before, with_kwargs=True)
    try:
        outer = _run(denoising, native, _recipe())
    finally:
        handle.remove()
    assert len(results) == 1
    assert native.torch.equal(_image(native, outer), _image(native, results[0]))


def test_settled_signature_only_required_inputs_and_no_execution_overrides(denoising: Any) -> None:
    signature = inspect.signature(denoising.run_current_canvas_regional_denoising)
    assert tuple(signature.parameters) == (
        "recipe",
        "pipeline",
        "runtime",
        "parameters",
        "profile",
        "denoising_profile",
        "global_negative_coverage",
        "global_positive_coverage",
        "negative_pooled_source_id",
        "positive_pooled_source_id",
        "bindings",
        "layout",
        "on_progress",
        "image",
        "denoising_strength",
        "keep_mask",
        "_smart_patch_source_id",
        "references",
    )
    # Captured image conditioning is optional; it does not introduce an execution override.
    assert signature.parameters["references"].default is None
    for name, parameter in signature.parameters.items():
        assert parameter.default is (
            None
            if name
            in (
                "on_progress",
                "image",
                "denoising_strength",
                "keep_mask",
                "_smart_patch_source_id",
                "references",
            )
            else inspect.Parameter.empty
        )
        assert parameter.kind is (
            inspect.Parameter.POSITIONAL_OR_KEYWORD
            if name == "recipe"
            else inspect.Parameter.KEYWORD_ONLY
        )


def test_existing_pipeline_helper_default_pil_and_explicit_pt_use_native_decode(
    native: Any,
) -> None:
    assert inspect.signature(run_sdxl_pipeline).parameters["output_type"].default == "pil"
    borrowed = native.pipeline
    encoded = _encode(native, "cat", "blur")
    outputs: list[Any] = []
    for output_type in (None, "pt"):
        pipeline = native.diffusers.StableDiffusionXLPipeline(
            vae=borrowed.vae,
            text_encoder=borrowed.text_encoder,
            text_encoder_2=borrowed.text_encoder_2,
            tokenizer=borrowed.tokenizer,
            tokenizer_2=borrowed.tokenizer_2,
            unet=borrowed.unet,
            scheduler=select_inference_scheduler(
                _parameters(scheduler="euler"), borrowed, native.runtime
            ),
            add_watermarker=False,
        )
        kwargs: dict[str, Any] = {} if output_type is None else {"output_type": output_type}
        outputs.append(
            run_sdxl_pipeline(
                pipeline,
                encoded,
                width=24,
                height=16,
                steps=2,
                cfg_scale=5.0,
                generator=native.torch.Generator(device="cpu").manual_seed(42),
                torch=native.torch,
                **kwargs,
            )
        )
    assert outputs[0].images[0].size == (24, 16)
    _image(native, outputs[1])
