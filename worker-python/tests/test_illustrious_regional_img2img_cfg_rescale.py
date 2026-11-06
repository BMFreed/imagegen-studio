"""Public opaque IMG consumes Invoke's existing post-CFG rescale operation.

Consulted InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd:
generation/core/canvas/compileCanvasGraph.ts grafts image-to-latents and regional
conditioning onto the same denoiser; app/invocations/sd/denoise_latents.py selects
RescaleCFGExt without a TXT/IMG distinction. diffusion_backend.py invokes its
post-combine callback before the original scheduler. The independent oracle in
test_illustrious_regional_cfg_rescale uses that std-ratio/blend arithmetic on
the original UNet's signed outputs, preserving actual compute dtype and order.

All consumption assertions below follow original native PNG publication. The
named forced-zero mutation target must reach publication before failing its
actual scheduler-input oracle; an independently computed ordinary zero control
remains GREEN. Small complete recipes are Python setup, not genuine Main input.
ROOT owns imports, execution, numerical compatibility and isolated mutations.
"""

from __future__ import annotations

import importlib
from collections.abc import Iterator
from dataclasses import replace
from functools import wraps
from pathlib import Path
from typing import Any, cast

import pytest

from imagegen_worker import generation_artifacts
from test_illustrious_regional_cfg_rescale import (
    _INVALID,  # pyright: ignore[reportPrivateUsage]
    _invoke_oracle,  # pyright: ignore[reportPrivateUsage]
    _observe_cfg,  # pyright: ignore[reportPrivateUsage]
    _reference_scheduler,  # pyright: ignore[reportPrivateUsage]
    _sample,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_dpmpp_2m import CPU_ENCODING, CUDA_ENCODING
from test_illustrious_regional_embeddings import (
    _models,  # pyright: ignore[reportPrivateUsage]
    _no_native,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
    _same_recipe,  # pyright: ignore[reportPrivateUsage]
    _save,  # pyright: ignore[reportPrivateUsage]
    _with_resources,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _assert_source_and_schedule,  # pyright: ignore[reportPrivateUsage]
    _generate,  # pyright: ignore[reportPrivateUsage]
    _observe,  # pyright: ignore[reportPrivateUsage]
    _ordinary,  # pyright: ignore[reportPrivateUsage]
    _png,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _case as _image_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _aliases,  # pyright: ignore[reportPrivateUsage]
    _quantized_bytes,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
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


@pytest.fixture
def output() -> Any:
    return importlib.import_module("imagegen_worker.illustrious_regional_output")


def _case(
    tmp_path: Path,
    native: Any,
    *,
    multiplier: Any = 0.7,
    strength: float = 0.5,
    regional: bool = True,
    recipe: Any = None,
    name: str = "rescaled-image",
) -> Any:
    if recipe is None:
        recipe = _with_resources(_recipe(*((_region(),) if regional else ())))
    case = _image_case(tmp_path, native, recipe=recipe, strength=strength, name=name)
    case.command = replace(case.command, cfg_rescale=multiplier)
    case.args["profile"] = CUDA_ENCODING if native.device == "cuda" else CPU_ENCODING
    return case


def _assert_consumed(native: Any, case: Any, seen: Any) -> None:
    """Separate source/cutoff and signed-prediction oracles inspect actual use."""
    torch, command = native.torch, case.command
    full = [1 + index * (1000 // command.steps) for index in reversed(range(command.steps))]
    selected = [
        timestep for timestep in full if timestep < round(1000 * command.denoising_strength)
    ]
    assert len(seen.cfg_raw) == len(seen.cfg_steps) == len(selected)
    if not selected:
        assert seen.cfg_steps == seen.cfg_raw == []
        _assert_source_and_schedule(native, case, seen)
        return
    reference = _reference_scheduler(native, command)
    reference.set_timesteps(command.steps, device=native.pipeline.vae.device)
    begin = len(full) - len(selected)
    reference.set_begin_index(begin)
    actual = seen.cfg_steps[0].scheduler
    assert actual is seen.calls[0][0].scheduler and actual is not native.pipeline.scheduler
    assert torch.equal(actual.timesteps, reference.timesteps)
    assert torch.equal(actual.sigmas, reference.sigmas)
    changed = False
    for index, (raw, record, root) in enumerate(
        zip(seen.cfg_raw, seen.cfg_steps, seen.forwards, strict=True)
    ):
        assert raw.shape == (2, 4, 2, 3) and raw.dtype == native.dtype
        assert record.raw_count == index + 1
        expected, ordinary_cfg = _invoke_oracle(torch, raw, command.cfg_scale, command.cfg_rescale)
        assert bool(torch.isfinite(expected).all())
        assert torch.equal(record.prediction, expected), (
            "native IMG scheduler input lost Invoke CFG rescale"
        )
        changed = changed or not torch.equal(expected, ordinary_cfg)
        timestep = reference.timesteps[begin + index]
        assert torch.equal(record.timestep, timestep)
        scaled = reference.scale_model_input(torch.cat((record.sample, record.sample)), timestep)
        assert torch.equal(root["sample"], scaled)
        expected_next = reference.step(expected, timestep, record.sample, return_dict=False)[0]
        assert torch.equal(record.result, expected_next), (
            "original IMG Euler transition lost its rescaled prediction"
        )
        if index + 1 < len(selected):
            assert torch.equal(seen.cfg_steps[index + 1].sample, record.result)
    assert changed is (command.cfg_rescale > 0), "IMG fixture did not discriminate rescale"
    assert torch.equal(
        seen.decodes[0], seen.cfg_steps[-1].result / native.pipeline.vae.config.scaling_factor
    )
    # Consumption wins over metadata: forced-zero must fail the actual signed
    # prediction oracle above, after a genuine original PNG was published.
    _assert_source_and_schedule(native, case, seen)


@pytest.mark.parametrize("multiplier", (0.7, 0.99))
@pytest.mark.parametrize("strength", (0.0, 0.5, 1.0))
def test_public_img_rescale_uses_original_selected_schedule_and_published_rgb(
    tmp_path: Path,
    lane: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    multiplier: float,
    strength: float,
) -> None:
    case = _case(tmp_path, lane, multiplier=multiplier, strength=strength)
    progress: list[tuple[int, int]] = []

    def on_progress(step: int, total: int) -> None:
        progress.append((step, total))

    case.args["on_progress"] = on_progress
    with _observe(output, lane, monkeypatch) as seen, _observe_cfg(lane, seen, monkeypatch):
        done = _generate(output, lane, case)
    _png(lane, case, seen, done)
    _assert_consumed(lane, case, seen)
    assert progress == [(index + 1, len(seen.cfg_steps)) for index in range(len(seen.cfg_steps))]


def test_regional_img_cfg_rescale_consumption_mutation_red(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A valid forced-zero subject must publish, then fail native consumption."""
    case = _case(tmp_path, lane)
    with _observe(output, lane, monkeypatch) as seen, _observe_cfg(lane, seen, monkeypatch):
        done = _generate(output, lane, case)
    _png(lane, case, seen, done)
    _assert_consumed(lane, case, seen)


def test_regional_img_cfg_rescale_zero_control_green(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path, lane, multiplier=0.0, regional=False)
    assert case.recipe["regions"] == []
    with _preserved(lane):
        ordinary = _ordinary(lane, case)
    with _observe(output, lane, monkeypatch) as seen, _observe_cfg(lane, seen, monkeypatch):
        done = _generate(output, lane, case)
    pixels = _png(lane, case, seen, done)
    _assert_consumed(lane, case, seen)
    assert lane.torch.equal(seen.results[0][1], ordinary.images)
    assert pixels == _quantized_bytes(lane, ordinary.images)


@pytest.mark.parametrize("invalid", _INVALID)
def test_public_img_invalid_rescale_refuses_before_target_snapshot_or_native_work(
    tmp_path: Path, cpu: Any, output: Any, monkeypatch: pytest.MonkeyPatch, invalid: Any
) -> None:
    case = _case(tmp_path, cpu, multiplier=invalid)
    accesses: list[str] = []

    def forbidden(**_kwargs: Any) -> Any:
        accesses.append("target")
        raise AssertionError("invalid IMG rescale reached target snapshot")

    with (
        monkeypatch.context() as patch,
        _no_native(cpu, patch) as hits,
        _aliases(patch, generation_artifacts.validate_generation_target, forbidden),
        pytest.raises(cpu.denoising.IllustriousRegionalDenoisingError) as caught,
    ):
        _generate(output, cpu, case)
    assert caught.value.code == "INPUT_INVALID"
    assert (
        str(caught.value)
        == "Invoke Canvas requires finite CFG rescale in [0,0.99], excluding bool."
    )
    assert accesses == hits == []
    assert set(case.root.iterdir()) == {case.target}


def test_private_img_retains_exact_historical_zero_only_refusal(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _image_case(tmp_path, lane)
    case.command = replace(case.command, cfg_rescale=0.7)
    with (
        _no_native(lane, monkeypatch) as hits,
        pytest.raises(lane.denoising.IllustriousRegionalDenoisingError) as caught,
    ):
        _generate(output, lane, case)
    assert caught.value.code == "UNSUPPORTED"
    assert str(caught.value) == "This first denoising profile requires CFG rescale zero."
    assert hits == [] and set(case.root.iterdir()) == {case.target}


def test_img_rescale_zero_variance_refuses_without_fallback_and_fresh_request_recovers(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path, lane)
    cls = cast(Any, type(lane.pipeline.unet))
    forward = cls.forward
    with monkeypatch.context() as patch:

        @wraps(forward)
        def constant(current: Any, *args: Any, **kwargs: Any) -> Any:
            result = forward(current, *args, **kwargs)
            if current is lane.pipeline.unet:
                _sample(result).fill_(1)
            return result

        patch.setattr(cls, "forward", constant)
        with (
            _observe(output, lane, monkeypatch) as failed,
            _observe_cfg(lane, failed, monkeypatch),
            pytest.raises(lane.denoising.IllustriousRegionalDenoisingError) as caught,
        ):
            _generate(output, lane, case)
    assert caught.value.code == "INPUT_INVALID" and str(caught.value) == "sample must be finite."
    assert len(failed.cfg_raw) == len(failed.cfg_steps) == 1
    assert not bool(lane.torch.isfinite(failed.cfg_steps[0].prediction).all())
    assert failed.publications == failed.receipts == []
    assert set(case.root.iterdir()) == {case.target}
    with (
        _observe(output, lane, monkeypatch) as recovered,
        _observe_cfg(lane, recovered, monkeypatch),
    ):
        done = _generate(output, lane, case)
    _png(lane, case, recovered, done)
    _assert_consumed(lane, case, recovered)


@pytest.mark.parametrize("failure", ("encode", "later-unet", "decode", "publication"))
def test_nonzero_img_rescale_failure_preserves_source_and_fresh_recovery(
    tmp_path: Path,
    cpu: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    failure: str,
) -> None:
    case = _case(tmp_path, cpu, strength=1.0)
    sentinel = RuntimeError(f"public-img-rescale-{failure}")
    calls: list[str] = []
    module = cast(
        Any, type(cpu.pipeline.unet) if failure == "later-unet" else type(cpu.pipeline.vae)
    )
    name = "forward" if failure == "later-unet" else "encode" if failure == "encode" else "decode"
    original = getattr(module, name)

    @wraps(original)
    def native_failure(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is (cpu.pipeline.unet if failure == "later-unet" else cpu.pipeline.vae):
            calls.append(name)
            if failure != "later-unet" or len(calls) == 3:
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
                _generate(output, cpu, case)
        else:
            patch.setattr(module, name, native_failure)
            with pytest.raises(RuntimeError) as caught:
                _generate(output, cpu, case)
        assert caught.value is sentinel
    assert len(calls) == (3 if failure == "later-unet" else 1)
    assert not case.command.output_path.exists() and not list(case.root.glob(".*.tmp"))
    assert set(case.root.iterdir()) == {case.target}
    with _observe(output, cpu, monkeypatch) as recovered, _observe_cfg(cpu, recovered, monkeypatch):
        done = _generate(output, cpu, case)
    _png(cpu, case, recovered, done)
    _assert_consumed(cpu, case, recovered)


def test_img_rescale_uses_recipe_owned_exact_vectors_without_reloading_borrowed_clips(
    tmp_path: Path, cpu: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    first, regional = _save(tmp_path, cpu, 1), _save(tmp_path, cpu, 3)
    case = _case(tmp_path, cpu, recipe=_same_recipe(first, regional))
    loader = importlib.import_module(
        "diffusers.loaders.textual_inversion"
    ).TextualInversionLoaderMixin
    original = loader.load_textual_inversion
    loaded: list[tuple[int, int]] = []

    @wraps(original)
    def installed(current: Any, *args: Any, **kwargs: Any) -> Any:
        result = original(current, *args, **kwargs)
        encoder, tokenizer = kwargs["text_encoder"], kwargs["tokenizer"]
        assert encoder not in (cpu.pipeline.text_encoder, cpu.pipeline.text_encoder_2)
        for alias, rows in zip(kwargs["token"], args[0], strict=True):
            ids = [
                tokenizer.convert_tokens_to_ids(alias if index == 0 else f"{alias}_{index}")
                for index in range(rows.shape[0])
            ]
            assert cpu.torch.equal(encoder.get_input_embeddings().weight[ids], rows)
        loaded.append((encoder.config.hidden_size, len(kwargs["token"])))
        return result

    with monkeypatch.context() as patch:
        patch.setattr(loader, "load_textual_inversion", installed)
        with _observe(output, cpu, monkeypatch) as seen, _observe_cfg(cpu, seen, monkeypatch):
            done = _generate(output, cpu, case)
    _png(cpu, case, seen, done)
    _assert_consumed(cpu, case, seen)
    assert loaded == [(768, 2), (1280, 2)]


def test_img_rescale_ready_requires_an_explicit_combination_capability() -> None:
    module = importlib.import_module("imagegen_worker.inference_main")
    capabilities = cast(list[str], module.inference_ready_message()["capabilities"])
    assert "illustrious-regional-img2img-cfg-rescale-v1" in capabilities
    assert "illustrious-regional-img2img-v1" in capabilities
    assert "illustrious-regional-cfg-rescale-v1" in capabilities
    assert "illustrious-regional-invoke-v1" in capabilities
