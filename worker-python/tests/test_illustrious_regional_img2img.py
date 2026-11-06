"""Private opaque regional img2img consumption; ROOT owns native qualification.

InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd sources consulted:
generation/core/canvas/compileCanvasGraph.ts::graftImageToImage,
app/invocations/sd/denoise_latents.py::init_scheduler and
app/invocations/vae/image_to_latents.py. The existing Studio img2img factory
adapts that training-timestep cutoff and native VAE/UNet loop. Its independent
seeded posterior and compute-dtype CPU noise are the existing ordinary Studio
adaptation, not a claim of complete numerical InvokeAI img2img parity.

Observers call original native methods. Assertions inspect actual encoding,
posterior/noise streams, consumed timesteps, regional attention and independently
reopened PNG pixels after publication. Python-built complete recipes are finite
fixtures, not proof of the separate genuine Main/trained/public boundaries.
No full model/table copies beyond the existing small-fixture preservation oracle
are introduced. Authorship permits AST/Ruff only; ROOT imports/runs/mutates.
"""

from __future__ import annotations

import copy
import dataclasses
import hashlib
import importlib
import inspect
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from functools import wraps
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import generation_artifacts, inference
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.inference_embeddings import EmbeddingConditioningInputs
from imagegen_worker.protocol import (
    GenerateIllustriousImg2ImgCommand,
    GenerateIllustriousOutpaintCommand,
    GenerateIllustriousTxt2ImgCommand,
    IllustriousInferenceParameters,
    IllustriousNoiseProfile,
)
from test_illustrious_regional_attention_adapter import (
    _assert_restored as _assert_small_restored,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_attention_adapter import (
    _bindings as _small_bindings,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_attention_adapter import (
    _context as _small_context,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_attention_adapter import (
    _hidden as _small_hidden,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_attention_adapter import (
    _plan as _small_plan,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_attention_adapter import (
    _snapshot as _small_snapshot,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_attention_adapter import (
    _transformer as _small_transformer,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_conditioning import (
    _first_attention,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_embeddings import (
    CPU_ENCODING,
    CUDA_ENCODING,
    _models,  # pyright: ignore[reportPrivateUsage]
    _no_native,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
    _same_recipe,  # pyright: ignore[reportPrivateUsage]
    _save,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _aliases,  # pyright: ignore[reportPrivateUsage]
    _quantized_bytes,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _case as _text_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _generate as _generate_text,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    LAYOUTS,
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
)

CPU = "ordinary-canvas-euler-img2img-cpu-v1"
CUDA = "ordinary-canvas-euler-img2img-cuda-fp16-v1"


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


@pytest.fixture
def output() -> Any:
    return importlib.import_module("imagegen_worker.illustrious_regional_output")


def _source(width: int, height: int, marker: int = 0) -> Image.Image:
    """Nonconstant channels and both axes make wrong-source/channel errors visible."""
    values = bytes(
        (x * (11 + c * 4) + y * (7 + c * 6) + marker * (61 + c * 13) + c * 53) % 256
        for y in range(height)
        for x in range(width)
        for c in range(3)
    )
    return Image.frombytes("RGB", (width, height), values)


def _write_source(case: Any, image: Image.Image, *, alpha: int = 255) -> None:
    rgba = image.convert("RGBA")
    rgba.putalpha(alpha)
    rgba.save(case.target, format="PNG", icc_profile=SRGB_ICC_PROFILE)
    content = case.target.read_bytes()
    case.command = dataclasses.replace(
        case.command,
        target_sha256=hashlib.sha256(content).hexdigest(),
        target_byte_size=len(content),
    )
    case.source = image.copy()


def _case(
    tmp_path: Path,
    native: Any,
    *,
    strength: float = 0.5,
    steps: int = 4,
    recipe: Any = None,
    layout: str = LAYOUTS[0],
    name: str = "image",
    marker: int = 0,
    exact_ti: bool = False,
) -> Any:
    case = _text_case(
        tmp_path,
        native,
        recipe=_recipe(_region()) if recipe is None else recipe,
        layout=layout,
        name=name,
        steps=steps,
        exact_ti=exact_ti,
    )
    case.command = GenerateIllustriousImg2ImgCommand(
        **cast(dict[str, Any], vars(case.command)),
        denoising_strength=strength,
    )
    case.command = dataclasses.replace(
        case.command, noise_profile=IllustriousNoiseProfile(False, "leading")
    )
    case.args["denoising_profile"] = CUDA if native.device == "cuda" else CPU
    _write_source(case, _source(case.command.width, case.command.height, marker))
    return case


def _parameters(case: Any) -> IllustriousInferenceParameters:
    return IllustriousInferenceParameters(
        **{
            field.name: getattr(case.command, field.name)
            for field in dataclasses.fields(IllustriousInferenceParameters)
        }
    )


def _generate(output: Any, native: Any, case: Any) -> Any:
    recipe, command = copy.deepcopy(case.recipe), copy.deepcopy(case.command)
    target = case.target.read_bytes()
    try:
        with _preserved(native):
            return output.generate_current_canvas_regional_img2img(
                case.recipe, command=case.command, **case.args
            )
    finally:
        assert case.recipe == recipe and case.command == command
        assert case.target.read_bytes() == target


def _clone(value: Any, torch: Any) -> Any:
    if type(value) is torch.Tensor:
        return value.detach().clone()
    if type(value) in (tuple, list):
        return type(value)(_clone(v, torch) for v in value)
    if type(value) is dict:
        return {key: _clone(v, torch) for key, v in cast(dict[Any, Any], value).items()}
    return value


@contextmanager
def _observe(output: Any, native: Any, monkeypatch: pytest.MonkeyPatch) -> Generator[Any]:
    """Native class delegation, including the factory's inherited img2img call."""
    torch, borrowed = native.torch, native.pipeline
    seen = SimpleNamespace(
        calls=[],
        results=[],
        entries=[],
        validations=[],
        publications=[],
        receipts=[],
        encodes=[],
        posteriors=[],
        noises=[],
        forwards=[],
        steps=[],
        decodes=[],
        attention=[],
        builds=[],
        contexts=[],
    )
    entry = native.denoising.run_current_canvas_regional_denoising
    validate = generation_artifacts.validate_generation_target
    publish = generation_artifacts.publish_generation_image
    call = native.diffusers.StableDiffusionXLImg2ImgPipeline.__call__
    encode = cast(Any, type(borrowed.vae)).encode
    decode = cast(Any, type(borrowed.vae)).decode
    forward = cast(Any, type(borrowed.unet)).forward
    step = native.diffusers.EulerDiscreteScheduler.step
    add_noise = native.diffusers.EulerDiscreteScheduler.add_noise
    processor = native.processor_type.__call__
    attention = _first_attention(native, borrowed.unet)
    original_processor = attention.processor
    distribution = importlib.import_module(
        "diffusers.models.autoencoders.vae"
    ).DiagonalGaussianDistribution
    sample = distribution.sample
    build = inference.build_sdxl_conditioning
    move = cast(Any, type(borrowed.vae)).to

    @wraps(move)
    def moved(current: Any, *args: Any, **kwargs: Any) -> Any:
        assert current is not borrowed.vae, "native IMG recast the borrowed VAE"
        return move(current, *args, **kwargs)

    @wraps(entry)
    def enter(recipe: Any, **kwargs: Any) -> Any:
        assert len(seen.validations) == 1
        assert type(kwargs["parameters"]) is IllustriousInferenceParameters
        seen.entries.append((recipe, kwargs))
        return entry(recipe, **kwargs)

    @wraps(validate)
    def validated(**kwargs: Any) -> Any:
        assert kwargs["img2img"] is True
        result = validate(**kwargs)
        assert type(result) is Image.Image and result.mode == "RGB"
        seen.validations.append((kwargs, result))
        return result

    @wraps(publish)
    def published(image: Any, **kwargs: Any) -> Any:
        assert image.mode == "RGB" and kwargs["output_mode"] == "RGB"
        seen.publications.append((image.tobytes(), kwargs))
        result = publish(image, **kwargs)
        seen.receipts.append(result)
        return result

    @wraps(call)
    def called(current: Any, *args: Any, **kwargs: Any) -> Any:
        assert current is not borrowed
        assert current.vae is borrowed.vae and current.unet is borrowed.unet
        assert current.scheduler is not borrowed.scheduler
        seen.calls.append((current, _clone(kwargs, torch)))
        result = call(current, *args, **kwargs)
        seen.results.append((result, result.images.detach().clone()))
        return result

    @wraps(encode)
    def encoded(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is borrowed.vae:
            assert id(current) in native.recipe._RESERVATIONS
            seen.encodes.append(args[0].detach().clone())
        return encode(current, *args, **kwargs)

    @wraps(sample)
    def sampled(current: Any, *args: Any, **kwargs: Any) -> Any:
        bound = inspect.signature(sample).bind(current, *args, **kwargs)
        generator = bound.arguments.get("generator")
        before = generator.get_state().clone() if generator is not None else None
        result = sample(current, *args, **kwargs)
        seen.posteriors.append(
            (
                current.mean.detach().clone(),
                current.std.detach().clone(),
                result.detach().clone(),
                generator,
                before,
            )
        )
        return result

    @wraps(add_noise)
    def noised(current: Any, *args: Any, **kwargs: Any) -> Any:
        result = add_noise(current, *args, **kwargs)
        bound = inspect.signature(add_noise).bind(current, *args, **kwargs)
        seen.noises.append((_clone(dict(bound.arguments), torch), result.detach().clone()))
        return result

    @wraps(forward)
    def forwarded(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is borrowed.unet:
            bound = inspect.signature(forward).bind(current, *args, **kwargs)
            seen.forwards.append(_clone(dict(bound.arguments), torch))
        return forward(current, *args, **kwargs)

    @wraps(step)
    def stepped(current: Any, *args: Any, **kwargs: Any) -> Any:
        bound = inspect.signature(step).bind(current, *args, **kwargs)
        seen.steps.append(_clone(dict(bound.arguments), torch))
        return step(current, *args, **kwargs)

    @wraps(decode)
    def decoded(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is borrowed.vae:
            assert id(current) in native.recipe._RESERVATIONS
            seen.decodes.append(args[0].detach().clone())
        return decode(current, *args, **kwargs)

    @wraps(processor)
    def attended(current: Any, attn: Any, *args: Any, **kwargs: Any) -> Any:
        if attn is attention:
            assert current is original_processor
            seen.attention.append(_clone(kwargs.get("attention_mask"), torch))
            seen.contexts.append(kwargs["encoder_hidden_states"].detach().clone())
        return processor(current, attn, *args, **kwargs)

    @wraps(build)
    def built(parameters: Any, *args: Any, **kwargs: Any) -> Any:
        seen.builds.append((parameters.positive_prompt, parameters.negative_prompt))
        return build(parameters, *args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(native.diffusers.StableDiffusionXLImg2ImgPipeline, "__call__", called)
        patch.setattr(cast(Any, type(borrowed.vae)), "encode", encoded)
        patch.setattr(cast(Any, type(borrowed.vae)), "decode", decoded)
        patch.setattr(cast(Any, type(borrowed.vae)), "to", moved)
        patch.setattr(cast(Any, type(borrowed.unet)), "forward", forwarded)
        patch.setattr(native.diffusers.EulerDiscreteScheduler, "step", stepped)
        patch.setattr(native.diffusers.EulerDiscreteScheduler, "add_noise", noised)
        patch.setattr(distribution, "sample", sampled)
        patch.setattr(native.processor_type, "__call__", attended)
        with (
            _aliases(patch, entry, enter),
            _aliases(patch, validate, validated),
            _aliases(patch, publish, published),
            _aliases(patch, build, built),
        ):
            yield seen


def _png(native: Any, case: Any, seen: Any, done: Any) -> bytes:
    assert len(seen.calls) == len(seen.results) == len(seen.entries) == 1
    assert len(seen.publications) == len(seen.receipts) == 1 and done is seen.receipts[0]
    result, prior = seen.results[0]
    assert native.torch.equal(result.images, prior)
    expected = _quantized_bytes(native, prior)
    with Image.open(case.command.output_path) as reopened:
        reopened.load()
        assert reopened.format == "PNG" and reopened.mode == "RGB"
        assert reopened.size == case.source.size
        assert reopened.info["icc_profile"] == SRGB_ICC_PROFILE
        assert reopened.tobytes() == expected
    assert done["type"] == "generation-done"
    assert done["requestId"] == case.command.request_id
    assert done["outputPath"] == str(case.command.output_path)
    assert done["seed"] == case.command.seed
    assert seen.publications[0][0] == expected
    assert not list(case.root.glob(".*.tmp"))
    return expected


def _assert_source_and_schedule(native: Any, case: Any, seen: Any) -> None:
    """Independent literal training grid, RGB normalization and two random draws."""
    torch = native.torch
    numpy = pytest.importorskip("numpy")
    command = case.command
    assert len(seen.encodes) == len(seen.posteriors) == len(seen.decodes) == 1
    # Association is assessed after the real publication, so an otherwise valid
    # wrong-source mutation must traverse VAE/attention/decode before turning RED.
    assert seen.entries[0][1]["image"] is seen.validations[0][1]
    assert seen.validations[0][1].tobytes() == case.source.tobytes()
    assert seen.entries[0][1]["image"].tobytes() == case.source.tobytes()
    assert seen.calls[0][1]["image"] is seen.entries[0][1]["image"]
    array = numpy.asarray(case.source).astype(numpy.float32) / numpy.float32(255)
    normalized = torch.from_numpy(array).permute(2, 0, 1).unsqueeze(0) * 2.0 - 1.0
    expected_image = normalized.to(device=native.pipeline.vae.device, dtype=native.dtype)
    assert torch.equal(seen.encodes[0], expected_image), "VAE consumed different source pixels"
    full = [1 + index * (1000 // command.steps) for index in reversed(range(command.steps))]
    cutoff = round(1000 * command.denoising_strength)
    selected = [timestep for timestep in full if timestep < cutoff]
    pipeline, options = seen.calls[0]
    assert pipeline.num_timesteps == len(selected)
    assert len(seen.forwards) == len(seen.steps) == len(seen.attention) == len(selected)
    assert [float(item["timestep"].item()) for item in seen.forwards] == selected
    assert [float(item["timestep"].item()) for item in seen.steps] == selected
    assert options["strength"] == command.denoising_strength
    assert options["num_inference_steps"] == command.steps
    assert options["output_type"] == "pt" and options["guidance_rescale"] == 0
    assert "height" not in options and "width" not in options
    assert len(seen.builds) == 1 + len(case.recipe["regions"])
    mean, std, posterior, posterior_generator, state = seen.posteriors[0]
    noise_generator = options["generator"]
    assert posterior_generator is not noise_generator
    initial = torch.Generator(device="cpu").manual_seed(command.seed)
    assert posterior_generator.device.type == noise_generator.device.type == "cpu"
    assert torch.equal(state, initial.get_state())
    posterior_noise = torch.randn(mean.shape, generator=initial, dtype=mean.dtype).to(mean.device)
    assert torch.equal(posterior, mean + std * posterior_noise)
    if not selected:
        assert not seen.noises and not seen.attention
        assert torch.equal(noise_generator.get_state(), state)
        scale = native.pipeline.vae.config.scaling_factor
        assert torch.equal(seen.decodes[0], (posterior * scale) / scale)
        return
    assert len(seen.noises) == 1
    arguments, noised = seen.noises[0]
    assert arguments["self"] is pipeline.scheduler
    assert torch.equal(
        arguments["original_samples"], posterior * native.pipeline.vae.config.scaling_factor
    )
    assert arguments["timesteps"].tolist() == selected[:1]
    untouched = torch.Generator(device="cpu").manual_seed(command.seed)
    expected_noise = torch.randn(arguments["noise"].shape, generator=untouched, dtype=native.dtype)
    assert torch.equal(arguments["noise"], expected_noise.to(native.pipeline.vae.device))
    assert torch.equal(noise_generator.get_state(), untouched.get_state())
    first = seen.forwards[0]["sample"]
    sigma = pipeline.scheduler.sigmas[len(full) - len(selected)]
    expected_first = noised / (sigma**2 + 1) ** 0.5
    batch = 2 if case.args["layout"] == LAYOUTS[0] else 1
    assert torch.equal(first, expected_first.repeat(batch, 1, 1, 1))
    if case.recipe["regions"]:
        assert all(mask is not None for mask in seen.attention)
    else:
        assert all(mask is None for mask in seen.attention)


STRENGTHS = (0.0, 0.0001, 0.2, 0.5, 0.75, 1.0)


@pytest.mark.parametrize("strength", STRENGTHS)
def test_opaque_snapshot_reaches_original_vae_cutoff_attention_and_published_rgb(
    tmp_path: Path,
    lane: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    strength: float,
) -> None:
    case = _case(tmp_path, lane, strength=strength)
    progress: list[tuple[int, int]] = []

    def progress_sink(completed: int, total: int) -> None:
        progress.append((completed, total))

    case.args["on_progress"] = progress_sink
    with _observe(output, lane, monkeypatch) as seen:
        done = _generate(output, lane, case)
    pixels = _png(lane, case, seen, done)
    _assert_source_and_schedule(lane, case, seen)
    total = len(seen.steps)
    assert progress == [(index + 1, total) for index in range(total)]
    if strength == 0:
        assert pixels != case.source.tobytes(), (
            "strength0 promises VAE roundtrip, not source identity"
        )


def test_img2img_training_cutoff_timeline_mutation_red(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path, lane, strength=0.5, steps=30)
    with _observe(output, lane, monkeypatch) as seen:
        done = _generate(output, lane, case)
    _png(lane, case, seen, done)
    _assert_source_and_schedule(lane, case, seen)
    assert len(seen.steps) == 16
    assert [float(item["timestep"].item()) for item in seen.steps] == list(range(496, 0, -33))


def _ordinary(native: Any, case: Any) -> Any:
    """Separate public ordinary factory and conditioning; no regional owners."""
    parameters = _parameters(case)
    borrowed = native.pipeline
    pipeline = inference.img2img_pipeline_class(native.diffusers, native.torch)(
        vae=borrowed.vae,
        text_encoder=borrowed.text_encoder,
        text_encoder_2=borrowed.text_encoder_2,
        tokenizer=borrowed.tokenizer,
        tokenizer_2=borrowed.tokenizer_2,
        unet=borrowed.unet,
        scheduler=inference.select_inference_scheduler(parameters, borrowed, native.runtime),
        add_watermarker=False,
    )
    pipeline.set_progress_bar_config(disable=True)
    conditioning = inference.build_sdxl_conditioning(
        parameters,
        borrowed,
        native.runtime,
        embedding_inputs=EmbeddingConditioningInputs(
            (parameters.positive_prompt, parameters.negative_prompt), (None, None)
        ),
    )
    return inference.run_sdxl_pipeline(
        pipeline,
        conditioning,
        width=case.command.width,
        height=case.command.height,
        steps=parameters.steps,
        cfg_scale=parameters.cfg_scale,
        generator=native.torch.Generator(device="cpu").manual_seed(parameters.seed),
        torch=native.torch,
        image=case.source,
        denoising_strength=case.command.denoising_strength,
        output_type="pt",
    )


@pytest.mark.parametrize("strength", (0.0, 0.5, 1.0))
def test_zero_region_matches_original_ordinary_img2img_pt_and_all_rgb(
    tmp_path: Path,
    lane: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    strength: float,
) -> None:
    case = _case(tmp_path, lane, recipe=_recipe(), strength=strength)
    with _preserved(lane):
        ordinary = _ordinary(lane, case)
    with _observe(output, lane, monkeypatch) as seen:
        done = _generate(output, lane, case)
    pixels = _png(lane, case, seen, done)
    _assert_source_and_schedule(lane, case, seen)
    assert lane.torch.equal(seen.results[0][1], ordinary.images)
    assert pixels == _quantized_bytes(lane, ordinary.images)


def test_img2img_verified_source_association_mutation_red(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = _case(tmp_path, lane, name="first", marker=0)
    neighbor = _case(tmp_path, lane, name="neighbor", marker=1)
    with _observe(output, lane, monkeypatch) as a:
        done = _generate(output, lane, first)
    a_pixels = _png(lane, first, a, done)
    _assert_source_and_schedule(lane, first, a)
    with _observe(output, lane, monkeypatch) as b:
        done = _generate(output, lane, neighbor)
    b_pixels = _png(lane, neighbor, b, done)
    _assert_source_and_schedule(lane, neighbor, b)
    assert not lane.torch.equal(a.posteriors[0][2], b.posteriors[0][2])
    assert not lane.torch.equal(a.forwards[0]["sample"], b.forwards[0]["sample"])
    assert a_pixels != b_pixels
    assert all(lane.torch.equal(x, y) for x, y in zip(a.contexts, b.contexts, strict=True))
    repeat = _case(tmp_path, lane, name="repeat", marker=0)
    with _observe(output, lane, monkeypatch) as c:
        done = _generate(output, lane, repeat)
    assert _png(lane, repeat, c, done) == a_pixels
    assert lane.torch.equal(c.results[0][1], a.results[0][1])


def test_fixed_source_retains_region_text_causality_and_exact_ti_consumption(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    a, b = _save(tmp_path, lane, 1), _save(tmp_path, lane, 3)
    cases = [
        _case(
            tmp_path,
            lane,
            recipe=_same_recipe(a, resource),
            exact_ti=True,
            name=f"resource-{index}",
        )
        for index, resource in enumerate((a, b))
    ]
    observations, pixels = cast(list[Any], []), cast(list[bytes], [])
    for case in cases:
        case.args["profile"] = CUDA_ENCODING if lane.device == "cuda" else CPU_ENCODING
        with _observe(output, lane, monkeypatch) as seen:
            done = _generate(output, lane, case)
        pixels.append(_png(lane, case, seen, done))
        _assert_source_and_schedule(lane, case, seen)
        observations.append(seen)
    assert lane.torch.equal(observations[0].posteriors[0][2], observations[1].posteriors[0][2])
    assert lane.torch.equal(
        observations[0].forwards[0]["sample"], observations[1].forwards[0]["sample"]
    )
    assert not lane.torch.equal(observations[0].contexts[0], observations[1].contexts[0])
    assert pixels[0] != pixels[1]


def test_private_txt2img_neighbor_control_green(tmp_path: Path, lane: Any, output: Any) -> None:
    """Existing TXT owner is the unaffected control for IMG-only mutations."""
    case = _text_case(tmp_path, lane, recipe=_recipe())
    first = _generate_text(output, lane, case)
    assert first["outputPath"] == str(case.command.output_path)
    with Image.open(case.command.output_path) as reopened:
        reopened.load()
        assert reopened.mode == "RGB" and reopened.size == (24, 16)
        assert reopened.info["icc_profile"] == SRGB_ICC_PROFILE


INVALID_STRENGTHS = (
    pytest.param(None, id="none"),
    pytest.param(False, id="false"),
    pytest.param(True, id="true"),
    pytest.param(-0.01, id="negative"),
    pytest.param(1.0001, id="above-one"),
    pytest.param(float("nan"), id="nan"),
    pytest.param(float("inf"), id="infinity"),
    pytest.param("0.5", id="string"),
)


@pytest.mark.parametrize("boundary", ("runner", "output"))
@pytest.mark.parametrize("strength", INVALID_STRENGTHS)
def test_invalid_strength_refuses_before_snapshot_or_native_work(
    tmp_path: Path,
    cpu: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    boundary: str,
    strength: Any,
) -> None:
    case = _case(tmp_path, cpu)
    case.command = dataclasses.replace(case.command, denoising_strength=strength)
    accesses: list[str] = []

    def forbidden(**_kwargs: Any) -> Any:
        accesses.append("snapshot")
        raise AssertionError("invalid strength reached target snapshot")

    with (
        monkeypatch.context() as patch,
        _no_native(cpu, patch),
        _aliases(patch, generation_artifacts.validate_generation_target, forbidden),
        pytest.raises(
            (output.IllustriousRegionalOutputError, cpu.denoising.IllustriousRegionalDenoisingError)
        ) as caught,
    ):
        if boundary == "output":
            _generate(output, cpu, case)
        else:
            cpu.denoising.run_current_canvas_regional_denoising(
                case.recipe,
                parameters=_parameters(case),
                image=case.source,
                denoising_strength=strength,
                **case.args,
            )
    assert caught.value.code == "INPUT_INVALID"
    assert accesses == [] and not case.command.output_path.exists()


@pytest.mark.parametrize(
    "invalid", ("txt", "outpaint", "subclass", "extra", "seed", "bbox", "text")
)
def test_exact_img_command_and_recipe_agreement_precede_snapshot(
    tmp_path: Path,
    cpu: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    invalid: str,
) -> None:
    case = _case(tmp_path, cpu)
    values = dict(cast(dict[str, Any], vars(case.command)))
    if invalid == "txt":
        values.pop("denoising_strength")
        case.command = GenerateIllustriousTxt2ImgCommand(**values)
    elif invalid == "outpaint":
        case.command = GenerateIllustriousOutpaintCommand(
            **values, conditioning=cast(Any, None), infill_resource=cast(Any, None)
        )
    elif invalid == "subclass":

        class Child(GenerateIllustriousImg2ImgCommand):
            pass

        case.command = Child(**values)
    elif invalid == "extra":
        object.__setattr__(case.command, "surprise", 1)
    elif invalid == "seed":
        case.command = dataclasses.replace(case.command, seed=43)
    elif invalid == "bbox":
        case.command = dataclasses.replace(case.command, bbox={**case.command.bbox, "x": 99})
    else:
        case.command = dataclasses.replace(case.command, positive_prompt="other")
    accesses: list[str] = []

    def forbidden(**_kwargs: Any) -> Any:
        accesses.append("snapshot")
        raise AssertionError("invalid command reached target snapshot")

    with (
        monkeypatch.context() as patch,
        _no_native(cpu, patch),
        _aliases(patch, generation_artifacts.validate_generation_target, forbidden),
        pytest.raises(
            (
                output.IllustriousRegionalOutputError,
                cpu.recipe.IllustriousRegionalRecipeError,
                cpu.denoising.IllustriousRegionalDenoisingError,
            )
        ),
    ):
        _generate(output, cpu, case)
    assert accesses == [] and not case.command.output_path.exists()


@pytest.mark.parametrize(
    "invalid", ("transparent", "partial", "digest", "size", "dimensions", "icc", "rgb")
)
def test_opaque_hash_checked_target_is_required_before_encoding(
    tmp_path: Path,
    cpu: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    invalid: str,
) -> None:
    case = _case(tmp_path, cpu)
    if invalid in ("transparent", "partial"):
        _write_source(case, case.source, alpha=0 if invalid == "transparent" else 127)
    elif invalid == "digest":
        case.command = dataclasses.replace(case.command, target_sha256="0" * 64)
    elif invalid == "size":
        case.command = dataclasses.replace(
            case.command, target_byte_size=case.command.target_byte_size + 1
        )
    else:
        image = case.source.convert("RGBA")
        if invalid == "dimensions":
            image = image.resize((16, 16))
        if invalid == "rgb":
            image = image.convert("RGB")
        image.save(
            case.target,
            format="PNG",
            **({"icc_profile": SRGB_ICC_PROFILE} if invalid != "icc" else {}),
        )
        content = case.target.read_bytes()
        case.command = dataclasses.replace(
            case.command,
            target_byte_size=len(content),
            target_sha256=hashlib.sha256(content).hexdigest(),
        )
    with monkeypatch.context() as patch, _no_native(cpu, patch), pytest.raises(DerivativeError):
        _generate(output, cpu, case)
    assert not case.command.output_path.exists()


@pytest.mark.parametrize(
    "invalid",
    ("missing-image", "missing-strength", "rgba", "dimensions", "txt-profile", "crossed-lane"),
)
def test_runner_requires_explicit_paired_image_profile_before_native_work(
    tmp_path: Path,
    cpu: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    invalid: str,
) -> None:
    case = _case(tmp_path, cpu)
    args = {
        **case.args,
        "parameters": _parameters(case),
        "image": case.source,
        "denoising_strength": 0.5,
    }
    if invalid == "missing-image":
        args.pop("image")
    elif invalid == "missing-strength":
        args.pop("denoising_strength")
    elif invalid == "rgba":
        args["image"] = case.source.convert("RGBA")
    elif invalid == "dimensions":
        args["image"] = case.source.resize((16, 16))
    elif invalid == "txt-profile":
        args["denoising_profile"] = "ordinary-canvas-euler-txt2img-cpu-v2"
    else:
        args["denoising_profile"] = CUDA
    with (
        monkeypatch.context() as patch,
        _no_native(cpu, patch),
        pytest.raises(cpu.denoising.IllustriousRegionalDenoisingError),
    ):
        cpu.denoising.run_current_canvas_regional_denoising(case.recipe, **args)


@pytest.mark.parametrize("failure", ("encode", "later-unet", "decode", "publication"))
def test_native_img_failure_restores_and_exact_fresh_request_recovers(
    tmp_path: Path,
    lane: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    failure: str,
) -> None:
    case = _case(tmp_path, lane, strength=1.0)
    sentinel = RuntimeError(f"img2img-{failure}")
    calls: list[str] = []
    module = cast(
        Any, type(lane.pipeline.unet) if failure == "later-unet" else type(lane.pipeline.vae)
    )
    name = "forward" if failure == "later-unet" else "encode" if failure == "encode" else "decode"
    original = getattr(module, name)

    @wraps(original)
    def fail_native(current: Any, *args: Any, **kwargs: Any) -> Any:
        selected = current is (lane.pipeline.unet if failure == "later-unet" else lane.pipeline.vae)
        if selected:
            calls.append(name)
            if failure != "later-unet" or len(calls) == 3:
                raise sentinel
        return original(current, *args, **kwargs)

    def fail_publish(*_args: Any, **_kwargs: Any) -> Any:
        calls.append("publication")
        raise sentinel

    with monkeypatch.context() as patch:
        if failure == "publication":
            with (
                _aliases(patch, generation_artifacts.publish_generation_image, fail_publish),
                _preserved(lane),
                pytest.raises(RuntimeError) as caught,
            ):
                _generate(output, lane, case)
        else:
            patch.setattr(module, name, fail_native)
            with _preserved(lane), pytest.raises(RuntimeError) as caught:
                _generate(output, lane, case)
        assert caught.value is sentinel
    assert len(calls) == (3 if failure == "later-unet" else 1)
    assert not case.command.output_path.exists()
    assert not list(case.root.glob(".*.tmp"))
    with _observe(output, lane, monkeypatch) as recovered:
        done = _generate(output, lane, case)
    _png(lane, case, recovered, done)
    _assert_source_and_schedule(lane, case, recovered)


def test_existing_output_is_preserved_before_img_native_work(
    tmp_path: Path, cpu: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path, cpu)
    case.command.output_path.write_bytes(b"existing independent owner")
    with monkeypatch.context() as patch, _no_native(cpu, patch), pytest.raises(DerivativeError):
        _generate(output, cpu, case)
    assert case.command.output_path.read_bytes() == b"existing independent owner"


def test_img_requires_exact_false_upcast_before_native_work(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path, lane)
    prior = lane.pipeline.vae.config.force_upcast
    lane.pipeline.vae.register_to_config(force_upcast=True)
    try:
        with (
            monkeypatch.context() as patch,
            _no_native(lane, patch),
            pytest.raises(lane.denoising.IllustriousRegionalDenoisingError) as caught,
        ):
            _generate(output, lane, case)
        assert caught.value.code == "PROFILE_INVALID"
    finally:
        lane.pipeline.vae.register_to_config(force_upcast=prior)


@pytest.mark.parametrize("attestation", ("default", "false", "zero", "one", "none", "true"))
def test_only_exact_true_private_attestation_admits_unused_fully_validated_scope(
    cpu: Any, attestation: str
) -> None:
    model = _small_transformer(cpu)
    baseline = _small_snapshot(model)
    values: dict[str, Any] = {"false": False, "zero": 0, "one": 1, "none": None, "true": True}
    kwargs: dict[str, Any] = {
        "bindings": _small_bindings(cpu, model),
        "plan": _small_plan(),
    }
    if attestation != "default":
        kwargs["_allow_empty"] = lambda: values[attestation]
    if attestation == "true":
        with cpu.adapter.scoped_illustrious_regional_attention(model, **kwargs):
            pass
    else:
        with (
            pytest.raises(cpu.adapter.IllustriousRegionalAdapterError) as caught,
            cpu.adapter.scoped_illustrious_regional_attention(model, **kwargs),
        ):
            pass
        assert caught.value.code == "INPUT_INVALID"
    _assert_small_restored(model, baseline)
    # A fresh ordinary scope with actual original attention remains valid.
    with cpu.adapter.scoped_illustrious_regional_attention(
        model, bindings=_small_bindings(cpu, model), plan=_small_plan()
    ):
        result = model(_small_hidden(cpu), encoder_hidden_states=_small_context(cpu))
    assert cpu.torch.isfinite(result.sample).all()
    _assert_small_restored(model, baseline)


def test_nonzero_native_schedule_cannot_return_without_attention_and_recovers(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path, lane, strength=1.0)
    original = lane.denoising.run_sdxl_pipeline
    calls: list[int] = []

    @wraps(original)
    def missing_forward(pipeline: Any, *args: Any, **kwargs: Any) -> Any:
        # Keep a real VAE encode/decode result, then inject the inconsistent
        # positive schedule count that the late consumption guard must reject.
        kwargs["denoising_strength"] = 0.0
        result = original(pipeline, *args, **kwargs)
        assert pipeline.num_timesteps == 0
        pipeline._num_timesteps = 1
        calls.append(1)
        return result

    with monkeypatch.context() as patch:
        patch.setattr(lane.denoising, "run_sdxl_pipeline", missing_forward)
        with pytest.raises(
            (
                lane.denoising.IllustriousRegionalDenoisingError,
                lane.adapter.IllustriousRegionalAdapterError,
            )
        ) as caught:
            _generate(output, lane, case)
    assert caught.value.code == "INPUT_INVALID" and calls == [1]
    assert not case.command.output_path.exists()
    with _observe(output, lane, monkeypatch) as seen:
        done = _generate(output, lane, case)
    _png(lane, case, seen, done)
    _assert_source_and_schedule(lane, case, seen)


@pytest.mark.parametrize("strength", (0.0, 0.5))
def test_stateful_native_vae_encoder_refuses_before_encode_and_recovers(
    tmp_path: Path,
    lane: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    strength: float,
) -> None:
    case = _case(tmp_path, lane, strength=strength)
    vae, torch = lane.pipeline.vae, lane.torch
    original = vae.encoder.conv_norm_out
    norm = (
        torch.nn.InstanceNorm2d(original.num_channels, track_running_stats=True, momentum=1.0)
        .to(device=vae.device, dtype=vae.dtype)
        .eval()
    )
    # This native state updates existing buffers despite eval. Setup precedes
    # borrowing; the old broad native-module admission incorrectly accepted it.
    norm.track_running_stats = False
    calls: list[str] = []

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        calls.append("encode")
        raise AssertionError("Stateful VAE reached encoding")

    with monkeypatch.context() as patch:
        patch.setattr(vae.encoder, "conv_norm_out", norm)
        patch.setattr(cast(Any, type(vae)), "encode", forbidden)
        with pytest.raises(lane.denoising.IllustriousRegionalDenoisingError) as caught:
            _generate(output, lane, case)
        assert caught.value.code == "PROFILE_INVALID"
        assert "qualified native VAE module classes" in str(caught.value)
    assert calls == [] and not case.command.output_path.exists()
    assert vae.encoder.conv_norm_out is original
    with _observe(output, lane, monkeypatch) as recovered:
        done = _generate(output, lane, case)
    _png(lane, case, recovered, done)
    _assert_source_and_schedule(lane, case, recovered)
