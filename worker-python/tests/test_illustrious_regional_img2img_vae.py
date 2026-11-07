"""Prepared private IMG VAE consumption; ROOT alone imports and executes.

InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd sources read directly:
frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts
(addEncodeNode/graftImageToImage and caller), app/invocations/vae/
image_to_latents.py::vae_encode/_encode_to_tensor and latents_to_image.py.
The source is cast directly to VAE compute dtype, sampled by the original
posterior, scaled in that dtype, then cast to denoiser dtype. Decode casts the
raw terminal latent before inverse scaling. Studio retains its independently
seeded CPU posterior and image-noise streams; whole-Invoke byte parity is not
asserted.

Original native methods supply all observations and transitions. Numeric
consumption assertions run after the genuine exclusive PNG publication. The
named early-latent-cast mutation must therefore turn semantic RED after native
encode/denoise/decode/publication, while the old FP16 image control stays GREEN.
Tiny complete Python recipes/models prove private mechanics, not Main origin,
trained capacity, public selected-VAE IMG admission or visual quality. No
production dispatcher/capability, schema, loader or diffusion loop is replaced.
Authorship permits AST/Ruff only; ROOT owns typing, imports and native runs.
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
from PIL import Image

from imagegen_worker import generation_artifacts
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from test_illustrious_regional_cfg_rescale import (
    _history,  # pyright: ignore[reportPrivateUsage]
    _invoke_oracle,  # pyright: ignore[reportPrivateUsage]
    _observe_cfg,  # pyright: ignore[reportPrivateUsage]
    _reference_scheduler,  # pyright: ignore[reportPrivateUsage]
    _same_history,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_embeddings import (
    _models,  # pyright: ignore[reportPrivateUsage]
    _no_native,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
    _with_resources,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _assert_source_and_schedule as _assert_legacy,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _case as _image_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _clone,  # pyright: ignore[reportPrivateUsage]
    _generate,  # pyright: ignore[reportPrivateUsage]
    _parameters,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _observe as _image_observe,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _ordinary as _ordinary_legacy,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _png as _legacy_png,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _aliases,  # pyright: ignore[reportPrivateUsage]
    _quantized_bytes,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_vae import (
    ENCODING,
    POLICIES,
    _prepare,  # pyright: ignore[reportPrivateUsage]
    _save_vae,  # pyright: ignore[reportPrivateUsage]
)

SCHEDULES = ("euler", "euler_a", "dpmpp_2m", "dpmpp_2m_k")
PROFILES = {
    "euler": "ordinary-canvas-euler-img2img-cuda-vae-v1",
    "euler_a": "ordinary-canvas-euler-ancestral-img2img-cuda-vae-v1",
    "dpmpp_2m": "ordinary-canvas-dpmpp-2m-img2img-cuda-vae-v1",
    "dpmpp_2m_k": "ordinary-canvas-dpmpp-2m-img2img-cuda-vae-v1",
}


@pytest.fixture
def cuda() -> Iterator[Any]:
    # Each case starts with a fresh owned graph. Preparation precedes borrowing.
    with _models("cuda") as native:
        yield native


@pytest.fixture
def output() -> Any:
    return importlib.import_module("imagegen_worker.illustrious_regional_output")


def _case(
    tmp_path: Path,
    native: Any,
    *,
    scheduler: str = "euler",
    precision: str = "FP32",
    native_upcast: bool = False,
    external: bool = False,
    strength: float = 0.5,
    name: str = "prepared-image",
) -> Any:
    recipe = _with_resources(_recipe(_region()))
    case = _image_case(tmp_path, native, recipe=recipe, strength=strength, name=name)
    descriptor = None
    if external:
        descriptor, _, model = _save_vae(native, tmp_path, marker=0.125)
        native.pipeline.vae = model
    case.command = replace(
        case.command,
        scheduler=scheduler,
        vae=descriptor,
        vae_precision=precision,
        cfg_rescale=0.7,
    )
    case.args["profile"] = ENCODING
    case.args["denoising_profile"] = PROFILES[scheduler]
    case.vae_dtype = _prepare(native, _parameters(case), native_upcast=native_upcast)
    return case


@contextmanager
def _observe(output: Any, native: Any, monkeypatch: pytest.MonkeyPatch) -> Generator[Any]:
    """Delegate native IMG/encoder/posterior, selected schedulers and final return."""
    torch = native.torch
    classes = (
        native.diffusers.EulerDiscreteScheduler,
        native.diffusers.EulerAncestralDiscreteScheduler,
        native.diffusers.DPMSolverMultistepScheduler,
    )
    with _image_observe(output, native, monkeypatch) as seen:
        seen.events = []  # Shared DPM observer also journals its original transition.
        seen.final_outputs, seen.prepared_noises = [], []
        with _observe_cfg(native, seen, monkeypatch), monkeypatch.context() as patch:
            entry = output.run_current_canvas_regional_denoising

            @wraps(entry)
            def decoded_return(*args: Any, **kwargs: Any) -> Any:
                result = entry(*args, **kwargs)
                seen.final_outputs.append((result, result.images.detach().clone()))
                return result

            def observe_noise(original: Any) -> Any:
                @wraps(original)
                def added(current: Any, *args: Any, **kwargs: Any) -> Any:
                    bound = inspect.signature(original).bind(current, *args, **kwargs)
                    result = original(current, *args, **kwargs)
                    seen.prepared_noises.append(
                        SimpleNamespace(
                            scheduler=current,
                            values=_clone(dict(bound.arguments), torch),
                            result=result.detach().clone(),
                        )
                    )
                    return result

                return added

            for cls in classes:
                patch.setattr(cls, "add_noise", observe_noise(cls.add_noise))
            with _aliases(patch, entry, decoded_return):
                yield seen


def _png(native: Any, case: Any, seen: Any, done: Any) -> bytes:
    """Check the actual decoded return, not the earlier native latent record."""
    assert len(seen.final_outputs) == len(seen.publications) == len(seen.receipts) == 1
    assert len(seen.calls) == len(seen.results) == len(seen.entries) == 1
    final, saved = seen.final_outputs[0]
    assert native.torch.equal(final.images, saved)
    expected = _quantized_bytes(native, saved)
    with Image.open(case.command.output_path) as reopened:
        reopened.load()
        assert reopened.format == "PNG" and reopened.mode == "RGB"
        assert reopened.size == case.source.size
        assert reopened.info["icc_profile"] == SRGB_ICC_PROFILE
        assert reopened.tobytes() == expected
    assert seen.publications[0][0] == expected
    assert done is seen.receipts[0]
    assert done["type"] == "generation-done"
    assert done["requestId"] == case.command.request_id
    assert done["outputPath"] == str(case.command.output_path)
    assert done["seed"] == case.command.seed
    assert not list(case.root.glob(".*.tmp"))
    return expected


def _assert_consumed(native: Any, case: Any, seen: Any) -> None:
    """Independent Invoke cast order and original native transition/decode oracles."""
    torch, command = native.torch, case.command
    numpy = pytest.importorskip("numpy")
    fresh, options = seen.calls[0]
    assert fresh is not native.pipeline and fresh.vae is native.pipeline.vae
    assert fresh.unet is native.pipeline.unet
    assert "prepare_latents" not in vars(fresh), "fresh encoder slot was not restored"
    assert "prepare_extra_step_kwargs" not in vars(fresh)
    assert len(seen.encodes) == len(seen.posteriors) == len(seen.decodes) == 1
    assert options["output_type"] == "latent"
    assert options["strength"] == command.denoising_strength
    assert options["guidance_rescale"] == command.cfg_rescale
    assert len(seen.builds) == 1 + len(case.recipe["regions"])
    assert seen.validations[0][1].tobytes() == case.source.tobytes()
    assert seen.entries[0][1]["image"] is seen.validations[0][1]
    assert seen.calls[0][1]["image"] is seen.entries[0][1]["image"]

    # Source values are normalized in FP32, then cast DIRECTLY to VAE dtype.
    # An early FP16 round-trip must fail here even if metadata claims FP32.
    array = numpy.asarray(case.source).astype(numpy.float32) / numpy.float32(255)
    normalized = torch.from_numpy(array).permute(2, 0, 1).unsqueeze(0) * 2.0 - 1.0
    expected_image = normalized.to(device=native.pipeline.vae.device, dtype=case.vae_dtype)
    assert seen.encodes[0].dtype == case.vae_dtype
    assert torch.equal(seen.encodes[0], expected_image), (
        "prepared IMG encoder did not consume source directly in VAE compute dtype"
    )
    if case.vae_dtype == torch.float32:
        assert not torch.equal(expected_image, expected_image.half().float())

    mean, std, sampled, posterior_generator, posterior_state = seen.posteriors[0]
    initial_generator = options["generator"]
    assert posterior_generator is not initial_generator
    assert posterior_generator.device.type == initial_generator.device.type == "cpu"
    assert mean.dtype == std.dtype == sampled.dtype == case.vae_dtype
    posterior_reference = torch.Generator(device="cpu").manual_seed(command.seed)
    assert torch.equal(posterior_state, posterior_reference.get_state())
    draw = torch.randn(mean.shape, generator=posterior_reference, dtype=mean.dtype).to(mean.device)
    assert torch.equal(sampled, mean + std * draw)
    assert torch.equal(posterior_generator.get_state(), posterior_reference.get_state())
    scale = native.pipeline.vae.config.scaling_factor
    encoded = (sampled * scale).to(dtype=native.dtype)

    reference = _reference_scheduler(native, command)
    reference.set_timesteps(command.steps, device=mean.device)
    full = reference.timesteps.tolist()
    first = sum(value >= round(1000 * command.denoising_strength) for value in full)
    selected = full[first:]
    reference.set_begin_index(first)
    assert fresh.num_timesteps == len(selected)
    assert torch.equal(fresh.scheduler.timesteps, reference.timesteps)
    assert torch.equal(fresh.scheduler.sigmas, reference.sigmas)
    assert len(seen.cfg_raw) == len(seen.cfg_steps) == len(seen.forwards) == len(selected)
    assert len(seen.attention) == len(selected)
    assert [int(record.timestep.item()) for record in seen.cfg_steps] == selected

    noise_reference = torch.Generator(device="cpu").manual_seed(command.seed)
    if not selected:
        assert seen.prepared_noises == []
        assert torch.equal(initial_generator.get_state(), noise_reference.get_state())
        raw = seen.results[0][1]
        assert torch.equal(raw, encoded), (
            "prepared IMG source latent lost VAE-precision scaling before denoiser cast"
        )
    else:
        assert len(seen.prepared_noises) == 1
        added = seen.prepared_noises[0]
        assert added.scheduler is fresh.scheduler
        # This is deliberately the first scaled-latent value assertion, after PNG.
        assert torch.equal(added.values["original_samples"], encoded), (
            "prepared IMG source latent lost VAE-precision scaling before denoiser cast"
        )
        assert added.values["original_samples"].dtype == native.dtype
        noise = torch.randn(encoded.shape, generator=noise_reference, dtype=native.dtype).to(
            mean.device
        )
        assert torch.equal(added.values["noise"], noise)
        assert added.values["timesteps"].tolist() == selected[:1]
        noised = reference.add_noise(encoded, noise, reference.timesteps[first : first + 1])
        assert torch.equal(added.result, noised)
        assert torch.equal(initial_generator.get_state(), noise_reference.get_state())
        step_generator = torch.Generator(
            device=mean.device if command.scheduler != "euler" else "cpu"
        ).manual_seed(command.seed ^ 0xFFFFFFFF if command.scheduler != "euler" else command.seed)
        for index, (raw_prediction, record) in enumerate(
            zip(seen.cfg_raw, seen.cfg_steps, strict=True)
        ):
            assert record.raw_count == index + 1
            expected_prediction, _ = _invoke_oracle(
                torch, raw_prediction, command.cfg_scale, command.cfg_rescale
            )
            assert torch.equal(record.prediction, expected_prediction)
            if index == 0:
                assert torch.equal(record.sample, noised)
            else:
                assert torch.equal(record.sample, seen.cfg_steps[index - 1].result)
            scaled = reference.scale_model_input(record.sample, record.timestep)
            assert torch.equal(seen.forwards[index]["sample"], scaled.repeat(2, 1, 1, 1))
            _same_history(torch, record.history_before, _history(reference))
            expected_next = reference.step(
                expected_prediction,
                record.timestep,
                record.sample,
                generator=step_generator,
                return_dict=False,
            )[0]
            assert torch.equal(record.result, expected_next)
            _same_history(torch, record.history_after, _history(reference))
        raw = seen.results[0][1]
        assert torch.equal(raw, seen.cfg_steps[-1].result)
        assert raw.dtype == native.dtype
    if case.vae_dtype == torch.float32:
        assert not torch.equal(encoded, sampled.to(dtype=native.dtype) * scale), (
            "fixture must distinguish scaling in VAE dtype from premature half rounding"
        )

    expected_decode_input = raw.to(dtype=case.vae_dtype) / scale
    assert seen.decodes[0].dtype == case.vae_dtype
    assert torch.equal(seen.decodes[0], expected_decode_input), (
        "prepared IMG decoder lost dtype-before-inverse-scaling"
    )
    with torch.inference_mode():
        decoded = native.pipeline.vae.decode(expected_decode_input, return_dict=False)[0]
        expected_pixels = (decoded / 2 + 0.5).clamp(0, 1)
    final, snapshot = seen.final_outputs[0]
    assert final is not seen.results[0][0]
    assert final.images.dtype == case.vae_dtype
    assert torch.equal(snapshot, expected_pixels)
    assert _quantized_bytes(native, snapshot) == _quantized_bytes(native, expected_pixels)


@pytest.mark.parametrize("scheduler", SCHEDULES)
@pytest.mark.parametrize("precision,native_upcast", POLICIES)
def test_prepared_img_native_encode_scale_denoise_decode_and_png(
    tmp_path: Path,
    cuda: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    scheduler: str,
    precision: str,
    native_upcast: bool,
) -> None:
    case = _case(
        tmp_path, cuda, scheduler=scheduler, precision=precision, native_upcast=native_upcast
    )
    progress: list[tuple[int, int]] = []

    def on_progress(step: int, total: int) -> None:
        progress.append((step, total))

    case.args["on_progress"] = on_progress
    with _observe(output, cuda, monkeypatch) as seen:
        done = _generate(output, cuda, case)
    _png(cuda, case, seen, done)
    _assert_consumed(cuda, case, seen)
    assert progress == [(index + 1, len(seen.cfg_steps)) for index in range(len(seen.cfg_steps))]


@pytest.mark.parametrize("scheduler", SCHEDULES)
@pytest.mark.parametrize("strength", (0.0, 1.0))
def test_prepared_img_empty_and_full_window_preserve_source_and_selected_progress(
    tmp_path: Path,
    cuda: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    scheduler: str,
    strength: float,
) -> None:
    case = _case(tmp_path, cuda, scheduler=scheduler, strength=strength)
    with _observe(output, cuda, monkeypatch) as seen:
        done = _generate(output, cuda, case)
    _png(cuda, case, seen, done)
    _assert_consumed(cuda, case, seen)


@pytest.mark.parametrize("precision,native_upcast", POLICIES)
def test_prepared_img_selected_native_snapshot_is_consumed_without_reopening(
    tmp_path: Path,
    cuda: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    precision: str,
    native_upcast: bool,
) -> None:
    case = _case(
        tmp_path,
        cuda,
        precision=precision,
        native_upcast=native_upcast,
        external=True,
        scheduler="dpmpp_2m_k",
    )
    assert case.command.vae is not None
    case.command.vae.path.unlink()
    with _observe(output, cuda, monkeypatch) as seen:
        done = _generate(output, cuda, case)
    _png(cuda, case, seen, done)
    _assert_consumed(cuda, case, seen)
    assert not case.command.vae.path.exists()


def test_prepared_img_vae_cast_before_scale_red(
    tmp_path: Path, cuda: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Wrong early cast must complete original native publication before RED."""
    case = _case(tmp_path, cuda, precision="FP32")
    with _observe(output, cuda, monkeypatch) as seen:
        done = _generate(output, cuda, case)
    _png(cuda, case, seen, done)
    _assert_consumed(cuda, case, seen)


def test_legacy_img_vae_control_green(
    tmp_path: Path, cuda: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _image_case(tmp_path, cuda, recipe=_recipe(), name="legacy-image")
    assert case.recipe["regions"] == []
    with _preserved(cuda):
        ordinary = _ordinary_legacy(cuda, case)
    with _image_observe(output, cuda, monkeypatch) as seen:
        done = _generate(output, cuda, case)
    pixels = _legacy_png(cuda, case, seen, done)
    _assert_legacy(cuda, case, seen)
    assert cuda.torch.equal(seen.results[0][1], ordinary.images)
    assert pixels == _quantized_bytes(cuda, ordinary.images)


def test_prepared_img_repeat_owns_fresh_wrapper_and_independent_rng(
    tmp_path: Path, cuda: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = _case(tmp_path, cuda, scheduler="euler_a", name="first")
    second = _image_case(
        tmp_path,
        cuda,
        recipe=first.recipe,
        name="second",
        strength=first.command.denoising_strength,
    )
    second.command = replace(
        second.command,
        scheduler=first.command.scheduler,
        vae_precision=first.command.vae_precision,
        cfg_rescale=first.command.cfg_rescale,
    )
    second.args["profile"] = ENCODING
    second.args["denoising_profile"] = PROFILES[first.command.scheduler]
    second.vae_dtype = first.vae_dtype
    with _observe(output, cuda, monkeypatch) as seen_a:
        done_a = _generate(output, cuda, first)
    with _observe(output, cuda, monkeypatch) as seen_b:
        done_b = _generate(output, cuda, second)
    pixels = _png(cuda, first, seen_a, done_a)
    assert _png(cuda, second, seen_b, done_b) == pixels
    _assert_consumed(cuda, first, seen_a)
    _assert_consumed(cuda, second, seen_b)
    assert seen_a.calls[0][0] is not seen_b.calls[0][0]
    assert seen_a.calls[0][0].scheduler is not seen_b.calls[0][0].scheduler
    assert seen_a.posteriors[0][3] is not seen_b.posteriors[0][3]
    assert seen_a.calls[0][1]["generator"] is not seen_b.calls[0][1]["generator"]


_INVALID = (
    ("unprepared", "GENERATION_VAE_UNSUPPORTED"),
    ("mixed", "GENERATION_VAE_UNSUPPORTED"),
    ("shadow", "PROFILE_INVALID"),
    ("stateful", "GENERATION_VAE_UNSUPPORTED"),
    ("mean", "GENERATION_VAE_UNSUPPORTED"),
    ("std", "GENERATION_VAE_UNSUPPORTED"),
    ("tiling", "PROFILE_INVALID"),
    ("profile", "PROFILE_INVALID"),
)


@pytest.mark.parametrize("invalid,code", _INVALID)
def test_prepared_img_invalid_state_refuses_before_native_encode(
    tmp_path: Path,
    cuda: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    invalid: str,
    code: str,
) -> None:
    case = _case(tmp_path, cuda)
    vae, torch = cuda.pipeline.vae, cuda.torch
    if invalid == "unprepared":
        vae.to(dtype=torch.float16)
    elif invalid == "mixed":
        vae.encoder.conv_in.to(dtype=torch.float16)
    elif invalid == "shadow":

        def shadowed(*_args: Any, **_kwargs: Any) -> Any:
            return None

        vae.encode = shadowed
    elif invalid == "stateful":
        previous = vae.encoder.conv_norm_out
        vae.encoder.conv_norm_out = (
            torch.nn.InstanceNorm2d(previous.num_channels, track_running_stats=True)
            .to(device=vae.device, dtype=case.vae_dtype)
            .eval()
        )
    elif invalid in ("mean", "std"):
        vae.register_to_config(**{"latents_" + invalid: (0.0,) * 4})
    elif invalid == "tiling":
        vae.use_tiling = True
    else:
        case.args["denoising_profile"] = "ordinary-canvas-euler-img2img-cpu-vae-v1"
    with monkeypatch.context() as patch, _no_native(cuda, patch) as hits:
        encode = cast(Any, type(vae)).encode

        @wraps(encode)
        def premature(*_args: Any, **_kwargs: Any) -> Any:
            hits.append("native encode")
            raise AssertionError("invalid prepared VAE reached encode")

        patch.setattr(cast(Any, type(vae)), "encode", premature)
        with pytest.raises(
            (
                DerivativeError,
                cuda.denoising.IllustriousRegionalDenoisingError,
                output.IllustriousRegionalOutputError,
            )
        ) as caught:
            _generate(output, cuda, case)
    assert getattr(caught.value, "code", None) == code
    assert hits == []
    assert not case.command.output_path.exists()


@pytest.mark.parametrize("failure", ("encode", "later-unet", "decode", "publication"))
def test_prepared_img_failures_restore_borrowed_state_and_allow_fresh_request(
    tmp_path: Path,
    cuda: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    failure: str,
) -> None:
    case = _case(tmp_path, cuda, strength=1.0)
    sentinel = RuntimeError("prepared-image-" + failure)
    calls: list[str] = []
    owner = cuda.pipeline.unet if failure == "later-unet" else cuda.pipeline.vae
    method = "forward" if failure == "later-unet" else "encode" if failure == "encode" else "decode"
    cls = cast(Any, type(owner))
    original = getattr(cls, method)

    @wraps(original)
    def injected(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is owner:
            calls.append(method)
            if failure != "later-unet" or len(calls) == 2:
                raise sentinel
        return original(current, *args, **kwargs)

    def publication_failure(*_args: Any, **_kwargs: Any) -> Any:
        calls.append("publication")
        raise sentinel

    with monkeypatch.context() as patch:
        if failure == "publication":
            with (
                _aliases(patch, generation_artifacts.publish_generation_image, publication_failure),
                pytest.raises(RuntimeError) as caught,
            ):
                _generate(output, cuda, case)
        else:
            patch.setattr(cls, method, injected)
            with pytest.raises(RuntimeError) as caught:
                _generate(output, cuda, case)
        assert caught.value is sentinel
    assert len(calls) == (2 if failure == "later-unet" else 1)
    assert not case.command.output_path.exists() and not list(case.root.glob(".*.tmp"))
    assert set(case.root.iterdir()) == {case.target}
    with _observe(output, cuda, monkeypatch) as seen:
        done = _generate(output, cuda, case)
    _png(cuda, case, seen, done)
    _assert_consumed(cuda, case, seen)


@pytest.mark.parametrize("external", (False, True))
def test_public_img_worker_still_refuses_unqualified_prepared_vae_combination(
    tmp_path: Path, cuda: Any, external: bool
) -> None:
    case = _case(tmp_path, cuda, precision="FP16" if external else "FP32", external=external)
    worker = importlib.import_module("imagegen_worker.illustrious_regional_worker")
    with pytest.raises(DerivativeError) as caught:
        worker._denoising_profile(  # pyright: ignore[reportPrivateUsage]
            _parameters(case), composition_profile="invoke-canvas-v1", img2img=True
        )
    assert caught.value.code == "INVALID_REQUEST"
