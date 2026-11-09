"""Finite source-conditioned V contracts; ROOT alone imports/runs/mutates.

InvokeAI b0ac163b139c432aff4c51078c31c074bf292f72 sources read directly:
sd/denoise_latents.py get_scheduler/init_scheduler; Canvas compileCanvasGraph.ts
graftImageToImage/graftOutpaint; vae/image_to_latents.py and InpaintExt. Objective
selection is independent from source encoding, strength cutoff and keep-mask
restoration. These tests adapt the already qualified Studio owners, without a
second diffusion loop, production conversion formula or replacement native result.

Small Python fixtures do not establish genuine Main origin or trained quality.
The OUT fixture explicitly replaces only the expensive LaMa input collaborator;
source preparation, masks, native sampling, contribution and PNG remain real.
Both named V/EPS selectors publish first, then assess every actual native
transition. A valid post-admission wrong-EPS mutation must be semantic RED.
"""

from __future__ import annotations

import copy
import importlib
import inspect
from collections.abc import Generator, Iterator
from contextlib import contextmanager, nullcontext
from dataclasses import replace
from functools import wraps
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image, ImageOps

from imagegen_worker import generation_artifacts, inference, sdxl_outpaint
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.inference_embeddings import EmbeddingConditioningInputs
from imagegen_worker.outpaint_conditioning import prepare_outpaint_conditioning
from test_illustrious_regional_cfg_rescale import (
    _invoke_oracle,  # pyright: ignore[reportPrivateUsage]
    _observe_cfg,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_dpmpp_2m import CPU_ENCODING, CUDA_ENCODING
from test_illustrious_regional_embeddings import (
    _models,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
    _with_resources,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _case as _image_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _clone,  # pyright: ignore[reportPrivateUsage]
    _parameters,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _generate as _generate_image,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img_vae import (
    _case as _prepared_image_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_outpaint import (
    _case as _outpaint_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_outpaint import (
    _generate as _generate_outpaint,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_outpaint import (
    _infill_collaborator,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _aliases,  # pyright: ignore[reportPrivateUsage]
    _before_filework,  # pyright: ignore[reportPrivateUsage]
    _quantized_bytes,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    _parameters as _base_parameters,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_sampling import (
    POLICIES,
    _literal_grid,  # pyright: ignore[reportPrivateUsage]
    _literal_training,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_v_prediction import (
    _noise,  # pyright: ignore[reportPrivateUsage]
)

MODES = ("img2img", "outpaint")


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


def _case(
    tmp_path: Path,
    native: Any,
    mode: str,
    *,
    epsilon: bool = False,
    strength: float = 0.75,
    rescale: bool = False,
    spacing: str = "leading",
    prepared: bool = False,
    precision: str = "FP32",
    zero: bool = False,
) -> Any:
    if mode == "outpaint":
        case = _outpaint_case(
            tmp_path, native, strength=strength, prepared=prepared, precision=precision
        )
    elif prepared:
        case = _prepared_image_case(tmp_path, native, strength=strength, precision=precision)
    else:
        case = _image_case(
            tmp_path,
            native,
            strength=strength,
            recipe=_with_resources(_recipe(_region())),
        )
    if zero:
        # Authored no-region Python fixture; never a transported Main recipe rewrite.
        recipe = _with_resources(_recipe())
        recipe["bbox"] = copy.deepcopy(case.recipe["bbox"])
        case.recipe = recipe
    case.mode, case.prepared = mode, prepared
    case.command = replace(
        case.command,
        prediction_type="epsilon" if epsilon else "v_prediction",
        noise_profile=_noise(rescale, spacing),
        cfg_rescale=0.7,
        steps=4,
    )
    case.args["profile"] = CUDA_ENCODING if native.device == "cuda" else CPU_ENCODING
    suffix = "cuda-vae" if prepared else "cuda-fp16" if native.device == "cuda" else "cpu"
    objective = "" if epsilon else "-v-prediction"
    case.args["denoising_profile"] = f"ordinary-canvas-euler{objective}-{mode}-{suffix}-v1"
    return case


def _generate(output: Any, native: Any, case: Any, monkeypatch: pytest.MonkeyPatch) -> Any:
    if case.mode == "outpaint":
        with _infill_collaborator(case, monkeypatch):
            return _generate_outpaint(output, native, case)
    return _generate_image(output, native, case)


@contextmanager
def _observe(output: Any, native: Any, monkeypatch: pytest.MonkeyPatch) -> Generator[Any]:
    """Class delegates retain original native results and exact consumption inputs."""
    torch, borrowed = native.torch, native.pipeline
    seen = SimpleNamespace(
        calls=[],
        encodes=[],
        posteriors=[],
        noises=[],
        forwards=[],
        decodes=[],
        results=[],
        publications=[],
        receipts=[],
        merges=[],
        steps=[],
        events=[],
    )
    call = native.diffusers.StableDiffusionXLImg2ImgPipeline.__call__
    encode = cast(Any, type(borrowed.vae)).encode
    decode = cast(Any, type(borrowed.vae)).decode
    forward = cast(Any, type(borrowed.unet)).forward
    add_noise = native.diffusers.EulerDiscreteScheduler.add_noise
    distribution = importlib.import_module(
        "diffusers.models.autoencoders.vae"
    ).DiagonalGaussianDistribution
    sample = distribution.sample
    entry = output.run_current_canvas_regional_denoising
    publish = generation_artifacts.publish_generation_image
    merge = sdxl_outpaint._OutpaintState.step  # pyright: ignore[reportPrivateUsage]

    @wraps(call)
    def called(current: Any, *args: Any, **kwargs: Any) -> Any:
        seen.calls.append((current, _clone(kwargs, torch)))
        return call(current, *args, **kwargs)

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
        state = None if generator is None else generator.get_state().clone()
        result = sample(current, *args, **kwargs)
        seen.posteriors.append(
            (
                current.mean.detach().clone(),
                current.std.detach().clone(),
                result.detach().clone(),
                generator,
                state,
            )
        )
        return result

    @wraps(add_noise)
    def noised(current: Any, *args: Any, **kwargs: Any) -> Any:
        bound = inspect.signature(add_noise).bind(current, *args, **kwargs)
        result = add_noise(current, *args, **kwargs)
        seen.noises.append((_clone(dict(bound.arguments), torch), result.detach().clone()))
        return result

    @wraps(forward)
    def forwarded(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is borrowed.unet:
            bound = inspect.signature(forward).bind(current, *args, **kwargs)
            seen.forwards.append(_clone(dict(bound.arguments), torch))
        return forward(current, *args, **kwargs)

    @wraps(decode)
    def decoded(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is borrowed.vae:
            assert id(current) in native.recipe._RESERVATIONS
            seen.decodes.append(args[0].detach().clone())
        return decode(current, *args, **kwargs)

    @wraps(entry)
    def returned(*args: Any, **kwargs: Any) -> Any:
        result = entry(*args, **kwargs)
        seen.results.append((result, result.images.detach().clone()))
        return result

    @wraps(publish)
    def published(image: Image.Image, **kwargs: Any) -> Any:
        seen.publications.append((image.copy(), kwargs))
        result = publish(image, **kwargs)
        seen.receipts.append(result)
        return result

    @wraps(merge)
    def merged(state: Any, current: Any, index: int, timestep: Any, payload: Any) -> Any:
        before = payload["latents"].detach().clone()
        result = merge(state, current, index, timestep, payload)
        seen.merges.append(
            SimpleNamespace(
                before=before,
                after=result["latents"].detach().clone(),
                original=state.original.detach().clone(),
                noise=state.noise.detach().clone(),
                generate=state.generate_mask.detach().clone(),
            )
        )
        return result

    with monkeypatch.context() as patch:
        patch.setattr(native.diffusers.StableDiffusionXLImg2ImgPipeline, "__call__", called)
        patch.setattr(cast(Any, type(borrowed.vae)), "encode", encoded)
        patch.setattr(cast(Any, type(borrowed.vae)), "decode", decoded)
        patch.setattr(cast(Any, type(borrowed.unet)), "forward", forwarded)
        patch.setattr(distribution, "sample", sampled)
        patch.setattr(native.diffusers.EulerDiscreteScheduler, "add_noise", noised)
        patch.setattr(sdxl_outpaint._OutpaintState, "step", merged)  # pyright: ignore[reportPrivateUsage]
        with (
            _aliases(patch, entry, returned),
            _aliases(patch, publish, published),
            _observe_cfg(native, seen, monkeypatch),
        ):
            yield seen


def _published(native: Any, case: Any, seen: Any, receipt: Any) -> bytes:
    assert len(seen.results) == len(seen.publications) == len(seen.receipts) == 1
    assert receipt is seen.receipts[0]
    result, pixels = seen.results[0]
    assert native.torch.equal(result.images, pixels)
    rgb = Image.frombytes(
        "RGB", (case.command.width, case.command.height), _quantized_bytes(native, pixels)
    )
    expected = rgb
    if case.mode == "outpaint":
        masks = prepare_outpaint_conditioning(
            case.original, coherence_edge_radius=16, minimum_denoise=0, output_fade_radius=16
        )
        expected = rgb.convert("RGBA")
        expected.putalpha(ImageOps.invert(masks.output_keep_mask))
        assert expected.getchannel("A").getextrema() == (0, 255)
    with Image.open(case.command.output_path) as reopened:
        reopened.load()
        assert reopened.format == "PNG" and reopened.mode == expected.mode
        assert reopened.size == expected.size and reopened.info["icc_profile"] == SRGB_ICC_PROFILE
        assert reopened.tobytes() == expected.tobytes()
    assert seen.publications[0][0].tobytes() == expected.tobytes()
    assert seen.publications[0][1]["output_mode"] == expected.mode
    assert receipt["type"] == "generation-done"
    assert receipt["requestId"] == case.command.request_id
    assert receipt["outputPath"] == str(case.command.output_path)
    assert receipt["seed"] == case.command.seed
    assert not list(case.root.glob(".*.tmp"))
    return expected.tobytes()


def _reference(native: Any, case: Any, objective: str) -> Any:
    policy = case.command.noise_profile
    return native.diffusers.EulerDiscreteScheduler(
        num_train_timesteps=1000,
        beta_start=0.00085,
        beta_end=0.012,
        beta_schedule="scaled_linear",
        trained_betas=None,
        steps_offset=1,
        prediction_type=objective,
        timestep_spacing=policy.timestep_spacing,
        rescale_betas_zero_snr=policy.rescale_betas_zero_snr,
    )


def _assert_consumed(native: Any, case: Any, seen: Any) -> None:
    """Assess original source and transition values only after actual publication."""
    torch, np, command = native.torch, pytest.importorskip("numpy"), case.command
    assert len(seen.calls) == len(seen.encodes) == len(seen.posteriors) == len(seen.decodes) == 1
    fresh, options = seen.calls[0]
    assert fresh is not native.pipeline and fresh.scheduler is not native.pipeline.scheduler
    for name in ("vae", "unet", "text_encoder", "text_encoder_2", "tokenizer", "tokenizer_2"):
        assert getattr(fresh, name) is getattr(native.pipeline, name)
    assert "prepare_latents" not in vars(fresh)
    assert "prepare_extra_step_kwargs" not in vars(fresh)
    assert getattr(fresh, "_igs_outpaint_state", None) is None
    assert "_igs_prepared_image_latents" not in vars(fresh)
    source = case.infilled if case.mode == "outpaint" else case.source
    assert options["image"].tobytes() == source.tobytes()
    assert options["strength"] == command.denoising_strength
    assert options["num_inference_steps"] == command.steps
    assert options["guidance_rescale"] == command.cfg_rescale
    vae_dtype = next(native.pipeline.vae.parameters()).dtype
    normalized = torch.from_numpy(np.asarray(source).astype(np.float32) / np.float32(255))
    normalized = normalized.permute(2, 0, 1).unsqueeze(0) * 2 - 1
    expected_image = normalized.to(device=native.pipeline.vae.device, dtype=vae_dtype)
    assert torch.equal(seen.encodes[0], expected_image), "source changed before VAE encoding"
    mean, std, posterior, posterior_generator, initial_state = seen.posteriors[0]
    posterior_rng = torch.Generator(device="cpu").manual_seed(command.seed)
    assert posterior_generator is not options["generator"]
    assert torch.equal(initial_state, posterior_rng.get_state())
    draw = torch.randn(mean.shape, generator=posterior_rng, dtype=mean.dtype).to(mean.device)
    assert torch.equal(posterior, mean + std * draw)
    assert torch.equal(posterior_generator.get_state(), posterior_rng.get_state())
    scale = native.pipeline.vae.config.scaling_factor
    encoded = (posterior * scale).to(dtype=native.dtype)
    oracle = _reference(native, case, command.prediction_type)
    opposite = _reference(
        native, case, "epsilon" if command.prediction_type == "v_prediction" else "v_prediction"
    )
    beta, cumulative = _literal_training(torch, command.noise_profile.rescale_betas_zero_snr)
    grid = _literal_grid(np, command.steps, command.noise_profile.timestep_spacing)
    first = sum(bool(value >= round(1000 * command.denoising_strength)) for value in grid)
    selected = grid[first:].tolist()
    for scheduler in (oracle, opposite):
        scheduler.set_timesteps(command.steps, device=mean.device)
        scheduler.set_begin_index(first)
    assert torch.equal(fresh.scheduler.betas, beta)
    assert torch.equal(fresh.scheduler.alphas_cumprod, cumulative)
    assert torch.equal(fresh.scheduler.timesteps, oracle.timesteps)
    assert torch.equal(fresh.scheduler.sigmas, oracle.sigmas)
    assert fresh.num_timesteps == len(selected)
    assert len(seen.forwards) == len(seen.cfg_raw) == len(seen.cfg_steps) == len(selected)
    assert [entry.timestep.item() for entry in seen.cfg_steps] == selected
    assert [entry["timestep"].item() for entry in seen.forwards] == selected
    noise_rng = torch.Generator(device="cpu").manual_seed(command.seed)
    terminal = encoded
    if not selected:
        assert not seen.noises and not seen.merges
    else:
        arguments, noised = seen.noises[0]
        assert arguments["self"] is fresh.scheduler
        assert torch.equal(arguments["original_samples"], encoded)
        assert arguments["timesteps"].tolist() == selected[:1]
        noise = torch.randn(encoded.shape, generator=noise_rng, dtype=native.dtype).to(mean.device)
        assert torch.equal(arguments["noise"], noise)
        expected_initial = oracle.add_noise(encoded, noise, oracle.timesteps[first : first + 1])
        assert torch.equal(noised, expected_initial)
        assert torch.equal(seen.cfg_steps[0].sample, expected_initial)
        discriminated = False
        masks = None
        generate: Any = None
        if case.mode == "outpaint":
            masks = prepare_outpaint_conditioning(
                case.original, coherence_edge_radius=16, minimum_denoise=0, output_fade_radius=16
            )
            generate = (
                1
                - torch.tensor(list(masks.latent_keep_mask.tobytes()), dtype=torch.float32).reshape(
                    1, 1, command.height // 8, command.width // 8
                )
                / 255
            )
            generate = generate.to(device=mean.device, dtype=native.dtype)
            assert len(seen.merges) == len(selected)
        else:
            assert not seen.merges
        for index, (record, raw) in enumerate(zip(seen.cfg_steps, seen.cfg_raw, strict=True)):
            assert record.scheduler is fresh.scheduler
            assert record.raw_count == index + 1
            prediction, _ = _invoke_oracle(torch, raw, command.cfg_scale, command.cfg_rescale)
            assert torch.equal(record.prediction, prediction)
            batch = record.sample.repeat(2, 1, 1, 1)
            assert torch.equal(
                seen.forwards[index]["sample"], oracle.scale_model_input(batch, record.timestep)
            )
            opposite.scale_model_input(batch, record.timestep)
            wrong = opposite.step(prediction, record.timestep, record.sample, return_dict=False)[0]
            expected = oracle.step(prediction, record.timestep, record.sample, return_dict=False)[0]
            discriminated |= not torch.equal(expected, wrong)
            assert torch.equal(record.result, expected), (
                "source-conditioned Euler consumed wrong prediction objective"
            )
            assert torch.isfinite(record.result).all()
            if masks is not None:
                merge = seen.merges[index]
                assert torch.equal(merge.before, record.result)
                assert torch.equal(merge.original, encoded)
                assert torch.equal(merge.noise, noise)
                assert torch.equal(merge.generate, generate)
                if index + 1 == len(selected):
                    terminal = torch.where(generate > 0, expected, encoded)
                else:
                    next_time = oracle.timesteps[first + index + 1 : first + index + 2]
                    protected = oracle.add_noise(encoded, noise, next_time)
                    terminal = torch.where(generate > next_time.item() / 1000, expected, protected)
                assert torch.equal(merge.after, terminal), "OUT source protection changed"
            else:
                terminal = expected
            if index + 1 < len(selected):
                assert torch.equal(seen.cfg_steps[index + 1].sample, terminal)
        assert discriminated, "native source fixture must distinguish the two objectives"
    assert torch.equal(options["generator"].get_state(), noise_rng.get_state())
    assert torch.equal(seen.decodes[0], terminal.to(dtype=vae_dtype) / scale), (
        "VAE cast-before-scale changed"
    )
    assert fresh.scheduler.config.prediction_type == command.prediction_type


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("rescale,spacing", POLICIES)
def test_v_image_six_policies_reach_original_source_and_native_euler(
    tmp_path: Path,
    cpu: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    rescale: bool,
    spacing: str,
) -> None:
    case = _case(tmp_path, cpu, mode, rescale=rescale, spacing=spacing)
    with _observe(output, cpu, monkeypatch) as seen:
        done = _generate(output, cpu, case, monkeypatch)
    _published(cpu, case, seen, done)
    _assert_consumed(cpu, case, seen)


@pytest.mark.parametrize("mode", MODES)
def test_v_image_native_objective_red(
    tmp_path: Path,
    lane: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
) -> None:
    case = _case(tmp_path, lane, mode)
    with _observe(output, lane, monkeypatch) as seen:
        done = _generate(output, lane, case, monkeypatch)
    _published(lane, case, seen, done)
    _assert_consumed(lane, case, seen)


@pytest.mark.parametrize("mode", MODES)
def test_epsilon_image_native_objective_control_green(
    tmp_path: Path,
    lane: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
) -> None:
    case = _case(tmp_path, lane, mode, epsilon=True)
    with _observe(output, lane, monkeypatch) as seen:
        done = _generate(output, lane, case, monkeypatch)
    _published(lane, case, seen, done)
    _assert_consumed(lane, case, seen)


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("strength", (0.0, 1.0))
def test_v_image_strength_endpoints_preserve_real_source_and_window(
    tmp_path: Path,
    lane: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    strength: float,
) -> None:
    case = _case(tmp_path, lane, mode, strength=strength)
    with _observe(output, lane, monkeypatch) as seen:
        done = _generate(output, lane, case, monkeypatch)
    _published(lane, case, seen, done)
    _assert_consumed(lane, case, seen)
    assert len(seen.cfg_steps) == (0 if strength == 0 else 4)


@pytest.mark.parametrize("mode", MODES)
def test_v_image_zero_regions_equal_separate_ordinary_pt_and_png(
    tmp_path: Path,
    lane: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
) -> None:
    case = _case(tmp_path, lane, mode, zero=True)
    with _observe(output, lane, monkeypatch) as seen:
        done = _generate(output, lane, case, monkeypatch)
    _published(lane, case, seen, done)
    _assert_consumed(lane, case, seen)
    borrowed, torch = lane.pipeline, lane.torch
    factory = (
        sdxl_outpaint.outpaint_pipeline_class
        if mode == "outpaint"
        else inference.img2img_pipeline_class
    )
    ordinary = factory(lane.diffusers, torch)(
        vae=borrowed.vae,
        unet=borrowed.unet,
        text_encoder=borrowed.text_encoder,
        text_encoder_2=borrowed.text_encoder_2,
        tokenizer=borrowed.tokenizer,
        tokenizer_2=borrowed.tokenizer_2,
        scheduler=_reference(lane, case, "v_prediction"),
        add_watermarker=False,
    )
    ordinary.set_progress_bar_config(disable=True)
    parameters = _parameters(case)
    with _preserved(lane):
        conditioning = inference.build_sdxl_conditioning(
            parameters,
            borrowed,
            lane.runtime,
            embedding_inputs=EmbeddingConditioningInputs(
                (parameters.positive_prompt, parameters.negative_prompt), (None, None)
            ),
        )
        options: dict[str, Any] = dict(
            width=case.command.width,
            height=case.command.height,
            steps=parameters.steps,
            cfg_scale=parameters.cfg_scale,
            cfg_rescale=parameters.cfg_rescale,
            generator=torch.Generator(device="cpu").manual_seed(parameters.seed),
            torch=torch,
            denoising_strength=case.command.denoising_strength,
            output_type="pt",
        )
        if mode == "outpaint":
            masks = prepare_outpaint_conditioning(
                case.original, coherence_edge_radius=16, minimum_denoise=0, output_fade_radius=16
            )
            result = sdxl_outpaint.run_sdxl_outpaint_pipeline(
                ordinary,
                conditioning,
                keep_mask=masks.latent_keep_mask,
                image=case.infilled,
                **options,
            )
        else:
            result = inference.run_sdxl_pipeline(
                ordinary, conditioning, image=case.source, **options
            )
    assert torch.equal(result.images, seen.results[0][1])
    assert _quantized_bytes(lane, result.images) == _quantized_bytes(lane, seen.results[0][1])


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("precision", ("FP16", "FP32"))
def test_v_image_prepared_cuda_vae_preserves_dtype_before_source_scale(
    tmp_path: Path,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    precision: str,
) -> None:
    with _models("cuda") as native:
        case = _case(tmp_path, native, mode, prepared=True, precision=precision)
        with _observe(output, native, monkeypatch) as seen:
            done = _generate(output, native, case, monkeypatch)
        _published(native, case, seen, done)
        _assert_consumed(native, case, seen)
        if precision == "FP32":
            assert seen.encodes[0].dtype == seen.posteriors[0][0].dtype == native.torch.float32
            sampled = seen.posteriors[0][2]
            scale = native.pipeline.vae.config.scaling_factor
            assert not native.torch.equal(
                (sampled * scale).to(native.dtype), sampled.to(native.dtype) * scale
            )


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize(
    "invalid",
    (
        "old-eps",
        "txt-profile",
        "other-image",
        "crossed-lane",
        "no-policy",
        "ancestral",
        "dpm",
        "sample",
        "eps-in-v",
    ),
)
def test_v_image_profiles_refuse_before_target_or_native_work(
    tmp_path: Path,
    cpu: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    invalid: str,
) -> None:
    case = _case(tmp_path, cpu, mode)
    if invalid == "old-eps":
        case.args["denoising_profile"] = f"ordinary-canvas-euler-{mode}-cpu-v1"
    elif invalid == "txt-profile":
        case.args["denoising_profile"] = "ordinary-canvas-euler-v-prediction-txt2img-cpu-v1"
    elif invalid == "other-image":
        opposite = "img2img" if mode == "outpaint" else "outpaint"
        case.args["denoising_profile"] = f"ordinary-canvas-euler-v-prediction-{opposite}-cpu-v1"
    elif invalid == "crossed-lane":
        case.args["denoising_profile"] = f"ordinary-canvas-euler-v-prediction-{mode}-cuda-fp16-v1"
    else:
        changes: dict[str, Any] = {
            "no-policy": {"noise_profile": None},
            "ancestral": {"scheduler": "euler_a"},
            "dpm": {"scheduler": "dpmpp_2m"},
            "sample": {"prediction_type": "sample"},
            "eps-in-v": {"prediction_type": "epsilon"},
        }[invalid]
        case.command = replace(case.command, **changes)
    recipe, command = copy.deepcopy(case.recipe), copy.deepcopy(case.command)
    target = case.target.read_bytes()
    entry = (
        output.generate_current_canvas_regional_outpaint
        if mode == "outpaint"
        else output.generate_current_canvas_regional_img2img
    )
    # Preserve fixture/state checks outside the filework tripwire; enter the real frontend directly.
    with (
        _preserved(cpu),
        _before_filework(cpu, monkeypatch),
        pytest.raises(
            (output.IllustriousRegionalOutputError, cpu.denoising.IllustriousRegionalDenoisingError)
        ) as caught,
    ):
        entry(case.recipe, command=case.command, **case.args)
    assert caught.value.code in {"PROFILE_INVALID", "UNSUPPORTED", "INPUT_INVALID"}
    assert case.recipe == recipe and case.command == command
    assert case.target.read_bytes() == target
    assert not case.command.output_path.exists()


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("failure", ("encode", "later-unet", "decode", "publication"))
def test_v_image_partial_native_failure_restores_then_fresh_request_recovers(
    tmp_path: Path,
    cpu: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    failure: str,
) -> None:
    case = _case(tmp_path, cpu, mode, strength=1.0)
    sentinel = RuntimeError("declared source-conditioned V failure")
    owner = cpu.pipeline.unet if failure == "later-unet" else cpu.pipeline.vae
    method = "forward" if failure == "later-unet" else "encode" if failure == "encode" else "decode"
    cls = cast(Any, type(owner))
    original = getattr(cls, method)
    calls: list[str] = []

    @wraps(original)
    def fail(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is owner:
            calls.append(method)
            if failure != "later-unet" or len(calls) == 2:
                raise sentinel
        return original(current, *args, **kwargs)

    def publish_failure(*_args: Any, **_kwargs: Any) -> Any:
        calls.append("publication")
        raise sentinel

    with monkeypatch.context() as patch:
        publication = (
            _aliases(patch, generation_artifacts.publish_generation_image, publish_failure)
            if failure == "publication"
            else nullcontext()
        )
        if failure != "publication":
            patch.setattr(cls, method, fail)
        with publication, pytest.raises(RuntimeError) as caught:
            _generate(output, cpu, case, monkeypatch)
        assert caught.value is sentinel
    assert len(calls) == (2 if failure == "later-unet" else 1)
    assert not case.command.output_path.exists() and not list(case.root.glob(".*.tmp"))
    with _observe(output, cpu, monkeypatch) as seen:
        done = _generate(output, cpu, case, monkeypatch)
    _published(cpu, case, seen, done)
    _assert_consumed(cpu, case, seen)


@pytest.mark.parametrize("mode", ("txt2img", *MODES))
@pytest.mark.parametrize("precision", ("Auto", "FP16", "FP32"))
def test_worker_maps_exact_v_image_policy_and_advertises_combination(
    mode: str, precision: str
) -> None:
    from imagegen_worker import illustrious_regional_worker as worker
    from imagegen_worker import inference_main

    parameters = _base_parameters(
        prediction_type="v_prediction",
        scheduler="euler",
        noise_profile=_noise(),
        vae_precision=precision,
    )
    selected = worker._denoising_profile(  # pyright: ignore[reportPrivateUsage]
        parameters,
        composition_profile="invoke-canvas-v1",
        img2img=mode == "img2img",
        outpaint=mode == "outpaint",
    )
    suffix = "cuda-fp16" if precision == "FP16" else "cuda-vae"
    assert selected == f"ordinary-canvas-euler-v-prediction-{mode}-{suffix}-v1"
    capabilities = cast(list[str], inference_main.inference_ready_message()["capabilities"])
    assert "illustrious-regional-v-prediction-v1" in capabilities
    assert "illustrious-regional-v-prediction-image-v1" in capabilities


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize(
    "invalid", ("ancestral", "dpm", "initializer", "composition", "crossed-mode")
)
def test_worker_refuses_other_v_image_mechanisms_before_loading(mode: str, invalid: str) -> None:
    from imagegen_worker import illustrious_regional_worker as worker

    parameters = _base_parameters(
        prediction_type="v_prediction", scheduler="euler", noise_profile=_noise()
    )
    options: dict[str, Any] = dict(
        composition_profile="invoke-canvas-v1",
        img2img=mode == "img2img",
        outpaint=mode == "outpaint",
    )
    if invalid in ("ancestral", "dpm"):
        parameters = replace(
            parameters, scheduler="heun" if invalid == "ancestral" else "dpmpp_2m_sde"
        )
    elif invalid == "initializer":
        options["initialization_profile"] = "invoke-cpu-f32-add-noise-v1"
    elif invalid == "composition":
        options["composition_profile"] = None
    else:
        options.update(img2img=True, outpaint=True)
    with pytest.raises(DerivativeError) as caught:
        worker._denoising_profile(parameters, **options)  # pyright: ignore[reportPrivateUsage]
    assert caught.value.code == "INVALID_REQUEST"
