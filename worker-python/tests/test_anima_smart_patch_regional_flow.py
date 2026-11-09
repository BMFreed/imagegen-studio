"""Private Smart TXT/IMG consume the existing signed native Anima predictor.

InvokeAI4875d96531ca6712b288f6e660fcbb34143408c1 compileCanvasGraph.ts grafts
IMG source before the same all-mode regional collector; TXT has no source graft.
app/invocations/anima/anima_denoise.py consumes the same signed contexts/masks
for either initializer. These tests keep native models/solvers/attention/decode,
asset snapshots and exclusive processing PNG publication real. Literal fixtures
use real TS compilers but do not attest Main or trained loading. Two opt-in Main
handoffs consume complete Save/reopen/capture inputs unchanged, with explicitly
synthetic resource bytes and only native model construction substituted.

No public TXT/IMG capability, queue/Retry, trained quality or visual claim follows.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import os
from contextlib import nullcontext
from dataclasses import dataclass, replace
from functools import wraps
from pathlib import Path
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import anima_flow_sampling as flow
from imagegen_worker import anima_regional as regional
from imagegen_worker import anima_smart_patch_regional as smart
from imagegen_worker import anima_smart_patch_regional_worker as worker
from imagegen_worker import anima_worker, smart_patch_denoising, smart_patch_execution
from imagegen_worker.anima_worker import anima_prompt_payload, anima_sampling_payload
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.smart_patch_denoising import run_smart_patch_anima
from test_anima_flow_sampling import inputs as _flow_inputs
from test_anima_regional import (
    _contains_cause,  # pyright: ignore[reportPrivateUsage]
    _Native,  # pyright: ignore[reportPrivateUsage]
    _Observation,  # pyright: ignore[reportPrivateUsage]
    _observed,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional import cpu_native as cpu_native
from test_anima_regional import native as native
from test_anima_regional import native_factory as native_factory
from test_anima_smart_patch_regional import (
    _Case,  # pyright: ignore[reportPrivateUsage]
    _contexts,  # pyright: ignore[reportPrivateUsage]
    _mask,  # pyright: ignore[reportPrivateUsage]
    _prediction_oracle,  # pyright: ignore[reportPrivateUsage]
    _streams,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_smart_patch_regional import (
    _case as _inpaint_case,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_smart_patch_regional import (
    _run as _inpaint_run,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_smart_patch_regional_worker import (
    _descriptor,  # pyright: ignore[reportPrivateUsage]
)

_PROFILES = {
    "txt2img": "invoke-anima-smart-regional-txt2img-v1",
    "img2img": "invoke-anima-smart-regional-img2img-v1",
}
_MODES = tuple(_PROFILES)


def _sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _case(
    root: Path,
    mode: str,
    *,
    scheduler: str = "euler",
    regions: bool = True,
    guidance: float = 3,
    strength: float = 0.75,
) -> _Case:
    # The established fixture supplies owner IDs, separate signed refs and exact
    # snapshots; only this finite flow mode/initializer is authored differently.
    case = _inpaint_case(
        root, scheduler=scheduler, regions=regions, guidance=guidance, strength=strength, keep=0
    )
    wire = case.value["execution"]
    wire["mode"] = mode
    if mode == "txt2img":
        wire["modelSource"] = None
    case.value["profile"] = _PROFILES[mode]
    plan = _flow_inputs(
        positive=case.recipe["globalPrompts"]["positive"]["text"],
        negative=case.recipe["globalPrompts"]["negative"]["text"],
        scheduler=scheduler,
        mode=mode,
        width=case.command.width,
        height=case.command.height,
        seed=123,
        steps=4,
        guidanceScale=guidance,
        strength=None if mode == "txt2img" else strength,
    )
    wire["inference"]["sampling"] = plan["plan"]
    case.captured = smart.capture_anima_smart_patch_regional_input(case.value)
    case.inputs = smart_patch_execution.capture_smart_patch_execution(case.command)
    return case


def _assert_files(case: _Case) -> None:
    assert case.command.latent_keep_mask.path.read_bytes() == case.keep_bytes
    assert case.inputs.latent_keep_mask.getextrema() == (0, 0)
    if case.command.mode == "txt2img":
        assert case.command.model_source is None and case.inputs.model_source is None
    else:
        assert case.command.model_source is not None
        assert case.command.model_source.path.read_bytes() == case.source_bytes
        assert case.inputs.model_source is not None


@dataclass
class _FlowRun:
    result: Any
    done: dict[str, object]
    pixels: bytes
    observed: _Observation
    source_inputs: list[Any]
    extras: list[Any]
    progress: list[tuple[int, int]]


def _published(
    case: _Case, native: _Native, done: dict[str, object], observed: _Observation
) -> bytes:
    assert done["type"] == "smart-patch-executed" and done["protocolVersion"] == "1"
    assert done["requestId"] == case.command.request_id
    assert done["actualSeed"] == case.policy.sampling.seed
    assert len(observed.decoded) == 1
    decoded = observed.decoded[0]
    expected = (127.5 * (decoded[0, :, 0].clamp(-1, 1) + 1)).to(native.torch.uint8)
    expected_bytes = expected.permute(1, 2, 0).contiguous().numpy().tobytes()
    with Image.open(case.command.output_path) as image:
        image.load()
        assert image.format == "PNG" and image.mode == "RGB"
        assert image.size == (case.command.width, case.command.height)
        assert image.info.get("icc_profile") == SRGB_ICC_PROFILE
        pixels = image.tobytes()
    assert pixels == expected_bytes, "Smart flow PNG differs from original native decode"
    metadata = cast(dict[str, Any], done["output"])
    assert metadata["sha256"] == _sha(case.command.output_path.read_bytes())
    assert metadata["byteSize"] == case.command.output_path.stat().st_size
    _assert_files(case)
    return pixels


def _run(
    case: _Case,
    native: _Native,
    patch: pytest.MonkeyPatch,
    *,
    ordinary: bool = False,
    frontend: bool = False,
    progress_sink: Any = None,
) -> _FlowRun:
    extras: list[Any] = []
    source_inputs: list[Any] = []
    progress: list[tuple[int, int]] = []
    result: Any = None
    original_extra = regional.encode_anima_prompt
    original_source = cast(Any, type(native.models.vae)).encode
    original_prepared = smart.run_prepared_anima_smart_patch_regional

    @wraps(original_extra)
    def extra(value: Any, *args: Any, **kwargs: Any) -> Any:
        extras.append(copy.deepcopy(value))
        return original_extra(value, *args, **kwargs)

    @wraps(original_source)
    def source(self: Any, value: Any, *args: Any, **kwargs: Any) -> Any:
        if self is native.models.vae:
            source_inputs.append(value.detach().cpu().clone())
        return original_source(self, value, *args, **kwargs)

    def forbidden_keep(*_args: Any, **_kwargs: Any) -> Any:
        pytest.fail("Smart TXT/IMG retargeted into the inpaint/KEEP executor")

    def report(step: int, total: int) -> None:
        progress.append((step, total))
        if progress_sink is not None:
            progress_sink(step, total)

    def load(bundle: Any, *, device: str, dtype: Any) -> Any:
        assert bundle == case.policy.bundle and device == "cuda" and dtype == native.torch.bfloat16
        return native.models

    @wraps(original_prepared)
    def prepared(*args: Any, **kwargs: Any) -> Any:
        nonlocal result
        assert kwargs["profile"] == native.profile == "cuda-bfloat16-v1"
        kwargs["tokenizers"] = native.tokenizers
        result = original_prepared(*args, **kwargs)
        return result

    with patch.context() as scope:
        scope.setattr(regional, "encode_anima_prompt", extra)
        scope.setattr(cast(Any, type(native.models.vae)), "encode", source)
        scope.setattr(smart_patch_denoising, "generate_anima_outpaint", forbidden_keep)
        # The ordinary owner has a native Wan cache side effect; scope that cache
        # exactly as the private regional owner does, without changing arithmetic.
        cache = (
            regional._vae_cache_scope(native.models.vae)  # pyright: ignore[reportPrivateUsage]
            if ordinary
            else nullcontext()
        )
        with cache, _observed(native, scope) as observed:
            if frontend:
                assert not ordinary and native.profile == "cuda-bfloat16-v1"
                scope.setattr(anima_worker, "load_anima_models", load)
                scope.setattr(smart, "run_prepared_anima_smart_patch_regional", prepared)
                done = smart.execute_anima_smart_patch_regional(
                    case.value,
                    config_dir=case.command.staging_root,
                    runtime=native.runtime,
                    on_progress=report,
                )
            else:
                if ordinary:
                    result = run_smart_patch_anima(
                        anima_sampling_payload(case.policy.sampling),
                        anima_prompt_payload(case.policy.positive_prompt),
                        anima_prompt_payload(case.policy.negative_prompt),
                        native.models,
                        case.inputs,
                        tokenizers=native.oracle_tokenizers,
                        progress=report,
                    )
                else:
                    result = original_prepared(
                        case.captured,
                        native.models,
                        case.inputs,
                        runtime=native.runtime,
                        profile=native.profile,
                        tokenizers=native.tokenizers,
                        progress=report,
                    )
                done = cast(Any, smart_patch_execution)._publish(
                    case.command, result.image, case.policy.sampling.seed
                )
        pixels = _published(case, native, done, observed)
    assert result is not None and result.image.tobytes() == pixels
    assert progress == [
        (step, case.policy.sampling.total_steps)
        for step in range(1, case.policy.sampling.total_steps + 1)
    ]
    return _FlowRun(result, done, pixels, observed, source_inputs, extras, progress)


def _association(case: _Case, native: _Native, run: _FlowRun, contexts: tuple[Any, Any]) -> None:
    """Check signed consumers after actual exclusive processing PNG publication."""
    torch, observed = native.torch, run.observed
    cfg = not math.isclose(case.policy.sampling.guidance_scale, 1)
    signs = 2 if cfg else 1
    steps = case.policy.sampling.total_steps
    streams = _streams(case, "positive") + (_streams(case, "negative") if cfg else [])
    assert observed.qwen == observed.conditioner == (2 + len(streams) if steps else 0)
    assert len(observed.passes) == signs * steps
    assert len(observed.decoded) == 1
    masks = (_mask(case, native, "positive"), _mask(case, native, "negative"))
    for index, item in enumerate(observed.passes):
        assert torch.equal(item["context"], contexts[index % signs])
    expected_sites = signs * steps * 2 * len(native.models.transformer.transformer_blocks)
    for collection in (observed.processors, observed.dispatch, observed.sdpa):
        assert len(collection) == expected_sites
        for item in collection:
            expected = (
                masks[item["pass"] % signs]
                if item["kind"] == "cross" and item["block"] % 2 == 0
                else None
            )
            assert (
                item["mask"] is None
                if expected is None
                else (item["mask"] is not None and torch.equal(item["mask"], expected))
            )
    for item in observed.dispatch:
        epsilon = float(torch.finfo(native.dtype).eps)
        assert item["maxError"] <= 4 * epsilon * (1 + item["maxMagnitude"])
    assert all(
        not item["borrowedWrapper"] and not item["borrowedBackend"] for item in observed.tokenizers
    )
    preflight = sum(
        index < 2 or record["text"] != ""
        for index, record in enumerate(case.value["compiledPrompts"])
    )
    assert len(observed.tokenizers) == 2 * (preflight + observed.qwen)
    if case.command.mode == "txt2img":
        assert run.source_inputs == []
    else:
        assert len(run.source_inputs) == 1
        source = case.inputs.model_source
        assert source is not None
        expected = torch.frombuffer(bytearray(source.tobytes()), dtype=torch.uint8)
        expected = expected.reshape(case.command.height, case.command.width, 3).permute(2, 0, 1)
        expected = (expected.float().unsqueeze(0).unsqueeze(2) / 127.5 - 1).to(
            native.device, next(native.models.vae.parameters()).dtype
        )
        assert torch.equal(run.source_inputs[0], expected.cpu())


@pytest.mark.parametrize("mode", _MODES)
@pytest.mark.parametrize("scheduler", ("euler", "heun"))
def test_private_smart_flow_preserves_signed_native_consumers(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str, scheduler: str
) -> None:
    case = _case(tmp_path / f"{mode}-{scheduler}", mode, scheduler=scheduler)
    contexts = _contexts(case, native)
    with _preserved(native):
        run = _run(case, native, monkeypatch)
        _prediction_oracle(case, native, cast(Any, run), contexts[0], "positive")
        _prediction_oracle(case, native, cast(Any, run), contexts[1], "negative")
        _association(case, native, run, contexts)


@pytest.mark.parametrize("mode", _MODES)
def test_smart_flow_regional_prediction_red(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    case = _case(tmp_path / f"flow-{mode}", mode)
    contexts = _contexts(case, native)
    with _preserved(native):
        run = _run(case, native, monkeypatch)
        _prediction_oracle(case, native, cast(Any, run), contexts[1], "negative")
        _association(case, native, run, contexts)


def test_smart_flow_legacy_inpaint_control_green(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _inpaint_case(tmp_path / "legacy-inpaint")
    contexts = _contexts(case, native)
    with _preserved(native):
        run = _inpaint_run(case, native, monkeypatch)
        _prediction_oracle(case, native, run, contexts[1], "negative")


@pytest.mark.parametrize("mode", _MODES)
def test_zero_regions_preserve_original_smart_flow_exactly(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    actual = _case(tmp_path / "regional-zero", mode, regions=False)
    ordinary = _case(tmp_path / "ordinary-zero", mode, regions=False)
    with _preserved(native):
        first = _run(actual, native, monkeypatch)
        second = _run(ordinary, native, monkeypatch, ordinary=True)
        assert native.torch.equal(first.result.latents, second.result.latents)
        assert first.pixels == second.pixels
        assert actual.command.output_path.read_bytes() == ordinary.command.output_path.read_bytes()
        assert len(first.source_inputs) == len(second.source_inputs)
        assert first.extras == second.extras == []
        assert all(item["mask"] is None for item in first.observed.processors)


@pytest.mark.parametrize("mode", _MODES)
def test_cfg_one_preflights_both_signs_but_only_consumes_positive(
    cpu_native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    case = _case(tmp_path / "cfg-one", mode, guidance=1)
    contexts = _contexts(case, cpu_native)
    with _preserved(cpu_native):
        run = _run(case, cpu_native, monkeypatch)
        _association(case, cpu_native, run, contexts)
        assert len(run.extras) == len(_streams(case, "positive"))
        assert len(run.observed.tokenizers) > 2 * run.observed.qwen


@pytest.mark.parametrize("mode", _MODES)
def test_authored_strength_only_affects_image_initialization(
    cpu_native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    low = _case(tmp_path / "low", mode, strength=0.25)
    high = _case(tmp_path / "high", mode, strength=0.75)
    with _preserved(cpu_native):
        first = _run(low, cpu_native, monkeypatch)
        second = _run(high, cpu_native, monkeypatch)
        if mode == "txt2img":
            assert low.policy.sampling.strength is high.policy.sampling.strength is None
            assert first.progress == second.progress
            assert cpu_native.torch.equal(first.result.latents, second.result.latents)
            assert first.pixels == second.pixels
        else:
            assert low.policy.sampling.strength == 0.25 and high.policy.sampling.strength == 0.75
            assert len(first.progress) < len(second.progress)
            assert not cpu_native.torch.equal(first.result.latents, second.result.latents)
            assert low.inputs.model_source is not None and high.inputs.model_source is not None
            assert low.inputs.model_source.tobytes() == high.inputs.model_source.tobytes()


@pytest.mark.parametrize(
    ("mode", "change"),
    (
        ("txt2img", "source"),
        ("img2img", "missing-source"),
        ("txt2img", "keep"),
        ("img2img", "keep"),
    ),
)
def test_source_and_zero_keep_refuse_before_any_native_forward(
    cpu_native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str, change: str
) -> None:
    case = _case(tmp_path / change, mode)
    bad = replace(
        case.inputs,
        model_source=Image.new("RGB", (case.command.width, case.command.height))
        if change == "source"
        else None
        if change == "missing-source"
        else case.inputs.model_source,
        latent_keep_mask=Image.new("L", case.inputs.latent_keep_mask.size, 1)
        if change == "keep"
        else case.inputs.latent_keep_mask,
    )
    with _preserved(cpu_native), _observed(cpu_native, monkeypatch) as seen:
        with pytest.raises(DerivativeError) as caught:
            smart.run_prepared_anima_smart_patch_regional(
                case.captured,
                cpu_native.models,
                bad,
                runtime=cpu_native.runtime,
                profile=cpu_native.profile,
                tokenizers=cpu_native.tokenizers,
            )
        assert caught.value.code == "INVALID_REQUEST"
        assert seen.qwen == seen.conditioner == 0 and not seen.passes and not seen.decoded
    assert not case.command.output_path.exists()


@pytest.mark.parametrize("mode", _MODES)
@pytest.mark.parametrize("change", ("profile", "plan"))
def test_private_profile_plan_cannot_cross_modes(tmp_path: Path, mode: str, change: str) -> None:
    case = _case(tmp_path / change, mode)
    value = copy.deepcopy(case.value)
    other = "img2img" if mode == "txt2img" else "txt2img"
    if change == "profile":
        value["profile"] = _PROFILES[other]
    else:
        value["execution"]["inference"]["sampling"]["mode"] = other
    with pytest.raises(DerivativeError) as caught:
        smart.capture_anima_smart_patch_regional_input(value)
    assert caught.value.code == "INVALID_REQUEST"
    assert not case.command.output_path.exists()


@pytest.mark.parametrize("mode", _MODES)
def test_partial_flow_transport_cannot_replace_inner_command_identity(
    tmp_path: Path, mode: str
) -> None:
    case = _case(tmp_path / "private-only", mode)
    bundle = copy.deepcopy(case.value)
    bundle["promptInterpretation"] = "invoke-fragments-v1"
    path = case.command.staging_root / "smart-regional.json"
    path.write_text(json.dumps(bundle))
    path.chmod(0o600)
    envelope = {
        "type": "execute-anima-smart-patch-regional",
        "protocolVersion": "1",
        "requestId": f"different-{case.command.request_id}",
        "stagingRoot": str(case.command.staging_root),
        "bundle": _descriptor(path),
    }
    with pytest.raises(DerivativeError) as caught:
        worker.parse_anima_smart_patch_regional_request(envelope)
    assert caught.value.code == "INVALID_REQUEST"
    assert "command identity/staging" in str(caught.value)
    assert not case.command.output_path.exists()


@pytest.mark.parametrize("mode", _MODES)
def test_invalid_flow_prediction_factory_refuses_before_conditioning(
    cpu_native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    case = _case(tmp_path / "invalid-factory", mode)
    with _preserved(cpu_native), _observed(cpu_native, monkeypatch) as seen:
        with pytest.raises(DerivativeError) as caught:
            flow.generate_anima_flow_sampling(
                anima_sampling_payload(case.policy.sampling),
                anima_prompt_payload(case.policy.positive_prompt),
                anima_prompt_payload(case.policy.negative_prompt),
                cpu_native.models,
                source_image=case.inputs.model_source,
                tokenizers=cpu_native.tokenizers,
                prediction_factory=cast(Any, object()),
            )
        assert caught.value.code == "INVALID_REQUEST"
        assert seen.qwen == seen.conditioner == 0 and not seen.passes


@pytest.mark.parametrize("mode", _MODES)
@pytest.mark.parametrize("failure", ("later-native", "decode"))
def test_late_flow_failure_restores_and_allows_fresh_call(
    cpu_native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str, failure: str
) -> None:
    case = _case(tmp_path / failure, mode)
    sentinel = RuntimeError("declared private Smart flow failure")
    owner = cpu_native.models.transformer if failure == "later-native" else cpu_native.models.vae
    attribute = "forward" if failure == "later-native" else "decode"
    cls = cast(Any, type(owner))
    original = getattr(cls, attribute)
    calls = 0

    @wraps(original)
    def broken(self: Any, *args: Any, **kwargs: Any) -> Any:
        nonlocal calls
        actual = original(self, *args, **kwargs)
        if self is owner:
            calls += 1
            if calls == (3 if failure == "later-native" else 1):
                raise sentinel
        return actual

    with _preserved(cpu_native), monkeypatch.context() as patch:
        patch.setattr(cls, attribute, broken)
        with pytest.raises((RuntimeError, DerivativeError)) as caught:
            _run(case, cpu_native, patch)
        assert _contains_cause(caught.value, sentinel)
        assert calls >= 1 and not case.command.output_path.exists()
        _assert_files(case)
    with _preserved(cpu_native):
        healthy = _run(case, cpu_native, monkeypatch)
        _association(case, cpu_native, healthy, _contexts(case, cpu_native))


@pytest.fixture(scope="module")
def cuda_native(native_factory: Any) -> _Native:
    return cast(_Native, native_factory("cuda-bfloat16"))


@pytest.mark.parametrize("mode", _MODES)
def test_genuine_main_flow_handoff_reaches_complete_native_frontend(
    cuda_native: _Native, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    directory = os.environ.get("IGS_SMART_FLOW_HANDOFF_DIR")
    if directory is None:
        pytest.skip("Genuine Main flow handoff requires ROOT-authored saved/reopened inputs.")
    path = Path(directory) / f"bound-{mode}.json"
    value = json.loads(path.read_text())
    captured = smart.capture_anima_smart_patch_regional_input(value)
    inputs = smart_patch_execution.capture_smart_patch_execution(captured.command)
    case = _Case(
        value,
        captured,
        inputs,
        b""
        if captured.command.model_source is None
        else captured.command.model_source.path.read_bytes(),
        captured.command.latent_keep_mask.path.read_bytes(),
    )
    assert case.command.mode == mode and case.value["profile"] == _PROFILES[mode]
    before = path.read_bytes()
    contexts = _contexts(case, cuda_native)
    with _preserved(cuda_native):
        run = _run(case, cuda_native, monkeypatch, frontend=True)
        _prediction_oracle(case, cuda_native, cast(Any, run), contexts[0], "positive")
        _prediction_oracle(case, cuda_native, cast(Any, run), contexts[1], "negative")
        _association(case, cuda_native, run, contexts)
    assert path.read_bytes() == before, "Native consumption rewrote the complete Main recipe"
