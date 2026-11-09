"""Bounded V sampler/source integration; ROOT alone imports and executes.

Current InvokeAI4875d96531ca6712b288f6e660fcbb34143408c1 supplies
sd/denoise_latents.py:get_scheduler/init_scheduler/prepare_noise_and_latents,
stable_diffusion/schedulers/schedulers.py, diffusion_backend.py and Canvas
compileCanvasGraph.ts/addRegionalGuidance.ts. The objective is independent of
sampler/source. Existing Studio native scopes retain initialization, source
posterior/window, xor step RNG, DPM history, mask and VAE/publication ownership.

These observers call original native methods and retain their return objects.
Independent literal schedulers assess every consumed transition only after PNG
publication. No prediction formula or diffusion loop is copied. Complete Python
recipes/tiny random models do not prove genuine Main/trained/installed behavior.
AST/Ruff only during authorship; collection, typing and runtime belong to ROOT.
"""

from __future__ import annotations

import copy
import importlib
import inspect
from collections.abc import Generator, Iterator
from contextlib import contextmanager, nullcontext
from dataclasses import fields, replace
from functools import wraps
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import generation_artifacts, inference, sdxl_outpaint
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.inference_embeddings import EmbeddingConditioningInputs
from imagegen_worker.outpaint_conditioning import prepare_outpaint_conditioning
from imagegen_worker.protocol import IllustriousInferenceParameters
from test_illustrious_regional_cfg_rescale import (
    _history,  # pyright: ignore[reportPrivateUsage]
    _invoke_oracle,  # pyright: ignore[reportPrivateUsage]
    _observe_cfg,  # pyright: ignore[reportPrivateUsage]
    _same_history,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_dpmpp_2m import CPU_ENCODING, CUDA_ENCODING
from test_illustrious_regional_embeddings import (
    _models,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
    _with_resources,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _clone,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_outpaint import (
    _infill_collaborator,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _aliases,  # pyright: ignore[reportPrivateUsage]
    _before_filework,  # pyright: ignore[reportPrivateUsage]
    _quantized_bytes,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _case as _text_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    _parameters as _base_parameters,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_v_prediction import (
    _noise,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_v_prediction_image import (
    _case as _v_image_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_v_prediction_image import (
    _published,  # pyright: ignore[reportPrivateUsage]
)

METHODS = ("euler_a", "dpmpp_2m", "dpmpp_2m_k")
MODES = ("txt2img", "img2img", "outpaint")
CONTROLS = (("euler_a", "txt2img"), ("dpmpp_2m", "img2img"), ("dpmpp_2m_k", "outpaint"))
CAPABILITY = "illustrious-regional-v-prediction-sampling-v1"


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


def _profile(native: Any, method: str, mode: str, *, epsilon: bool, prepared: bool) -> str:
    algorithm = "euler-ancestral" if method == "euler_a" else "dpmpp-2m"
    objective = "" if epsilon else "-v-prediction"
    initialization = "invoke-init-" if mode == "txt2img" else ""
    suffix = "cuda-vae" if prepared else "cuda-fp16" if native.device == "cuda" else "cpu"
    return f"ordinary-canvas-{algorithm}{objective}-{initialization}{mode}-{suffix}-v1"


def _case(
    root: Path,
    native: Any,
    method: str,
    mode: str,
    *,
    epsilon: bool = False,
    zero: bool = False,
    prepared: bool = False,
) -> Any:
    root.mkdir(parents=True, exist_ok=True)
    if mode == "txt2img":
        recipe = _with_resources(_recipe(*(() if zero else (_region(),))))
        case = _text_case(root, native, recipe=recipe, steps=4)
        case.mode, case.prepared = mode, False
    else:
        case = _v_image_case(root, native, mode, strength=1.0, zero=zero, prepared=prepared)
    case.command = replace(
        case.command,
        prediction_type="epsilon" if epsilon else "v_prediction",
        scheduler=method,
        steps=4,
        cfg_rescale=0.7,
        noise_profile=_noise(),
    )
    case.args["profile"] = CUDA_ENCODING if native.device == "cuda" else CPU_ENCODING
    case.args["denoising_profile"] = _profile(
        native, method, mode, epsilon=epsilon, prepared=prepared
    )
    case.method = method
    return case


def _parameters(case: Any) -> IllustriousInferenceParameters:
    return IllustriousInferenceParameters(
        **{f.name: getattr(case.command, f.name) for f in fields(IllustriousInferenceParameters)}
    )


def _entry(output: Any, mode: str) -> Any:
    return getattr(output, "generate_current_canvas_regional_" + mode)


def _generate(output: Any, native: Any, case: Any, patch: pytest.MonkeyPatch) -> Any:
    before = copy.deepcopy(case.recipe), copy.deepcopy(case.command), case.target.read_bytes()
    infill = _infill_collaborator(case, patch) if case.mode == "outpaint" else nullcontext()
    try:
        with infill, _preserved(native):
            return _entry(output, case.mode)(case.recipe, command=case.command, **case.args)
    finally:
        assert case.recipe == before[0] and case.command == before[1]
        assert case.target.read_bytes() == before[2]


def _reference(native: Any, command: Any, *, opposite: bool = False) -> Any:
    """Independent literal native constructor, never the subject selector/profile."""
    objective = command.prediction_type
    if opposite:
        objective = "epsilon" if objective == "v_prediction" else "v_prediction"
    policy = command.noise_profile
    options = dict(
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
    if command.scheduler == "euler_a":
        return native.diffusers.EulerAncestralDiscreteScheduler(**options)
    return native.diffusers.DPMSolverMultistepScheduler(
        **options,
        algorithm_type="dpmsolver++",
        solver_order=2,
        use_karras_sigmas=command.scheduler == "dpmpp_2m_k",
    )


@contextmanager
def _observe(output: Any, native: Any, patch: pytest.MonkeyPatch) -> Generator[Any]:
    """Transparent native-class delegates; store bounded tiny-fixture observations."""
    torch, borrowed = native.torch, native.pipeline
    seen = SimpleNamespace(
        calls=[],
        results=[],
        publications=[],
        receipts=[],
        encodes=[],
        posteriors=[],
        decodes=[],
        noises=[],
        preparations=[],
        merges=[],
        steps=[],
        events=[],
    )
    decode, encode = cast(Any, type(borrowed.vae)).decode, cast(Any, type(borrowed.vae)).encode
    distribution = importlib.import_module(
        "diffusers.models.autoencoders.vae"
    ).DiagonalGaussianDistribution
    sample = distribution.sample
    run, publish = (
        output.run_current_canvas_regional_denoising,
        generation_artifacts.publish_generation_image,
    )
    merge = sdxl_outpaint._OutpaintState.step  # pyright: ignore[reportPrivateUsage]

    def call_observer(original: Any) -> Any:
        @wraps(original)
        def called(current: Any, *args: Any, **kwargs: Any) -> Any:
            seen.calls.append((current, _clone(kwargs, torch)))
            return original(current, *args, **kwargs)

        return called

    def prepare_observer(original: Any) -> Any:
        @wraps(original)
        def prepared(current: Any, generator: Any, eta: Any) -> Any:
            result = original(current, generator, eta)
            seen.preparations.append((current, generator, eta, dict(result)))
            return result

        return prepared

    @wraps(encode)
    def encoded(current: Any, *args: Any, **kwargs: Any) -> Any:
        seen.encodes.append(args[0].detach().clone())
        return encode(current, *args, **kwargs)

    @wraps(decode)
    def decoded(current: Any, *args: Any, **kwargs: Any) -> Any:
        seen.decodes.append(args[0].detach().clone())
        return decode(current, *args, **kwargs)

    @wraps(sample)
    def sampled(current: Any, *args: Any, **kwargs: Any) -> Any:
        values = inspect.signature(sample).bind(current, *args, **kwargs).arguments
        rng = values.get("generator")
        state = None if rng is None else rng.get_state().clone()
        result = sample(current, *args, **kwargs)
        seen.posteriors.append(
            (
                current.mean.detach().clone(),
                current.std.detach().clone(),
                result.detach().clone(),
                rng,
                state,
            )
        )
        return result

    def noise_observer(original: Any) -> Any:
        @wraps(original)
        def noised(current: Any, *args: Any, **kwargs: Any) -> Any:
            values = inspect.signature(original).bind(current, *args, **kwargs).arguments
            result = original(current, *args, **kwargs)
            seen.noises.append((_clone(dict(values), torch), result.detach().clone()))
            return result

        return noised

    @wraps(run)
    def returned(*args: Any, **kwargs: Any) -> Any:
        result = run(*args, **kwargs)
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

    with patch.context() as p:
        for cls in (
            native.diffusers.StableDiffusionXLPipeline,
            native.diffusers.StableDiffusionXLImg2ImgPipeline,
        ):
            p.setattr(cls, "__call__", call_observer(cls.__call__))
            p.setattr(
                cls, "prepare_extra_step_kwargs", prepare_observer(cls.prepare_extra_step_kwargs)
            )
        for cls in (
            native.diffusers.EulerAncestralDiscreteScheduler,
            native.diffusers.DPMSolverMultistepScheduler,
        ):
            p.setattr(cls, "add_noise", noise_observer(cls.add_noise))
        p.setattr(cast(Any, type(borrowed.vae)), "encode", encoded)
        p.setattr(cast(Any, type(borrowed.vae)), "decode", decoded)
        p.setattr(distribution, "sample", sampled)
        p.setattr(sdxl_outpaint._OutpaintState, "step", merged)  # pyright: ignore[reportPrivateUsage]
        with (
            _aliases(p, run, returned),
            _aliases(p, publish, published),
            _observe_cfg(native, seen, patch),
        ):
            yield seen


def _assert_consumed(native: Any, case: Any, seen: Any) -> None:
    """Actual source/init/history/RNG/objective consumption, after original PNG."""
    torch, command = native.torch, case.command
    assert len(seen.calls) == len(seen.results) == len(seen.decodes) == 1
    fresh, options = seen.calls[0]
    assert fresh is not native.pipeline and fresh.scheduler is not native.pipeline.scheduler
    for name in ("unet", "vae", "text_encoder", "text_encoder_2", "tokenizer", "tokenizer_2"):
        assert getattr(fresh, name) is getattr(native.pipeline, name)
    assert "prepare_latents" not in vars(fresh) and "prepare_extra_step_kwargs" not in vars(fresh)
    assert getattr(fresh, "_igs_outpaint_state", None) is None
    assert "_igs_prepared_image_latents" not in vars(fresh)
    device = torch.device("cuda:0" if native.device == "cuda" else "cpu")
    oracle, opposite = _reference(native, command), _reference(native, command, opposite=True)
    for scheduler in (oracle, opposite):
        scheduler.set_timesteps(command.steps, device=device)
    first = (
        0
        if case.mode == "txt2img"
        else sum(t >= round(1000 * command.denoising_strength) for t in oracle.timesteps.tolist())
    )
    for scheduler in (oracle, opposite):
        scheduler.set_begin_index(first)
    assert torch.equal(fresh.scheduler.timesteps, oracle.timesteps)
    assert torch.equal(fresh.scheduler.sigmas, oracle.sigmas)
    assert torch.equal(fresh.scheduler.betas, oracle.betas)
    assert torch.equal(fresh.scheduler.alphas_cumprod, oracle.alphas_cumprod)
    assert fresh.scheduler.timesteps.dtype == (
        torch.float32 if case.method == "euler_a" else torch.int64
    )
    selected = oracle.timesteps[first:]
    assert len(seen.cfg_raw) == len(seen.cfg_steps) == len(selected)
    assert len(seen.preparations) == 1
    assert seen.preparations[0][0] is fresh
    initial = options["generator"]
    assert seen.preparations[0][1] is initial and seen.preparations[0][2] == 0
    assert seen.preparations[0][3]["generator"] is initial
    assert initial.device == torch.device("cpu") and initial.initial_seed() == command.seed
    assert len(seen.noises) >= 1
    values, actual_initial = seen.noises[0]
    assert values["self"] is fresh.scheduler
    assert values["timesteps"].tolist() == selected[:1].tolist()
    shape = (1, 4, command.height // 8, command.width // 8)
    initial_rng = torch.Generator(device="cpu").manual_seed(command.seed)
    if case.mode == "txt2img":
        assert seen.encodes == seen.posteriors == []
        noise = (
            torch.randn(shape, generator=initial_rng, device="cpu", dtype=torch.float32)
            .to(dtype=native.dtype)
            .to(device)
        )
        encoded = torch.zeros_like(noise)
    else:
        assert len(seen.encodes) == len(seen.posteriors) == 1
        source = case.infilled if case.mode == "outpaint" else case.source
        np = pytest.importorskip("numpy")
        normalized = (
            torch.from_numpy(np.asarray(source).astype(np.float32) / np.float32(255))
            .permute(2, 0, 1)
            .unsqueeze(0)
            * 2
            - 1
        )
        vae_dtype = next(native.pipeline.vae.parameters()).dtype
        assert torch.equal(seen.encodes[0], normalized.to(device=device, dtype=vae_dtype))
        mean, std, posterior, posterior_rng, state = seen.posteriors[0]
        draw_rng = torch.Generator(device="cpu").manual_seed(command.seed)
        assert posterior_rng is not initial and posterior_rng.device == torch.device("cpu")
        assert torch.equal(state, draw_rng.get_state())
        draw = torch.randn(mean.shape, generator=draw_rng, dtype=mean.dtype, device="cpu").to(
            device
        )
        assert torch.equal(posterior, mean + std * draw)
        assert torch.equal(posterior_rng.get_state(), draw_rng.get_state())
        encoded = (posterior * native.pipeline.vae.config.scaling_factor).to(native.dtype)
        noise = torch.randn(shape, generator=initial_rng, device="cpu", dtype=native.dtype).to(
            device
        )
    assert torch.equal(initial.get_state(), initial_rng.get_state())
    assert torch.equal(values["original_samples"], encoded)
    assert torch.equal(values["noise"], noise)
    assert torch.equal(actual_initial, oracle.add_noise(encoded, noise, selected[:1]))
    assert torch.equal(seen.cfg_steps[0].sample, actual_initial)
    step_rng = torch.Generator(device=device).manual_seed(command.seed ^ 0xFFFFFFFF)
    wrong_rng = torch.Generator(device=device).manual_seed(command.seed ^ 0xFFFFFFFF)
    actual_step_rng = seen.cfg_steps[0].generator
    assert (
        actual_step_rng is not initial
        and actual_step_rng.initial_seed() == command.seed ^ 0xFFFFFFFF
    )
    if case.mode != "txt2img":
        assert actual_step_rng is not seen.posteriors[0][3]
    discriminated = False
    masks = (
        prepare_outpaint_conditioning(
            case.original, coherence_edge_radius=16, minimum_denoise=0, output_fade_radius=16
        )
        if case.mode == "outpaint"
        else None
    )
    generate: Any = None
    if masks is not None:
        generate = (
            1
            - torch.tensor(list(masks.latent_keep_mask.tobytes()), dtype=torch.float32).reshape(
                1, 1, *shape[-2:]
            )
            / 255
        ).to(device=device, dtype=native.dtype)
    terminal: Any = None
    for index, (raw, record) in enumerate(zip(seen.cfg_raw, seen.cfg_steps, strict=True)):
        assert record.scheduler is fresh.scheduler and record.generator is actual_step_rng
        assert record.raw_count == index + 1
        prediction, _ = _invoke_oracle(torch, raw, command.cfg_scale, command.cfg_rescale)
        assert torch.equal(prediction, record.prediction)
        assert record.timestep.item() == selected[index].item()
        assert torch.equal(record.rng_before, step_rng.get_state())
        _same_history(torch, record.history_before, _history(oracle))
        assert record.lower_before == getattr(oracle, "lower_order_nums", None)
        sample = torch.cat((record.sample, record.sample))
        oracle.scale_model_input(sample, record.timestep)
        opposite.scale_model_input(sample, record.timestep)
        expected = oracle.step(
            prediction, record.timestep, record.sample, generator=step_rng, return_dict=False
        )[0]
        wrong = opposite.step(
            prediction, record.timestep, record.sample, generator=wrong_rng, return_dict=False
        )[0]
        discriminated |= not torch.equal(expected, wrong)
        assert torch.equal(record.result, expected), "native sampler consumed wrong V/EPS objective"
        assert torch.equal(record.rng_after, step_rng.get_state())
        _same_history(torch, record.history_after, _history(oracle))
        assert record.lower_after == getattr(oracle, "lower_order_nums", None)
        terminal = expected
        if masks is not None:
            actual = seen.merges[index]
            assert torch.equal(actual.before, expected)
            assert torch.equal(actual.original, encoded) and torch.equal(actual.noise, noise)
            assert torch.equal(actual.generate, generate)
            if index + 1 == len(selected):
                terminal = torch.where(generate > 0, expected, encoded)
            else:
                next_time = selected[index + 1 : index + 2]
                protected = oracle.add_noise(encoded, noise, next_time)
                terminal = torch.where(generate > next_time.item() / 1000, expected, protected)
            assert torch.equal(actual.after, terminal)
        if index + 1 < len(selected):
            assert torch.equal(seen.cfg_steps[index + 1].sample, terminal)
    assert discriminated, "fixture must distinguish real V and EPS native transitions"
    assert terminal is not None
    vae_dtype = next(native.pipeline.vae.parameters()).dtype
    assert torch.equal(
        seen.decodes[0], terminal.to(vae_dtype) / native.pipeline.vae.config.scaling_factor
    )
    if case.method != "euler_a":
        assert all(torch.equal(r.rng_before, r.rng_after) for r in seen.cfg_steps), (
            "deterministic DPM must not consume the independent step RNG"
        )
        assert any(r.lower_before > 0 for r in seen.cfg_steps[1:]), (
            "DPM must retain multistep history"
        )


@pytest.mark.parametrize("method", METHODS)
@pytest.mark.parametrize("mode", MODES)
def test_v_sampling_native_objective_red(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch, method: str, mode: str
) -> None:
    case = _case(tmp_path, lane, method, mode)
    with _observe(output, lane, monkeypatch) as seen:
        done = _generate(output, lane, case, monkeypatch)
    _published(lane, case, seen, done)
    _assert_consumed(lane, case, seen)


@pytest.mark.parametrize("method,mode", CONTROLS)
def test_epsilon_sampling_native_control_green(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch, method: str, mode: str
) -> None:
    case = _case(tmp_path, lane, method, mode, epsilon=True)
    with _observe(output, lane, monkeypatch) as seen:
        done = _generate(output, lane, case, monkeypatch)
    _published(lane, case, seen, done)
    _assert_consumed(lane, case, seen)


def _ordinary(native: Any, case: Any) -> Any:
    """Separate original native loop, independent source/init/window preparation."""
    assert case.recipe["regions"] == []
    torch, borrowed, parameters = native.torch, native.pipeline, _parameters(case)
    factory = (
        native.diffusers.StableDiffusionXLPipeline
        if case.mode == "txt2img"
        else (
            sdxl_outpaint.outpaint_pipeline_class
            if case.mode == "outpaint"
            else inference.img2img_pipeline_class
        )(native.diffusers, torch)
    )

    class ReferencePipeline(factory):
        def get_timesteps(
            self,
            num_inference_steps: int,
            strength: float,
            device: Any,
            denoising_start: float | None = None,
        ) -> tuple[Any, int]:
            assert denoising_start is None and num_inference_steps == parameters.steps
            full = self.scheduler.timesteps
            first = sum(t >= round(1000 * strength) for t in full.tolist())
            # Delegate the ordinary OUT owner so it records its callback schedule.
            # Independently check the selected window instead of bypassing that owner.
            parent: Any = super()
            selected, effective = parent.get_timesteps(
                num_inference_steps, strength, device, denoising_start
            )
            assert torch.equal(selected, full[first:])
            assert effective == len(full) - first
            assert self.scheduler.begin_index == first
            return selected, effective

    current = ReferencePipeline(
        vae=borrowed.vae,
        unet=borrowed.unet,
        text_encoder=borrowed.text_encoder,
        text_encoder_2=borrowed.text_encoder_2,
        tokenizer=borrowed.tokenizer,
        tokenizer_2=borrowed.tokenizer_2,
        scheduler=_reference(native, case.command),
        add_watermarker=False,
    )
    current.set_progress_bar_config(disable=True)
    original_options = current.prepare_extra_step_kwargs
    device = torch.device("cuda:0" if native.device == "cuda" else "cpu")
    step_rng = torch.Generator(device=device).manual_seed(parameters.seed ^ 0xFFFFFFFF)

    def step_options(generator: Any, eta: Any) -> dict[str, Any]:
        return {**original_options(generator, eta), "generator": step_rng}

    current.prepare_extra_step_kwargs = step_options
    if case.mode == "txt2img":
        original_prepare = current.prepare_latents

        @wraps(original_prepare)
        def prepared(*args: Any, **kwargs: Any) -> Any:
            bound = inspect.signature(original_prepare).bind(*args, **kwargs)
            bound.apply_defaults()
            v = bound.arguments
            assert v["latents"] is None
            shape = (v["batch_size"], v["num_channels_latents"], v["height"] // 8, v["width"] // 8)
            raw = torch.randn(shape, generator=v["generator"], device="cpu", dtype=torch.float32)
            noise = raw.to(device="cpu", dtype=v["dtype"]).to(v["device"])
            return current.scheduler.add_noise(
                torch.zeros_like(noise), noise, current.scheduler.timesteps[:1]
            )

        current.prepare_latents = prepared
    try:
        with _preserved(native):
            condition = inference.build_sdxl_conditioning(
                parameters,
                borrowed,
                native.runtime,
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
                output_type="pt",
            )
            if case.mode == "txt2img":
                return inference.run_sdxl_pipeline(current, condition, **options)
            options["denoising_strength"] = case.command.denoising_strength
            if case.mode == "outpaint":
                masks = prepare_outpaint_conditioning(
                    case.original,
                    coherence_edge_radius=16,
                    minimum_denoise=0,
                    output_fade_radius=16,
                )
                return sdxl_outpaint.run_sdxl_outpaint_pipeline(
                    current,
                    condition,
                    keep_mask=masks.latent_keep_mask,
                    image=case.infilled,
                    **options,
                )
            return inference.run_sdxl_pipeline(current, condition, image=case.source, **options)
    finally:
        current.__dict__.pop("prepare_latents", None)
        current.__dict__.pop("prepare_extra_step_kwargs", None)


@pytest.mark.parametrize("method", METHODS)
@pytest.mark.parametrize("mode", MODES)
def test_v_sampling_zero_regions_equal_original_ordinary_loop(
    tmp_path: Path, cpu: Any, output: Any, monkeypatch: pytest.MonkeyPatch, method: str, mode: str
) -> None:
    case = _case(tmp_path, cpu, method, mode, zero=True)
    with _observe(output, cpu, monkeypatch) as seen:
        done = _generate(output, cpu, case, monkeypatch)
    _published(cpu, case, seen, done)
    _assert_consumed(cpu, case, seen)
    original = _ordinary(cpu, case)
    assert cpu.torch.equal(original.images, seen.results[0][1])
    assert _quantized_bytes(cpu, original.images) == _quantized_bytes(cpu, seen.results[0][1])


@pytest.mark.parametrize("method,mode", CONTROLS)
def test_v_sampling_repeat_replays_local_streams(
    tmp_path: Path, cpu: Any, output: Any, monkeypatch: pytest.MonkeyPatch, method: str, mode: str
) -> None:
    files: list[bytes] = []
    for name in ("first", "repeat"):
        case = _case(tmp_path / name, cpu, method, mode)
        with _observe(output, cpu, monkeypatch) as seen:
            done = _generate(output, cpu, case, monkeypatch)
        files.append(_published(cpu, case, seen, done))
        _assert_consumed(cpu, case, seen)
    assert files[0] == files[1]


@pytest.mark.parametrize(
    "rescale,spacing",
    (
        (False, "leading"),
        (False, "linspace"),
        (False, "trailing"),
        (True, "leading"),
        (True, "linspace"),
        (True, "trailing"),
    ),
)
def test_v_sampling_consumes_explicit_complete_noise_policy(
    tmp_path: Path,
    cpu: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    rescale: bool,
    spacing: str,
) -> None:
    case = _case(tmp_path, cpu, "dpmpp_2m", "txt2img")
    case.command = replace(case.command, noise_profile=_noise(rescale, spacing))
    with _observe(output, cpu, monkeypatch) as seen:
        done = _generate(output, cpu, case, monkeypatch)
    _published(cpu, case, seen, done)
    _assert_consumed(cpu, case, seen)


@pytest.mark.parametrize(
    "method,mode", (("euler_a", "img2img"), ("dpmpp_2m", "outpaint"), ("dpmpp_2m_k", "img2img"))
)
def test_v_sampling_prepared_fp32_source_vae_preserves_existing_owner(
    tmp_path: Path, output: Any, monkeypatch: pytest.MonkeyPatch, method: str, mode: str
) -> None:
    with _models("cuda") as native:
        case = _case(tmp_path, native, method, mode, prepared=True)
        with _observe(output, native, monkeypatch) as seen:
            done = _generate(output, native, case, monkeypatch)
        _published(native, case, seen, done)
        _assert_consumed(native, case, seen)
        assert seen.encodes[0].dtype == seen.posteriors[0][0].dtype == native.torch.float32


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize(
    "invalid",
    ("old-eps", "old-euler", "cross-mode", "wrong-lane", "wrong-method", "missing-policy"),
)
def test_v_sampling_refuses_before_filework_or_model_consumption(
    tmp_path: Path, cpu: Any, output: Any, monkeypatch: pytest.MonkeyPatch, mode: str, invalid: str
) -> None:
    case = _case(tmp_path, cpu, "dpmpp_2m", mode)
    if invalid == "old-eps":
        case.args["denoising_profile"] = _profile(
            cpu, case.method, mode, epsilon=True, prepared=False
        )
    elif invalid == "old-euler":
        case.args["denoising_profile"] = f"ordinary-canvas-euler-v-prediction-{mode}-cpu-v1"
    elif invalid == "cross-mode":
        case.args["denoising_profile"] = _profile(
            cpu,
            case.method,
            "img2img" if mode != "img2img" else "outpaint",
            epsilon=False,
            prepared=False,
        )
    elif invalid == "wrong-lane":
        case.args["denoising_profile"] = case.args["denoising_profile"].replace(
            "-cpu-", "-cuda-fp16-"
        )
    else:
        case.command = replace(
            case.command,
            **({"scheduler": "euler"} if invalid == "wrong-method" else {"noise_profile": None}),
        )
    before = case.target.read_bytes(), copy.deepcopy(case.command), copy.deepcopy(case.recipe)
    with (
        _preserved(cpu),
        _before_filework(cpu, monkeypatch),
        pytest.raises(
            (output.IllustriousRegionalOutputError, cpu.denoising.IllustriousRegionalDenoisingError)
        ) as caught,
    ):
        _entry(output, mode)(case.recipe, command=case.command, **case.args)
    assert caught.value.code in ("PROFILE_INVALID", "UNSUPPORTED", "INPUT_INVALID")
    assert (
        case.target.read_bytes() == before[0]
        and case.command == before[1]
        and case.recipe == before[2]
    )
    assert not case.command.output_path.exists()


@pytest.mark.parametrize("method,mode", CONTROLS)
@pytest.mark.parametrize("failure", ("later-step", "decode", "publication"))
def test_v_sampling_late_failure_restores_and_fresh_call_recovers(
    tmp_path: Path,
    cpu: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    method: str,
    mode: str,
    failure: str,
) -> None:
    case = _case(tmp_path / "failed", cpu, method, mode)
    sentinel = RuntimeError("declared native V sampling failure")
    cls = cast(Any, type(_reference(cpu, case.command)))
    original_step, original_decode = cls.step, cast(Any, type(cpu.pipeline.vae)).decode
    steps = 0

    @wraps(original_step)
    def broken_step(*args: Any, **kwargs: Any) -> Any:
        nonlocal steps
        steps += 1
        if steps == 2:
            raise sentinel
        return original_step(*args, **kwargs)

    @wraps(original_decode)
    def broken(*_args: Any, **_kwargs: Any) -> Any:
        raise sentinel

    with monkeypatch.context() as fault:
        if failure == "later-step":
            fault.setattr(cls, "step", broken_step)
        elif failure == "decode":
            fault.setattr(cast(Any, type(cpu.pipeline.vae)), "decode", broken)
        publication = (
            _aliases(fault, generation_artifacts.publish_generation_image, broken)
            if failure == "publication"
            else nullcontext()
        )
        with publication, pytest.raises(RuntimeError) as caught:
            _generate(output, cpu, case, fault)
    assert caught.value is sentinel and not case.command.output_path.exists()
    assert not cpu.recipe._RESERVATIONS
    healthy = _case(tmp_path / "recovered", cpu, method, mode)
    with _observe(output, cpu, monkeypatch) as seen:
        done = _generate(output, cpu, healthy, monkeypatch)
    _published(cpu, healthy, seen, done)
    _assert_consumed(cpu, healthy, seen)


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("method", METHODS)
@pytest.mark.parametrize("precision", ("FP16", "FP32"))
def test_worker_selects_new_explicit_sampler_profile_and_capability(
    mode: str, method: str, precision: str
) -> None:
    from imagegen_worker import illustrious_regional_worker as worker
    from imagegen_worker import inference_main

    parameters = _base_parameters(
        prediction_type="v_prediction",
        scheduler=method,
        vae_precision=precision,
        noise_profile=_noise(),
    )
    options: dict[str, Any] = dict(
        composition_profile="invoke-canvas-v1",
        img2img=mode == "img2img",
        outpaint=mode == "outpaint",
    )
    if mode == "txt2img":
        options["initialization_profile"] = "invoke-cpu-f32-add-noise-v1"
    expected = _profile(
        SimpleNamespace(device="cuda"), method, mode, epsilon=False, prepared=precision == "FP32"
    )
    assert worker._denoising_profile(parameters, **options) == expected  # pyright: ignore[reportPrivateUsage]
    capabilities = cast(list[str], inference_main.inference_ready_message()["capabilities"])
    assert all(
        c in capabilities
        for c in (
            CAPABILITY,
            "illustrious-regional-v-prediction-v1",
            "illustrious-regional-v-prediction-image-v1",
        )
    )


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("invalid", ("unlisted", "initialization", "composition", "crossed-mode"))
def test_worker_refuses_unqualified_v_sampling_before_loading(mode: str, invalid: str) -> None:
    from imagegen_worker import illustrious_regional_worker as worker

    parameters = _base_parameters(
        prediction_type="v_prediction", scheduler="dpmpp_2m", noise_profile=_noise()
    )
    options: dict[str, Any] = dict(
        composition_profile="invoke-canvas-v1",
        img2img=mode == "img2img",
        outpaint=mode == "outpaint",
    )
    if mode == "txt2img":
        options["initialization_profile"] = "invoke-cpu-f32-add-noise-v1"
    if invalid == "unlisted":
        parameters = replace(parameters, scheduler="dpmpp_2m_sde")
    elif invalid == "initialization":
        options["initialization_profile"] = (
            None if mode == "txt2img" else "invoke-cpu-f32-add-noise-v1"
        )
    elif invalid == "composition":
        options["composition_profile"] = None
    else:
        options.update(img2img=True, outpaint=True)
    with pytest.raises(DerivativeError) as caught:
        worker._denoising_profile(parameters, **options)  # pyright: ignore[reportPrivateUsage]
    assert caught.value.code == "INVALID_REQUEST"
