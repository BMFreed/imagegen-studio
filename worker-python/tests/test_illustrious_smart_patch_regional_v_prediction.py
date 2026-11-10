"""V Smart descriptors consume the existing regional native Euler/source owners.

Fresh InvokeAI4875d965 compileCanvasGraph source graft and prepareCanvasInvocation
caller join regions before the shared denoiser. sd/denoise_latents.py:get_scheduler
copies actual model prediction_type independently of mode and noise policy.
These authored tests retain original descriptor snapshots, complete-input capture,
CLIP/attention/Euler/VAE and PNG publication. Tiny loaders and CPU placement are
the explicit existing test substitutions, not installed/trained/visual evidence.

The objective oracle runs only after real PNG publication. A valid mutant that
changes the fresh V scheduler to epsilon immediately before its first native
step must fail transition equality, while the original EPS neighbor stays GREEN.
No native result, prediction, source, KEEP or output pixel is replaced by an oracle.
ROOT owns test execution, semantic mutation and runtime qualification.
"""

from __future__ import annotations

import copy
import json
from collections.abc import Generator
from contextlib import contextmanager
from functools import wraps
from pathlib import Path
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import illustrious_smart_patch_regional as smart
from imagegen_worker import illustrious_smart_patch_regional_worker as worker
from imagegen_worker import inference_main, sdxl_outpaint
from imagegen_worker.derivatives import DerivativeError
from test_illustrious_regional_conditioning import (
    _mask,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_denoising import (
    _encode,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    _literal_bank,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_sampling import (
    _literal_grid,  # pyright: ignore[reportPrivateUsage]
    _literal_training,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_smart_patch_regional import (
    MODES,
    _permissions,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_smart_patch_regional_worker import (
    _Case,  # pyright: ignore[reportPrivateUsage]
    _tripwire,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_smart_patch_regional_worker import (
    _case as _eps_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_smart_patch_regional_worker import (
    _run as _original_run,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_smart_patch_regional_worker import native as native

POLICIES = tuple(
    pytest.param(rescale, spacing, id=f"{'true' if rescale else 'false'}-{spacing}")
    for rescale in (False, True)
    for spacing in ("leading", "linspace", "trailing")
)


def _case(
    directory: Path,
    mode: str = "inpaint",
    *,
    rescale: bool = False,
    spacing: str = "leading",
    regions: bool = True,
) -> _Case:
    result = _eps_case(directory, mode, regions=regions)
    for complete in (result.private, result.bundle):
        complete["profile"] = f"invoke-illustrious-smart-regional-v-prediction-{mode}-v1"
        complete["execution"]["inference"]["checkpoint"]["predictionType"] = "v_prediction"
        policy = complete["execution"]["inference"]["sampling"]["noiseProfile"]
        policy.update({"rescaleBetasZeroSnr": rescale, "timestepSpacing": spacing})
        complete["recipe"]["sampling"]["noiseProfile"] = copy.deepcopy(policy)
    result.seal()
    return result


@contextmanager
def _steps(native: Any, monkeypatch: pytest.MonkeyPatch) -> Generator[list[Any]]:
    """Observe original native step returns without touching any production value."""
    cls = native.diffusers.EulerDiscreteScheduler
    original = cls.step
    results: list[Any] = []

    @wraps(original)
    def step(current: Any, *args: Any, **kwargs: Any) -> Any:
        result = original(current, *args, **kwargs)
        value = cast(Any, result[0] if isinstance(result, tuple) else result.prev_sample)
        results.append(value.detach().clone())
        return cast(Any, result)

    with monkeypatch.context() as patch:
        patch.setattr(cls, "step", step)
        yield results


@contextmanager
def _merges(monkeypatch: pytest.MonkeyPatch) -> Generator[list[dict[str, Any]]]:
    """Original Smart KEEP callback runs unchanged; only copied observations remain."""
    cls = sdxl_outpaint._OutpaintState  # pyright: ignore[reportPrivateUsage]
    original = cls.step
    records: list[dict[str, Any]] = []

    @wraps(original)
    def step(
        current: Any, pipeline: Any, index: int, timestep: Any, payload: dict[str, Any]
    ) -> dict[str, Any]:
        record = {
            "before": payload["latents"].detach().clone(),
            "original": current.original.detach().clone(),
            "noise": current.noise.detach().clone(),
            "generate": current.generate_mask.detach().clone(),
        }
        result = original(current, pipeline, index, timestep, payload)
        record["after"] = result["latents"].detach().clone()
        records.append(record)
        return result

    with monkeypatch.context() as patch:
        patch.setattr(cls, "step", step)
        yield records


def _assert_steps(
    native: Any,
    seen: Any,
    results: list[Any],
    *,
    objective: str = "v_prediction",
    rescale: bool = False,
    spacing: str = "leading",
) -> None:
    """Independent native primitives consume every observed real prediction/sample.

    Do not assert expected prediction_type metadata before transition equality:
    a post-validation valid wrong-objective mutant must finish PNG publication
    before failing for the actual consumed objective.
    """
    torch = native.torch
    assert len(seen.steps) == len(seen.root_inputs) == len(results) == 2
    scheduler = seen.steps[0]["self"]
    assert all(entry["self"] is scheduler for entry in seen.steps)
    beta, cumulative = _literal_training(torch, rescale)
    grid = _literal_grid(pytest.importorskip("numpy"), 2, spacing)
    assert torch.equal(scheduler.betas, beta)
    assert torch.equal(scheduler.alphas_cumprod, cumulative)
    assert [entry["timestep"].item() for entry in seen.steps] == grid.tolist()
    oracle = native.diffusers.EulerDiscreteScheduler(
        num_train_timesteps=1000,
        beta_start=0.00085,
        beta_end=0.012,
        beta_schedule="scaled_linear",
        trained_betas=None,
        steps_offset=1,
        prediction_type=objective,
        timestep_spacing=spacing,
        rescale_betas_zero_snr=rescale,
    )
    opposite = native.diffusers.EulerDiscreteScheduler(
        num_train_timesteps=1000,
        beta_start=0.00085,
        beta_end=0.012,
        beta_schedule="scaled_linear",
        trained_betas=None,
        steps_offset=1,
        prediction_type="epsilon" if objective == "v_prediction" else "v_prediction",
        timestep_spacing=spacing,
        rescale_betas_zero_snr=rescale,
    )
    device = seen.steps[0]["sample"].device
    oracle.set_timesteps(2, device=device)
    opposite.set_timesteps(2, device=device)
    assert torch.equal(scheduler.sigmas, oracle.sigmas)
    different = False
    for record, root, unet, actual in zip(
        seen.steps, seen.root_inputs, seen.unet_results, results, strict=True
    ):
        sample, time = record["sample"], record["timestep"]
        batch = torch.cat((sample, sample))
        assert torch.equal(root["sample"], oracle.scale_model_input(batch, time))
        opposite.scale_model_input(batch, time)
        raw = cast(Any, unet[0] if isinstance(unet, tuple) else unet.sample)
        negative, positive = raw.chunk(2)
        prediction = negative + 5 * (positive - negative)
        assert torch.equal(record["model_output"], prediction)
        expected = oracle.step(prediction, time, sample, return_dict=False)[0]
        wrong = opposite.step(prediction, time, sample, return_dict=False)[0]
        different |= not torch.equal(expected, wrong)
        assert torch.equal(actual, expected), (
            "Smart regional native Euler consumed wrong prediction objective"
        )
        assert torch.isfinite(actual).all()
    assert different, "fixture must distinguish V and epsilon using real native inputs"
    assert scheduler.config.prediction_type == objective
    assert scheduler.config.rescale_betas_zero_snr is rescale
    assert scheduler.config.timestep_spacing == spacing


def _assert_keep(
    native: Any,
    seen: Any,
    case: _Case,
    results: list[Any],
    merges: list[dict[str, Any]],
    *,
    rescale: bool,
    spacing: str,
) -> None:
    mode = case.private["execution"]["mode"]
    if mode not in ("inpaint", "outpaint"):
        assert not merges
        return
    torch = native.torch
    with Image.open(case.private["execution"]["latentKeepMask"]["path"]) as image:
        keep = image.getchannel("A").tobytes()
    generate = 1 - torch.tensor(list(keep), dtype=torch.float32).reshape(1, 1, 8, 8) / 255
    assert bool((generate == 0).any()) and bool((generate == 1).any())
    assert bool(((generate > 0) & (generate < 1)).any())
    assert len(merges) == len(results) == 2
    reference = native.diffusers.EulerDiscreteScheduler(
        num_train_timesteps=1000,
        beta_start=0.00085,
        beta_end=0.012,
        beta_schedule="scaled_linear",
        trained_betas=None,
        steps_offset=1,
        prediction_type="v_prediction",
        timestep_spacing=spacing,
        rescale_betas_zero_snr=rescale,
    )
    reference.set_timesteps(2, device=merges[0]["original"].device)
    reference.set_begin_index(0)
    expected_initial = reference.add_noise(
        merges[0]["original"], merges[0]["noise"], reference.timesteps[:1]
    )
    assert torch.equal(seen.steps[0]["sample"], expected_initial)
    for index, (record, predicted) in enumerate(zip(merges, results, strict=True)):
        generate = generate.to(device=record["original"].device, dtype=record["original"].dtype)
        assert torch.equal(record["before"], predicted)
        if index + 1 == len(merges):
            expected = torch.where(generate > 0, predicted, record["original"])
        else:
            reference.set_begin_index(index + 1)
            time = reference.timesteps[index + 1 : index + 2]
            protected = reference.add_noise(record["original"], record["noise"], time)
            expected = torch.where(generate > time.item() / 1000, predicted, protected)
        assert torch.equal(record["after"], expected), "V Smart consumed wrong independent KEEP"
        assert torch.equal(record["generate"], generate)
        if index + 1 < len(merges):
            assert torch.equal(seen.steps[index + 1]["sample"], expected)
    assert torch.equal(
        seen.decodes[0], merges[-1]["after"] / native.pipeline.vae.config.scaling_factor
    )


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("rescale,spacing", POLICIES)
def test_v_six_policies_capture_exact_mode_and_policy(
    tmp_path: Path, mode: str, rescale: bool, spacing: str
) -> None:
    case = _case(tmp_path / mode, mode, rescale=rescale, spacing=spacing)
    captured = worker.parse_illustrious_smart_patch_regional_request(case.wire).captured
    assert captured.command.mode == mode
    assert captured.policy.prediction_type == "v_prediction"
    assert captured.policy.noise_profile is not None
    assert captured.policy.noise_profile.rescale_betas_zero_snr is rescale
    assert captured.policy.noise_profile.timestep_spacing == spacing
    assert captured.execution_profile == case.private["profile"]
    assert captured == smart.capture_illustrious_smart_patch_regional_input(case.private)
    assert (
        json.loads(captured.recipe_json)["sampling"]["noiseProfile"]
        == (case.private["recipe"]["sampling"]["noiseProfile"])
    )
    before = copy.deepcopy(captured)
    case.bundle["recipe"]["sampling"]["noiseProfile"]["rescaleBetasZeroSnr"] = not rescale
    case.bundle["execution"]["inference"]["sampling"]["noiseProfile"]["timestepSpacing"] = "later"
    (case.root / "regional-0.alpha8").write_bytes(bytes(107 * 73))
    assert captured == before


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("rescale,spacing", POLICIES)
def test_v_descriptor_native_objective_red(
    tmp_path: Path,
    native: Any,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    rescale: bool,
    spacing: str,
) -> None:
    case = _case(tmp_path / mode, mode, rescale=rescale, spacing=spacing)
    case.wire["reportProgress"] = True
    streams = (_encode(native, "cat", "blur"), _encode(native, "dog", "grain"))
    expected = native.torch.cat(
        tuple(_literal_bank(native, streams, sign, 154) for sign in ("negative", "positive"))
    )
    with _steps(native, monkeypatch) as steps, _merges(monkeypatch) as merges:
        seen = _original_run(case, native, monkeypatch)
    # The existing helper has completed original VAE decode and actual RGB PNG.
    assert Path(case.private["execution"]["output"]["pngPath"]).is_file()
    _assert_steps(native, seen, steps, rescale=rescale, spacing=spacing)
    _assert_keep(native, seen, case, steps, merges, rescale=rescale, spacing=spacing)
    assert seen.builds == [("cat", "blur"), ("dog", "grain")]
    for context, mask in zip(seen.contexts, seen.masks, strict=True):
        assert native.torch.equal(context, expected)
        assert mask is not None
        assert native.torch.equal(_mask(native, mask, 2, 64, 154), _permissions(native))


@pytest.mark.parametrize("mode", MODES)
def test_eps_descriptor_native_objective_control_green(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    case = _eps_case(tmp_path / mode, mode)
    with _steps(native, monkeypatch) as steps:
        seen = _original_run(case, native, monkeypatch)
    assert Path(case.private["execution"]["output"]["pngPath"]).is_file()
    _assert_steps(native, seen, steps, objective="epsilon")


@pytest.mark.parametrize("mode", MODES)
def test_v_zero_region_neighbor_keeps_original_native_owner(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    case = _case(tmp_path / mode, mode, regions=False)
    with _steps(native, monkeypatch) as steps:
        seen = _original_run(case, native, monkeypatch)
    _assert_steps(native, seen, steps)
    assert seen.builds == [("cat", "blur")]
    assert all(mask is None for mask in seen.masks)


FAULTS = (
    "eps-profile",
    "anima-profile",
    "crossed-mode-profile",
    "eps-objective",
    "sample-objective",
    "different-recipe-noise",
    "missing-recipe-noise",
    "missing-execution-noise",
    "extra-recipe-noise-field",
    "invalid-recipe-noise-version",
    "invalid-recipe-noise-base",
    "numeric-recipe-noise-bool",
    "unknown-recipe-noise-spacing",
    "non-euler-sampler",
)


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("fault", FAULTS)
def test_v_crossed_profile_objective_policy_refuses_before_native(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str, fault: str
) -> None:
    case = _case(tmp_path / mode, mode)
    recipe_sampling = case.bundle["recipe"]["sampling"]
    execution = case.bundle["execution"]["inference"]
    if fault == "eps-profile":
        case.bundle["profile"] = f"invoke-illustrious-smart-regional-{mode}-v1"
    elif fault == "anima-profile":
        case.bundle["profile"] = f"invoke-anima-smart-regional-{mode}-v1"
    elif fault == "crossed-mode-profile":
        other = "inpaint" if mode != "inpaint" else "outpaint"
        case.bundle["profile"] = f"invoke-illustrious-smart-regional-v-prediction-{other}-v1"
    elif fault in ("eps-objective", "sample-objective"):
        execution["checkpoint"]["predictionType"] = (
            "epsilon" if fault == "eps-objective" else "sample"
        )
    elif fault == "different-recipe-noise":
        recipe_sampling["noiseProfile"]["rescaleBetasZeroSnr"] = True
    elif fault == "missing-recipe-noise":
        del recipe_sampling["noiseProfile"]
    elif fault == "missing-execution-noise":
        del execution["sampling"]["noiseProfile"]
    elif fault == "extra-recipe-noise-field":
        recipe_sampling["noiseProfile"]["extra"] = "not a noise policy"
    elif fault == "invalid-recipe-noise-version":
        recipe_sampling["noiseProfile"]["schemaVersion"] = True
    elif fault == "invalid-recipe-noise-base":
        recipe_sampling["noiseProfile"]["baseSchedule"] = "other"
    elif fault == "numeric-recipe-noise-bool":
        recipe_sampling["noiseProfile"]["rescaleBetasZeroSnr"] = 0
    elif fault == "unknown-recipe-noise-spacing":
        recipe_sampling["noiseProfile"]["timestepSpacing"] = "unknown"
    else:
        execution["sampling"]["scheduler"] = "euler_a"
    case.seal()
    monkeypatch.setattr(worker, "execute_smart_patch", _tripwire)
    with pytest.raises((ValueError, DerivativeError)):
        worker.execute_illustrious_smart_patch_regional_request(
            case.wire, config_dir=tmp_path, runtime=cast(Any, None)
        )
    assert not Path(case.private["execution"]["output"]["pngPath"]).exists()


@pytest.mark.parametrize("mode", MODES)
def test_eps_profiles_reject_v_only_sampling_field(tmp_path: Path, mode: str) -> None:
    case = _eps_case(tmp_path / mode, mode)
    case.bundle["recipe"]["sampling"]["noiseProfile"] = copy.deepcopy(
        case.bundle["execution"]["inference"]["sampling"]["noiseProfile"]
    )
    case.seal()
    with pytest.raises((ValueError, DerivativeError)):
        worker.parse_illustrious_smart_patch_regional_request(case.wire)


@pytest.mark.parametrize("mode", MODES)
def test_v_progress_failure_publishes_nothing_then_original_owner_recovers(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    case = _case(tmp_path / mode, mode)
    case.wire["reportProgress"] = True
    events: list[dict[str, object]] = []

    def fail(event: dict[str, object]) -> None:
        events.append(event)
        raise RuntimeError("declared V Smart native progress failure")

    with pytest.raises(DerivativeError) as raised:
        _original_run(case, native, monkeypatch, progress_sink=fail)
    assert raised.value.code == "GENERATION_WORKER_FAILED"
    assert len(events) == 1 and events[0]["step"] == 1
    assert not Path(case.private["execution"]["output"]["pngPath"]).exists()
    with _steps(native, monkeypatch) as steps:
        seen = _original_run(case, native, monkeypatch)
    _assert_steps(native, seen, steps)


def test_v_mode_capabilities_are_additive_and_keep_eps_neighbors() -> None:
    ready = inference_main.inference_ready_message()
    assert ready["workerVersion"] == "0.14.0"
    capabilities = cast(list[str], ready["capabilities"])
    for mode in MODES:
        assert f"illustrious-smart-patch-regional-{mode}-v1" in capabilities
        assert f"illustrious-smart-patch-regional-v-prediction-{mode}-v1" in capabilities
    assert worker.ILLUSTRIOUS_SMART_PATCH_REGIONAL_V_PREDICTION_INPAINT_CAPABILITY == (
        "illustrious-smart-patch-regional-v-prediction-inpaint-v1"
    )
    assert worker.ILLUSTRIOUS_SMART_PATCH_REGIONAL_V_PREDICTION_OUTPAINT_CAPABILITY == (
        "illustrious-smart-patch-regional-v-prediction-outpaint-v1"
    )
    assert worker.ILLUSTRIOUS_SMART_PATCH_REGIONAL_V_PREDICTION_TXT2IMG_CAPABILITY == (
        "illustrious-smart-patch-regional-v-prediction-txt2img-v1"
    )
    assert worker.ILLUSTRIOUS_SMART_PATCH_REGIONAL_V_PREDICTION_IMG2IMG_CAPABILITY == (
        "illustrious-smart-patch-regional-v-prediction-img2img-v1"
    )
