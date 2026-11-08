"""Opaque Anima image initialization joins the existing regional/native owners.

The complete recipe comes unchanged from the real Main fixture. Sampling has its
own ordinary TS compiler, and the owned target fixture is separately authored
opaque PNG. These cases do not attest trained loading or Main image composition;
the installed qualification owns that boundary. Original native VAE, predictor,
attention, schedulers, decode and PNG publication remain the consumers under test.
"""

from __future__ import annotations

import hashlib
import io
import math
from collections.abc import Callable
from dataclasses import replace
from functools import wraps
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import anima_regional as regional
from imagegen_worker import anima_regional_worker as worker
from imagegen_worker import inference_main
from imagegen_worker.anima_flow_sampling import (
    generate_anima_flow_sampling,
    validate_anima_flow_sampling_plan,
)
from imagegen_worker.anima_worker import anima_sampling_payload
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.protocol import (
    GenerateAnimaImg2ImgCommand,
    GenerateAnimaOutpaintCommand,
    GenerateAnimaTxt2ImgCommand,
)
from test_anima_flow_sampling import inputs as _flow_inputs
from test_anima_regional import (
    _Call,  # pyright: ignore[reportPrivateUsage]
    _command,  # pyright: ignore[reportPrivateUsage]
    _contains_cause,  # pyright: ignore[reportPrivateUsage]
    _context_oracle,  # pyright: ignore[reportPrivateUsage]
    _Native,  # pyright: ignore[reportPrivateUsage]
    _native_association,  # pyright: ignore[reportPrivateUsage]
    _Observation,  # pyright: ignore[reportPrivateUsage]
    _observed,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
    _published,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional import cpu_native as cpu_native
from test_anima_regional import main_inputs as main_inputs
from test_anima_regional import native as native
from test_anima_regional import native_factory as native_factory
from test_anima_regional_sampling import (
    _fresh_solver,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_worker import (
    _case,  # pyright: ignore[reportPrivateUsage]
    _descriptor,  # pyright: ignore[reportPrivateUsage]
    _runtime,  # pyright: ignore[reportPrivateUsage]
    _WireCase,  # pyright: ignore[reportPrivateUsage]
)

_PROFILE = "invoke-anima-flow-sampling-v1"
_METHODS = ("euler", "heun", "dpmpp_2m", "dpmpp_2m_sde", "er_sde", "lcm")
_Producer = Callable[..., dict[str, Any]]


def _pixels(width: int, height: int, alpha: int = 255) -> Image.Image:
    values = bytearray()
    for y in range(height):
        for x in range(width):
            values.extend(((17 * x + 5 * y) % 256, (3 * x + 29 * y) % 256, (x ^ y) % 256, alpha))
    return Image.frombytes("RGBA", (width, height), bytes(values))


def _call(
    root: Path,
    produce: _Producer,
    method: str = "heun",
    *,
    strength: float = 0.5,
    steps: int = 20,
    variant: str = "base",
) -> _Call:
    handoff = produce(variant)
    bbox = handoff["recipe"]["bbox"]
    handoff["sampling"] = _flow_inputs(
        scheduler=method,
        mode="img2img",
        strength=strength,
        steps=steps,
        seed=handoff["recipe"]["item"]["seed"],
        width=bbox["width"],
        height=bbox["height"],
        guidanceScale=3,
    )["plan"]
    call = _command(root, handoff, alpha=255)
    _pixels(bbox["width"], bbox["height"]).save(
        call.command.target_path, format="PNG", icc_profile=SRGB_ICC_PROFILE
    )
    data = call.command.target_path.read_bytes()
    fields: dict[str, Any] = {
        **vars(call.command),
        "target_sha256": hashlib.sha256(data).hexdigest(),
        "target_byte_size": len(data),
    }
    return _Call(handoff, GenerateAnimaImg2ImgCommand(**fields), data)


def _execute(call: _Call, native: _Native, **changes: Any) -> dict[str, object]:
    arguments: dict[str, Any] = {
        "command": call.command,
        "compiled_prompts": call.handoff["compiledPrompts"],
        "models": native.models,
        "runtime": native.runtime,
        "profile": native.profile,
        "tokenizers": native.tokenizers,
        "sampling_profile": _PROFILE,
        **changes,
    }
    return regional.generate_current_canvas_regional_anima_img2img(
        call.handoff["recipe"], **arguments
    )


def _source_oracle(call: _Call, native: _Native) -> tuple[Any, Any]:
    """Original encode/posterior operation before the borrow's preservation baseline."""
    torch, vae = native.torch, native.models.vae
    with Image.open(io.BytesIO(call.target_bytes)) as image:
        source = image.convert("RGB")
    pixels = torch.frombuffer(bytearray(source.tobytes()), dtype=torch.uint8)
    pixels = pixels.reshape(call.command.height, call.command.width, 3).permute(2, 0, 1)
    pixels = (pixels.float().unsqueeze(0).unsqueeze(2) / 127.5 - 1).to(
        device=native.device, dtype=native.dtype
    )
    with torch.inference_mode():
        posterior = vae.encode(pixels).latent_dist
        seed = call.command.sampling.seed ^ 0x9E3779B9
        encoded = posterior.sample(generator=torch.Generator(device="cpu").manual_seed(seed))
        mean = torch.tensor(vae.config.latents_mean, device=native.device, dtype=native.dtype)
        std = torch.tensor(vae.config.latents_std, device=native.device, dtype=native.dtype)
        normalized = (encoded - mean.view(1, 16, 1, 1, 1)) / std.view(1, 16, 1, 1, 1)
    return pixels.detach().cpu().clone(), normalized.to(native.dtype).detach().clone()


def _solver_oracle(
    call: _Call, native: _Native, observed: _Observation, original: Any, actual: Any
) -> None:
    """Replay fresh native history from independently encoded source and authored clipping."""
    torch, plan = native.torch, call.command.sampling
    start = math.floor((1 - cast(float, plan.strength)) * plan.steps)
    begin = start * (2 if plan.scheduler == "heun" else 1)
    solver, full_sigmas, full_times = _fresh_solver(call, native)
    if start == plan.steps:
        sigmas, times = [0.0], []
    else:
        sigmas, times = full_sigmas[begin:], full_times[begin:]
    assert plan.start_step == start and plan.begin_index == begin
    assert tuple(sigmas) == plan.sigmas and tuple(times) == plan.timesteps
    assert plan.posterior_seed == plan.seed ^ 0x9E3779B9
    expected_sigma = 0 if not times else 1 if plan.strength == 1 else sigmas[0]
    assert plan.initial_sigma == expected_sigma
    if solver is not None:
        solver.set_begin_index(begin)
    if not times:
        assert not observed.passes and torch.equal(actual.latents, original)
        return
    with torch.inference_mode():
        noise = torch.randn(
            original.shape,
            dtype=torch.float32,
            device="cpu",
            generator=torch.Generator(device="cpu").manual_seed(plan.seed),
        ).to(device=native.device, dtype=native.dtype)
        latents = expected_sigma * noise + (1 - expected_sigma) * original
        generator = torch.Generator(device=native.device).manual_seed(plan.seed)
        for index, timestep in enumerate(times):
            positive, negative = observed.passes[2 * index : 2 * index + 2]
            for prediction in (positive, negative):
                assert torch.equal(
                    prediction["latents"][..., : original.shape[-2], : original.shape[-1]],
                    latents.cpu(),
                ), "Image source/native clipped history association"
                assert torch.equal(
                    prediction["timestep"], torch.tensor([timestep / 1000], dtype=native.dtype)
                )
            flow = negative["prediction"].to(native.device).float() + plan.guidance_scale * (
                positive["prediction"].to(native.device).float()
                - negative["prediction"].to(native.device).float()
            )
            flow = flow[..., : original.shape[-2], : original.shape[-1]]
            if solver is None:
                latents = (latents.float() + (sigmas[index + 1] - sigmas[index]) * flow).to(
                    native.dtype
                )
            else:
                latents = solver.step(
                    model_output=flow,
                    timestep=solver.timesteps[begin + index],
                    sample=latents,
                    generator=generator,
                ).prev_sample.to(native.dtype)
        assert torch.equal(actual.latents, latents), "Image native solver/seed/history changed"


@pytest.mark.parametrize("method", _METHODS)
def test_anima_regional_image_source_and_sampling_red(
    native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    method: str,
) -> None:
    call = _call(tmp_path / method, main_inputs, method)
    contexts = _context_oracle(call.handoff, native)
    expected_pixels, source = _source_oracle(call, native)
    results: list[Any] = []
    encoded: list[Any] = []
    events: list[tuple[int, int]] = []
    original_execute = regional.execute_captured_anima_plan
    vae_class = cast(Any, type(native.models.vae))
    original_encode = vae_class.encode

    @wraps(original_execute)
    def observe_result(*args: Any, **kwargs: Any) -> Any:
        assert kwargs["source_image"].mode == "RGB"
        result = original_execute(*args, **kwargs)
        results.append(result)
        return result

    @wraps(original_encode)
    def observe_encode(owner: Any, pixels: Any, *args: Any, **kwargs: Any) -> Any:
        if owner is native.models.vae:
            encoded.append(pixels.detach().cpu().clone())
        return original_encode(owner, pixels, *args, **kwargs)

    def progress(step: int, total: int) -> None:
        events.append((step, total))

    with _preserved(native), monkeypatch.context() as patch:
        patch.setattr(regional, "execute_captured_anima_plan", observe_result)
        patch.setattr(vae_class, "encode", observe_encode)
        with _observed(native, patch) as observed:
            done = _execute(call, native, on_progress=progress)
        _published(call, native, done, observed)
        assert len(results) == len(encoded) == 1
        assert native.torch.equal(encoded[0], expected_pixels)
        _native_association(call, native, observed, contexts)
        _solver_oracle(call, native, observed, source, results[0])
    expected = 19 if method == "heun" else 10
    assert events == [(step, expected) for step in range(1, expected + 1)]


@pytest.mark.parametrize("method", _METHODS)
def test_anima_regional_image_ordinary_control_green(
    native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    method: str,
) -> None:
    call = _call(tmp_path / method, main_inputs, method, variant="zero", steps=6)
    with Image.open(io.BytesIO(call.target_bytes)) as source:
        ordinary = generate_anima_flow_sampling(
            anima_sampling_payload(call.command.sampling),
            call.handoff["compiledPrompts"][0]["prompt"],
            call.handoff["compiledPrompts"][1]["prompt"],
            native.models,
            source_image=source.convert("RGB"),
            tokenizers=native.oracle_tokenizers,
        )
    with _preserved(native), _observed(native, monkeypatch) as observed:
        done = _execute(call, native)
    assert _published(call, native, done, observed) == ordinary.image.tobytes()
    assert all(item["mask"] is None for item in observed.processors)


@pytest.mark.parametrize("method", _METHODS)
def test_image_strength_zero_is_original_vae_only_not_a_source_copy(
    native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    method: str,
) -> None:
    call = _call(tmp_path / method, main_inputs, method, strength=0)
    expected_pixels, expected_latents = _source_oracle(call, native)
    results: list[Any] = []
    encoded: list[Any] = []
    events: list[tuple[int, int]] = []
    original = regional.execute_captured_anima_plan
    vae_class = cast(Any, type(native.models.vae))
    original_encode = vae_class.encode

    @wraps(original)
    def execute(*args: Any, **kwargs: Any) -> Any:
        result = original(*args, **kwargs)
        results.append(result)
        return result

    @wraps(original_encode)
    def encode(owner: Any, pixels: Any, *args: Any, **kwargs: Any) -> Any:
        encoded.append(pixels.detach().cpu().clone())
        return original_encode(owner, pixels, *args, **kwargs)

    def progress(step: int, total: int) -> None:
        events.append((step, total))

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        pytest.fail("Zero denoise reached a scheduler factory")

    with _preserved(native), monkeypatch.context() as patch:
        patch.setattr(regional, "execute_captured_anima_plan", execute)
        patch.setattr(regional, "create_anima_native_denoiser", forbidden)
        patch.setattr(vae_class, "encode", encode)
        with _observed(native, patch) as observed:
            done = _execute(call, native, on_progress=progress)
        _published(call, native, done, observed)
        assert len(results) == len(encoded) == 1
        assert native.torch.equal(encoded[0], expected_pixels)
        assert native.torch.equal(results[0].latents, expected_latents)
        assert observed.qwen == observed.conditioner == 0
        assert observed.passes == observed.processors == observed.sdpa == []
        assert len(observed.decoded) == 1 and events == []


@pytest.mark.parametrize("method", _METHODS)
def test_image_full_strength_matches_regional_txt_noise_control(
    native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    method: str,
) -> None:
    image = _call(tmp_path / "image", main_inputs, method, strength=1, steps=3)
    txt_handoff = main_inputs()
    bbox = txt_handoff["recipe"]["bbox"]
    txt_handoff["sampling"] = _flow_inputs(
        scheduler=method,
        width=bbox["width"],
        height=bbox["height"],
        seed=txt_handoff["recipe"]["item"]["seed"],
        steps=3,
        guidanceScale=3,
    )["plan"]
    txt = _command(tmp_path / "text", txt_handoff)
    pixels: list[bytes] = []
    with _preserved(native):
        with _observed(native, monkeypatch) as observed:
            done = _execute(image, native)
        pixels.append(_published(image, native, done, observed))
        with _observed(native, monkeypatch) as observed:
            done = regional.generate_current_canvas_regional_anima_txt2img(
                txt.handoff["recipe"],
                command=txt.command,
                compiled_prompts=txt.handoff["compiledPrompts"],
                models=native.models,
                runtime=native.runtime,
                profile=native.profile,
                tokenizers=native.tokenizers,
                sampling_profile=_PROFILE,
            )
        pixels.append(_published(txt, native, done, observed))
    assert pixels[0] == pixels[1]


@pytest.mark.parametrize(
    "change", ["txt-command", "outpaint-command", "txt-plan", "img-to-txt", "default-heun"]
)
def test_image_exact_mode_and_subclass_refusals_precede_model_work(
    main_inputs: _Producer,
    tmp_path: Path,
    change: str,
) -> None:
    call = _call(tmp_path / change, main_inputs)
    command: GenerateAnimaTxt2ImgCommand = call.command
    target = regional.generate_current_canvas_regional_anima_img2img
    arguments: dict[str, Any] = {"sampling_profile": _PROFILE}
    if change == "txt-command":
        command = GenerateAnimaTxt2ImgCommand(**vars(command))
    elif change == "outpaint-command":
        command = GenerateAnimaOutpaintCommand(
            **vars(command), conditioning=cast(Any, None), infill_resource=cast(Any, None)
        )
    elif change == "txt-plan":
        command = replace(
            command, sampling=validate_anima_flow_sampling_plan(main_inputs()["sampling"])
        )
    elif change == "img-to-txt":
        target = cast(Any, regional.generate_current_canvas_regional_anima_txt2img)
    else:
        arguments = {}
    with pytest.raises(DerivativeError) as error:
        target(
            call.handoff["recipe"],
            command=cast(Any, command),
            compiled_prompts=call.handoff["compiledPrompts"],
            models=cast(Any, None),
            runtime=cast(Any, None),
            profile="cpu-float32-v1",
            **arguments,
        )
    assert error.value.code == "INVALID_REQUEST" and not command.output_path.exists()


def _wire(tmp_path: Path, call: _Call) -> _WireCase:
    case = _case(tmp_path, call.handoff)
    request = case.bundle["request"]
    request["type"] = "generate-anima-img2img"
    target = Path(request["job"]["target"]["path"])
    target.write_bytes(call.target_bytes)
    request["job"]["target"].update(_descriptor(target))
    case.seal()
    return case


@pytest.mark.parametrize("method", _METHODS)
def test_public_image_parser_dispatches_the_exact_opaque_mode_and_frozen_progress(
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    method: str,
) -> None:
    call = _call(tmp_path / "source", main_inputs, method)
    case = _wire(tmp_path / "wire", call)
    case.wire["reportProgress"] = True
    captured = worker.parse_anima_regional_request(case.wire)
    assert type(captured.command) is GenerateAnimaImg2ImgCommand
    assert captured.command.sampling == call.command.sampling
    models = SimpleNamespace(
        **{
            name: SimpleNamespace(eval=lambda: None)
            for name in ("transformer", "text_conditioner", "qwen3_encoder", "vae")
        }
    )
    loads: list[object] = []

    def load(bundle: Any, **kwargs: Any) -> Any:
        assert bundle == captured.command.bundle and kwargs["device"] == "cuda"
        loads.append(bundle)
        return models

    def generate(recipe: Any, **kwargs: Any) -> dict[str, object]:
        assert recipe == captured.recipe and kwargs["models"] is models
        assert type(kwargs["command"]) is GenerateAnimaImg2ImgCommand
        assert kwargs["sampling_profile"] == (None if method == "euler" else _PROFILE)
        for index in range(captured.command.sampling.total_steps):
            kwargs["on_progress"](index + 1, captured.command.sampling.total_steps)
        return {"type": "generation-done", "requestId": captured.command.request_id}

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        pytest.fail("Opaque image was routed to the TXT owner")

    monkeypatch.setattr(worker, "load_anima_models", load)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_anima_img2img", generate)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_anima_txt2img", forbidden)
    events: list[tuple[int, int]] = []

    def progress(step: int, total: int) -> None:
        events.append((step, total))

    result = worker.execute_anima_regional_request(
        case.wire, config_dir=tmp_path, runtime=_runtime(), on_progress=progress
    )
    assert len(loads) == 1 and result["requestId"] == captured.command.request_id
    assert events == [
        (step, captured.command.sampling.total_steps)
        for step in range(1, captured.command.sampling.total_steps + 1)
    ]


@pytest.mark.parametrize(
    "change", ["transparent", "partial", "rgb", "hash", "size", "mode", "posterior", "sigma"]
)
def test_public_image_target_and_plan_refusals_precede_loading(
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    change: str,
) -> None:
    call = _call(tmp_path / "source", main_inputs)
    case = _wire(tmp_path / "wire", call)
    target = Path(case.bundle["request"]["job"]["target"]["path"])
    descriptor = case.bundle["request"]["job"]["target"]
    if change in ("transparent", "partial", "rgb"):
        image = _pixels(
            call.command.width, call.command.height, 0 if change == "transparent" else 127
        )
        if change == "rgb":
            image = image.convert("RGB")
        image.save(target, format="PNG", icc_profile=SRGB_ICC_PROFILE)
        descriptor.update(_descriptor(target))
    elif change == "hash":
        descriptor["sha256"] = "0" * 64
    elif change == "size":
        descriptor["byteSize"] += 1
    else:
        sampling = case.bundle["request"]["job"]["sampling"]
        if change == "mode":
            sampling["mode"] = "txt2img"
        elif change == "posterior":
            sampling["posteriorSeed"] ^= 1
        else:
            sampling["initialSigma"] = 1
    case.seal()

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        pytest.fail("Invalid opaque target/plan reached model loading")

    monkeypatch.setattr(worker, "load_anima_models", forbidden)
    with pytest.raises(DerivativeError):
        worker.execute_anima_regional_request(case.wire, config_dir=tmp_path, runtime=_runtime())
    assert not (case.root / "output.png").exists()


def test_image_capability_depends_on_the_existing_complete_anima_compute_probe() -> None:
    for runtime, expected in ((None, False), (_runtime(bf16=False), False), (_runtime(), True)):
        capabilities = cast(
            list[str], inference_main.inference_ready_message(runtime)["capabilities"]
        )
        assert (worker.ANIMA_REGIONAL_IMG2IMG_CAPABILITY in capabilities) is expected
        if expected:
            assert {
                worker.ANIMA_REGIONAL_CAPABILITY,
                worker.ANIMA_REGIONAL_SAMPLING_CAPABILITY,
                "anima-img2img",
            } <= set(capabilities)


@pytest.mark.parametrize("stage", ["encode", "corrector", "progress", "decode", "publication"])
def test_image_failure_preserves_source_models_rng_and_recovers(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    stage: str,
) -> None:
    baseline = _call(tmp_path / "baseline", main_inputs, steps=6)
    with _preserved(cpu_native), _observed(cpu_native, monkeypatch) as observed:
        done = _execute(baseline, cpu_native)
    expected = _published(baseline, cpu_native, done, observed)
    failed = _call(tmp_path / "failed", main_inputs, steps=6)
    sentinel = RuntimeError(f"declared image {stage} failure")
    events: list[tuple[int, int]] = []

    def progress(step: int, total: int) -> None:
        events.append((step, total))
        if stage == "progress" and step == 2:
            raise sentinel

    with _preserved(cpu_native):
        with monkeypatch.context() as patch:
            if stage in ("encode", "decode", "corrector"):
                model = (
                    cpu_native.models.transformer if stage == "corrector" else cpu_native.models.vae
                )
                attribute = "forward" if stage == "corrector" else stage
                owner = cast(Any, type(model))
                original = getattr(owner, attribute)
                count = 0

                @wraps(original)
                def fail(self: Any, *args: Any, **kwargs: Any) -> Any:
                    nonlocal count
                    if self is model:
                        count += 1
                        if count == (3 if stage == "corrector" else 1):
                            raise sentinel
                    return original(self, *args, **kwargs)

                patch.setattr(owner, attribute, fail)
            elif stage == "publication":

                def fail_publish(*_args: Any, **_kwargs: Any) -> Any:
                    raise sentinel

                patch.setattr(regional, "publish_generation_image", fail_publish)
            with pytest.raises(BaseException) as error:
                _execute(failed, cpu_native, on_progress=progress)
            assert _contains_cause(error.value, sentinel)
        assert not failed.command.output_path.exists()
        assert failed.command.target_path.read_bytes() == failed.target_bytes
        recovery = _call(tmp_path / "recovery", main_inputs, steps=6)
        with _observed(cpu_native, monkeypatch) as recovered:
            done = _execute(recovery, cpu_native)
        assert _published(recovery, cpu_native, done, recovered) == expected
    if stage == "progress":
        assert events == [(1, 5), (2, 5)]
