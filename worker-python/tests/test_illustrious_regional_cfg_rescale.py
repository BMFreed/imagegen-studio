"""Authored CFG Rescale consumption contracts; ROOT alone imports and executes.

InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd is the consulted source:
backend/stable_diffusion/extensions/rescale_cfg.py, diffusion_backend.py:step,
app/invocations/sd/denoise_latents.py and generation/core/graph.ts. It applies
per-image standard-deviation rescaling after CFG combination and before the
original scheduler. The existing pinned SDXL adapter supplies that same order.
There is no alternate diffusion loop, clamp, precision repair or scheduler here.

The independent numerical oracle uses the original UNet's two signed predictions,
not the already combined scheduler input. Original scheduler primitives separately
check each transition and DPM history. Consumption assertions follow actual PNG
publication and independent quantization of that request's original native PT.
Forcing the subject's rescale argument to zero must turn the named target RED;
the zero/ordinary-native control remains GREEN. No trained-quality claim follows.

Small complete Python recipe/model fixtures are setup, not genuine Main evidence.
Borrowed-state/RNG/reservation checks start after intentional owned preparation.
Authorship is limited to AST/Ruff; runtime and isolated mutations belong to ROOT.
"""

from __future__ import annotations

import importlib
import inspect
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from dataclasses import replace
from functools import wraps
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest

from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.protocol import IllustriousNoiseProfile
from test_illustrious_regional_dpmpp_2m import (
    CPU_ENCODING,
    CUDA_ENCODING,
    CUDA_VAE,
    _dpm_case,  # pyright: ignore[reportPrivateUsage]
    _ordinary_oracle,  # pyright: ignore[reportPrivateUsage]
    _resource_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_embeddings import (
    _models,  # pyright: ignore[reportPrivateUsage]
    _no_native,  # pyright: ignore[reportPrivateUsage]
    _with_resources,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_invoke_initialization import (
    _failure,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _assert_png,  # pyright: ignore[reportPrivateUsage]
    _case,  # pyright: ignore[reportPrivateUsage]
    _generate,  # pyright: ignore[reportPrivateUsage]
    _quantized_bytes,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _observe as _output_observe,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_vae import (
    _assert_published as _assert_vae_png,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_vae import (
    _case as _vae_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_vae import (
    _generate as _generate_vae,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_vae import (
    _observe as _vae_observe,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_vae import (
    _prepare as _prepare_vae,  # pyright: ignore[reportPrivateUsage]
)

MODES = ("euler", "euler_a", "dpmpp_2m", "dpmpp_2m_k")
_INVALID = (
    pytest.param(False, id="false"),
    pytest.param(True, id="true"),
    pytest.param(None, id="none"),
    pytest.param(float("nan"), id="nan"),
    pytest.param(float("inf"), id="infinity"),
    pytest.param(float("-inf"), id="negative-infinity"),
    pytest.param(-0.01, id="negative"),
    pytest.param(1.0, id="one"),
    pytest.param(0.9900001, id="above-operational-bound"),
    pytest.param("0.7", id="string"),
)


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


def _public_case(
    tmp_path: Path,
    native: Any,
    *,
    mode: str = "dpmpp_2m_k",
    multiplier: Any = 0.7,
    regional: bool = True,
    name: str = "stage",
) -> Any:
    recipe = _with_resources(_recipe(*((_region(),) if regional else ())))
    case = _dpm_case(tmp_path, native, recipe=recipe, name=name)
    case.command = replace(case.command, scheduler=mode, cfg_rescale=multiplier)
    case.args["profile"] = CUDA_ENCODING if native.device == "cuda" else CPU_ENCODING
    if mode == "euler":
        case.args["denoising_profile"] = (
            "ordinary-canvas-euler-txt2img-cuda-fp16-v2"
            if native.device == "cuda"
            else "ordinary-canvas-euler-txt2img-cpu-v2"
        )
    elif mode == "euler_a":
        case.args["denoising_profile"] = (
            "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cuda-fp16-v1"
            if native.device == "cuda"
            else "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cpu-v1"
        )
    return case


def _sample(result: Any) -> Any:
    return cast(Any, result[0] if isinstance(result, tuple) else result.sample)


def _previous(result: Any) -> Any:
    return cast(Any, result[0] if isinstance(result, tuple) else result.prev_sample)


def _history(scheduler: Any) -> tuple[Any, ...]:
    return tuple(
        None if value is None else value.detach().clone()
        for value in getattr(scheduler, "model_outputs", ())
    )


def _same_history(torch: Any, actual: tuple[Any, ...], expected: tuple[Any, ...]) -> None:
    assert len(actual) == len(expected)
    for left, right in zip(actual, expected, strict=True):
        if right is None:
            assert left is None
        else:
            assert left is not None and torch.equal(left, right)


@contextmanager
def _observe_cfg(native: Any, seen: Any, monkeypatch: pytest.MonkeyPatch) -> Generator[None]:
    """Snapshot real inputs/results; all methods delegate their original return."""
    unet = native.pipeline.unet
    unet_type = cast(Any, type(unet))
    forward = unet_type.forward
    classes = (
        native.diffusers.EulerDiscreteScheduler,
        native.diffusers.EulerAncestralDiscreteScheduler,
        native.diffusers.DPMSolverMultistepScheduler,
    )
    seen.cfg_raw, seen.cfg_steps = [], []

    @wraps(forward)
    def raw(current: Any, *args: Any, **kwargs: Any) -> Any:
        result = forward(current, *args, **kwargs)
        if current is unet:
            seen.cfg_raw.append(_sample(result).detach().clone())
        return result

    def observe_step(original: Any) -> Any:
        @wraps(original)
        def step(current: Any, *args: Any, **kwargs: Any) -> Any:
            bound = inspect.signature(original).bind(current, *args, **kwargs)
            bound.apply_defaults()
            values = bound.arguments
            generator = values.get("generator")
            record = SimpleNamespace(
                scheduler=current,
                prediction=values["model_output"].detach().clone(),
                sample=values["sample"].detach().clone(),
                timestep=values["timestep"].detach().clone(),
                raw_count=len(seen.cfg_raw),
                history_before=_history(current),
                lower_before=getattr(current, "lower_order_nums", None),
                rng_before=None if generator is None else generator.get_state().clone(),
                generator=generator,
            )
            if type(current) is native.diffusers.DPMSolverMultistepScheduler:
                # The reused VAE/publication observer counts Euler/Euler-a
                # itself. Record the additionally observed original DPM call
                # in that same lifecycle view, without replacing its result.
                seen.steps.append(record)
                seen.events.append("step")
            result = original(current, *args, **kwargs)
            record.result = _previous(result).detach().clone()
            record.history_after = _history(current)
            record.lower_after = getattr(current, "lower_order_nums", None)
            record.rng_after = None if generator is None else generator.get_state().clone()
            seen.cfg_steps.append(record)
            return result

        return step

    with monkeypatch.context() as patch:
        patch.setattr(unet_type, "forward", raw)
        for cls in classes:
            patch.setattr(cls, "step", observe_step(cls.step))
        yield


def _reference_scheduler(native: Any, command: Any) -> Any:
    """Literal native construction, independent of Studio's scheduler selector."""
    policy = command.noise_profile
    assert type(policy) is IllustriousNoiseProfile
    options = {
        "num_train_timesteps": 1000,
        "beta_start": 0.00085,
        "beta_end": 0.012,
        "beta_schedule": "scaled_linear",
        "trained_betas": None,
        "steps_offset": 1,
        "timestep_spacing": policy.timestep_spacing,
        "rescale_betas_zero_snr": policy.rescale_betas_zero_snr,
        "prediction_type": "epsilon",
    }
    if command.scheduler == "euler":
        return native.diffusers.EulerDiscreteScheduler(**options)
    if command.scheduler == "euler_a":
        return native.diffusers.EulerAncestralDiscreteScheduler(**options)
    return native.diffusers.DPMSolverMultistepScheduler(
        **options,
        algorithm_type="dpmsolver++",
        solver_order=2,
        use_karras_sigmas=command.scheduler == "dpmpp_2m_k",
    )


def _invoke_oracle(torch: Any, raw: Any, scale: float, multiplier: float) -> tuple[Any, Any]:
    """Independent signed prediction arithmetic, retaining actual dtype/order."""
    negative, positive = raw.chunk(2)
    guided = negative + scale * (positive - negative)
    if multiplier == 0:
        return guided, guided
    positive_std = torch.std(positive, dim=(1, 2, 3), keepdim=True)
    guided_std = torch.std(guided, dim=(1, 2, 3), keepdim=True)
    rescaled = guided * (positive_std / guided_std)
    return multiplier * rescaled + (1.0 - multiplier) * guided, guided


def _assert_consumed(native: Any, case: Any, seen: Any) -> None:
    """Run only after publication; inspect native consumption before metadata."""
    torch, command = native.torch, case.command
    assert len(seen.cfg_raw) == len(seen.cfg_steps) == command.steps
    assert len(seen.pipeline_results) == len(seen.pipelines) == 1
    device = torch.device("cuda:0" if native.device == "cuda" else "cpu")
    reference = _reference_scheduler(native, command)
    reference.set_timesteps(command.steps, device=device)
    reference.set_begin_index(0)
    scheduler = seen.cfg_steps[0].scheduler
    assert scheduler is seen.schedulers[0] and scheduler is not native.pipeline.scheduler
    assert type(scheduler) is type(reference)
    assert torch.equal(scheduler.timesteps, reference.timesteps)
    assert torch.equal(scheduler.sigmas, reference.sigmas)
    generator = torch.Generator(
        device=device if command.scheduler != "euler" else "cpu"
    ).manual_seed(command.seed ^ 0xFFFFFFFF if command.scheduler != "euler" else command.seed)
    if command.scheduler == "euler":
        # The deterministic Euler primitive does not consume this already-used
        # initial-noise generator. Preserve its actual state without pretending
        # that it is Invoke's separate ancestral/DPM generator.
        generator.set_state(seen.cfg_steps[0].rng_before)
    changed = False
    for index, (raw, record, root) in enumerate(
        zip(seen.cfg_raw, seen.cfg_steps, seen.root_inputs, strict=True)
    ):
        assert record.raw_count == index + 1
        assert raw.shape == (2, 4, 2, 3) and raw.dtype == native.dtype
        expected, guided = _invoke_oracle(torch, raw, command.cfg_scale, command.cfg_rescale)
        assert bool(torch.isfinite(expected).all())
        assert torch.equal(record.prediction, expected), (
            "native scheduler input lost Invoke CFG rescale"
        )
        changed = changed or not torch.equal(expected, guided)
        timestep = reference.timesteps[index]
        assert record.timestep.dtype == timestep.dtype and torch.equal(record.timestep, timestep)
        assert torch.equal(root["timestep"], timestep)
        duplicated = torch.cat((record.sample, record.sample))
        scaled = reference.scale_model_input(duplicated, timestep)
        assert torch.equal(root["sample"], scaled)
        _same_history(torch, record.history_before, _history(reference))
        assert record.lower_before == getattr(reference, "lower_order_nums", None)
        assert record.rng_before is not None and record.rng_after is not None
        assert torch.equal(record.rng_before, generator.get_state())
        expected_next = reference.step(
            expected, timestep, record.sample, generator=generator, return_dict=False
        )[0]
        assert torch.equal(record.result, expected_next), (
            "original scheduler transition lost rescaled prediction/history"
        )
        _same_history(torch, record.history_after, _history(reference))
        assert record.lower_after == getattr(reference, "lower_order_nums", None)
        assert torch.equal(record.rng_after, generator.get_state())
        if index + 1 < command.steps:
            assert torch.equal(seen.cfg_steps[index + 1].sample, record.result)
    assert changed is (command.cfg_rescale > 0), "fixture did not discriminate rescale from CFG"
    assert seen.pipeline_inputs[0]["guidance_rescale"] == command.cfg_rescale
    assert len(seen.decodes) == 1 and seen.decode_reserved == [True]
    assert len(seen.builds) == (2 if case.recipe["regions"] else 1)
    assert "prepare_latents" not in vars(seen.pipelines[0])
    assert "prepare_extra_step_kwargs" not in vars(seen.pipelines[0])


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("multiplier", (0.7, 0.99))
def test_public_regional_rescale_reaches_all_original_scheduler_families(
    tmp_path: Path,
    lane: Any,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    multiplier: float,
) -> None:
    output = importlib.import_module("imagegen_worker.illustrious_regional_output")
    case = _public_case(tmp_path, lane, mode=mode, multiplier=multiplier)
    with _output_observe(output, lane, monkeypatch) as seen, _observe_cfg(lane, seen, monkeypatch):
        done = _generate(output, lane, case)
    _assert_png(lane, case, seen, done)
    _assert_consumed(lane, case, seen)


def test_regional_cfg_rescale_consumption_mutation_red(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Forced-zero subject still publishes; the native-input oracle must fail."""
    output = importlib.import_module("imagegen_worker.illustrious_regional_output")
    case = _public_case(tmp_path, lane, multiplier=0.7)
    with _output_observe(output, lane, monkeypatch) as seen, _observe_cfg(lane, seen, monkeypatch):
        done = _generate(output, lane, case)
    _assert_png(lane, case, seen, done)
    _assert_consumed(lane, case, seen)


def test_regional_cfg_rescale_zero_control_green(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Genuine empty-region recipe also matches a separate original native loop."""
    output = importlib.import_module("imagegen_worker.illustrious_regional_output")
    case = _public_case(tmp_path, lane, multiplier=0.0, regional=False)
    assert case.recipe["regions"] == []
    with _output_observe(output, lane, monkeypatch) as seen, _observe_cfg(lane, seen, monkeypatch):
        done = _generate(output, lane, case)
    pixels = _assert_png(lane, case, seen, done)
    _assert_consumed(lane, case, seen)
    expected = _ordinary_oracle(lane, case, seen)
    assert lane.torch.equal(seen.pipeline_results[0].images, expected.images)
    assert pixels == _quantized_bytes(lane, expected.images)


@pytest.mark.parametrize("invalid", _INVALID)
def test_public_cfg_rescale_invalid_value_refuses_before_model_work(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch, invalid: Any
) -> None:
    output = importlib.import_module("imagegen_worker.illustrious_regional_output")
    case = _public_case(tmp_path, cpu, multiplier=invalid)
    with (
        _no_native(cpu, monkeypatch) as hits,
        pytest.raises(cpu.denoising.IllustriousRegionalDenoisingError) as caught,
    ):
        _generate(output, cpu, case)
    assert caught.value.code == "INPUT_INVALID"
    assert (
        str(caught.value)
        == "Invoke Canvas requires finite CFG rescale in [0,0.99], excluding bool."
    )
    assert hits == []
    assert set(case.root.iterdir()) == {case.target}


def test_private_historical_profiles_keep_their_zero_only_refusal(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    output = importlib.import_module("imagegen_worker.illustrious_regional_output")
    case = _case(tmp_path, lane, recipe=_recipe(_region()))
    case.command = replace(case.command, cfg_rescale=0.7)
    with (
        _no_native(lane, monkeypatch) as hits,
        pytest.raises(lane.denoising.IllustriousRegionalDenoisingError) as caught,
    ):
        _generate(output, lane, case)
    assert caught.value.code == "UNSUPPORTED"
    assert str(caught.value) == "This first denoising profile requires CFG rescale zero."
    assert hits == [] and set(case.root.iterdir()) == {case.target}


@pytest.mark.parametrize("stage", ("unet", "decode", "publication"))
def test_nonzero_rescale_failure_restores_and_fresh_publication_recovers(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch, stage: str
) -> None:
    output = importlib.import_module("imagegen_worker.illustrious_regional_output")
    case = _public_case(tmp_path, cpu)
    sentinel = (
        OSError("authored rescale publisher directory-sync failure")
        if stage == "publication"
        else RuntimeError(f"authored rescale failure after original {stage}")
    )
    with (
        _failure(cpu, monkeypatch, stage, sentinel) as calls,
        _output_observe(output, cpu, monkeypatch) as failed,
        _observe_cfg(cpu, failed, monkeypatch),
        pytest.raises((RuntimeError, DerivativeError)) as caught,
    ):
        _generate(output, cpu, case)
    assert len(calls) == (2 if stage == "unet" else 1)
    if stage == "publication":
        assert isinstance(caught.value, DerivativeError)
        assert (
            caught.value.code == "GENERATION_WORKER_FAILED" and caught.value.__cause__ is sentinel
        )
    else:
        assert caught.value is sentinel
    assert failed.receipts == [] and not case.command.output_path.exists()
    assert set(case.root.iterdir()) == {case.target}
    assert "prepare_latents" not in vars(failed.pipelines[0])
    assert "prepare_extra_step_kwargs" not in vars(failed.pipelines[0])
    with (
        _output_observe(output, cpu, monkeypatch) as recovered,
        _observe_cfg(cpu, recovered, monkeypatch),
    ):
        done = _generate(output, cpu, case)
    _assert_png(cpu, case, recovered, done)
    _assert_consumed(cpu, case, recovered)


def test_zero_variance_native_guidance_refuses_without_clamping_and_recovers(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A named finite raw-output fault reaches the original undefined std ratio."""
    output = importlib.import_module("imagegen_worker.illustrious_regional_output")
    case = _public_case(tmp_path, lane)
    cls = cast(Any, type(lane.pipeline.unet))
    forward = cls.forward
    with monkeypatch.context() as patch:

        @wraps(forward)
        def constant(current: Any, *args: Any, **kwargs: Any) -> Any:
            result = forward(current, *args, **kwargs)
            if current is lane.pipeline.unet:
                # Only the original returned ephemeral tensor is faulted; no
                # borrowed model/tensor/configuration receives a write.
                _sample(result).fill_(1)
            return result

        patch.setattr(cls, "forward", constant)
        with (
            _output_observe(output, lane, monkeypatch) as failed,
            _observe_cfg(lane, failed, monkeypatch),
            pytest.raises(lane.denoising.IllustriousRegionalDenoisingError) as caught,
        ):
            _generate(output, lane, case)
    assert caught.value.code == "INPUT_INVALID" and str(caught.value) == "sample must be finite."
    assert len(failed.cfg_raw) == len(failed.cfg_steps) == 1
    assert lane.torch.equal(failed.cfg_raw[0], lane.torch.ones_like(failed.cfg_raw[0]))
    assert not bool(lane.torch.isfinite(failed.cfg_steps[0].prediction).all())
    assert failed.receipts == failed.publications == []
    assert set(case.root.iterdir()) == {case.target}
    with (
        _output_observe(output, lane, monkeypatch) as recovered,
        _observe_cfg(lane, recovered, monkeypatch),
    ):
        done = _generate(output, lane, case)
    _assert_png(lane, case, recovered, done)
    _assert_consumed(lane, case, recovered)


def test_nonzero_rescale_consumes_real_ti_on_a_prepared_lora_source(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    with _models("cpu") as native:
        output = importlib.import_module("imagegen_worker.illustrious_regional_output")
        case = _resource_case(tmp_path, native, mode="dpmpp_2m_k")
        case.command = replace(case.command, cfg_rescale=0.7)
        loader = importlib.import_module(
            "diffusers.loaders.textual_inversion"
        ).TextualInversionLoaderMixin
        original = loader.load_textual_inversion
        loaded: list[tuple[int, int]] = []

        @wraps(original)
        def install(current: Any, *args: Any, **kwargs: Any) -> Any:
            result = original(current, *args, **kwargs)
            encoder, tokenizer = kwargs["text_encoder"], kwargs["tokenizer"]
            assert current is not native.pipeline
            assert encoder not in (native.pipeline.text_encoder, native.pipeline.text_encoder_2)
            for alias, rows in zip(kwargs["token"], args[0], strict=True):
                ids = [
                    tokenizer.convert_tokens_to_ids(alias if index == 0 else f"{alias}_{index}")
                    for index in range(rows.shape[0])
                ]
                assert native.torch.equal(encoder.get_input_embeddings().weight[ids], rows)
            loaded.append((encoder.config.hidden_size, len(kwargs["token"])))
            return result

        with monkeypatch.context() as patch:
            patch.setattr(loader, "load_textual_inversion", install)
            with (
                _output_observe(output, native, monkeypatch) as seen,
                _observe_cfg(native, seen, monkeypatch),
            ):
                done = _generate(output, native, case)
        _assert_png(native, case, seen, done)
        _assert_consumed(native, case, seen)
        assert loaded == [(768, 2), (1280, 2)]
        assert (
            case.recipe["globalEmbeddings"]["positive"]
            != case.recipe["regions"][0]["embeddings"]["positive"]
        )


def test_nonzero_rescale_retains_selected_fp32_vae_latent_decode_owner(
    tmp_path: Path, cuda: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    original_vae = cuda.pipeline.vae
    try:
        case = _vae_case(cuda, tmp_path, "FP32", external=True)
        case.args["denoising_profile"] = CUDA_VAE
        case.command = replace(case.command, scheduler="dpmpp_2m_k", steps=4, cfg_rescale=0.7)
        _prepare_vae(cuda, case.command, native_upcast=False)
        with _vae_observe(cuda, monkeypatch) as seen, _observe_cfg(cuda, seen, monkeypatch):
            done = _generate_vae(cuda, case)
        _assert_vae_png(cuda, case, seen, done)
        _assert_consumed(cuda, case, seen)
        assert seen.pipeline_inputs[0]["output_type"] == "latent"
        assert seen.original_outputs[0].images.dtype == cuda.torch.float32
    finally:
        cuda.pipeline.vae = original_vae


def test_regional_cfg_rescale_capability_is_explicit_and_additive() -> None:
    module = importlib.import_module("imagegen_worker.inference_main")
    capabilities = cast(list[str], module.inference_ready_message()["capabilities"])
    assert "illustrious-regional-cfg-rescale-v1" in capabilities
    assert "illustrious-cfg-rescale" in capabilities
    assert "illustrious-regional-invoke-v1" in capabilities
    assert "illustrious-regional-dpmpp-2m-v1" in capabilities
