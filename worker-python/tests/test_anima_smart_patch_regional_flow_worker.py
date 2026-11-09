"""Public owned descriptors carry Smart TXT/IMG to original signed Anima.

InvokeAI4875d96531ca6712b288f6e660fcbb34143408c1 compileCanvasGraph.ts joins
the same regional collector after each mode's source graft; anima_denoise.py
uses separate signed conditioning with either initializer. Original small native
CPU/CUDA models, solvers, source VAE, attention/SDPA, decode and exclusive PNG
publication stay real. Availability and resource/model loading are explicit
collaborators, as in the existing public descriptor fixture; pinned companion
metadata does not attest the synthetic fixture weight bytes. Main/installed
catalog, durable queue/Retry and trained-quality qualification belong to ROOT.
"""

from __future__ import annotations

import copy
from functools import wraps
from pathlib import Path
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import anima_regional as regional
from imagegen_worker import anima_smart_patch_regional as smart
from imagegen_worker import anima_smart_patch_regional_worker as worker
from imagegen_worker import inference_main, smart_patch_denoising, smart_patch_execution
from imagegen_worker.anima_worker import anima_prompt_payload, anima_sampling_payload
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.inference_anima import ANIMA_BASE_ARCHITECTURE
from imagegen_worker.smart_patch_denoising import run_smart_patch_anima
from test_anima_regional import (
    _Native,  # pyright: ignore[reportPrivateUsage]
    _observed,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional import native as native
from test_anima_regional import native_factory as native_factory
from test_anima_regional_worker import _runtime  # pyright: ignore[reportPrivateUsage]
from test_anima_smart_patch_regional import (
    _contexts,  # pyright: ignore[reportPrivateUsage]
    _prediction_oracle,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_smart_patch_regional_flow import (
    _association,  # pyright: ignore[reportPrivateUsage]
    _FlowRun,  # pyright: ignore[reportPrivateUsage]
    _published,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_smart_patch_regional_flow import (
    _case as _flow_case,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_smart_patch_regional_worker import (
    _available,  # pyright: ignore[reportPrivateUsage]
    _descriptor,  # pyright: ignore[reportPrivateUsage]
    _files,  # pyright: ignore[reportPrivateUsage]
    _native_execute,  # pyright: ignore[reportPrivateUsage]
    _tripwire,  # pyright: ignore[reportPrivateUsage]
    _WireCase,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_smart_patch_regional_worker import (
    _case as _inpaint_case,  # pyright: ignore[reportPrivateUsage]
)
from test_smart_patch_execution import _write_ref  # pyright: ignore[reportPrivateUsage]

_MODES = ("txt2img", "img2img")
_CAPABILITIES = (
    "anima-smart-patch-regional-txt2img-v1",
    "anima-smart-patch-regional-img2img-v1",
)


def _case(
    directory: Path, mode: str, *, scheduler: str = "euler", regions: bool = True
) -> _WireCase:
    private = _flow_case(directory, mode, scheduler=scheduler, regions=regions)
    if private.command.model_source is not None:
        private.command.model_source.path.chmod(0o600)
    private.command.latent_keep_mask.path.chmod(0o600)
    identities = ANIMA_BASE_ARCHITECTURE.companion_identities
    assert identities is not None
    for role, key in (("qwen3Encoder", "qwen3_encoder"), ("vae", "vae")):
        digest, size = identities[key]
        private.value["execution"]["inference"]["model"][role].update(sha256=digest, byteSize=size)
    private.captured = smart.capture_anima_smart_patch_regional_input(private.value)
    bundle = copy.deepcopy(private.value)
    bundle["promptInterpretation"] = "invoke-fragments-v1"
    for index, region in enumerate(bundle["recipe"]["regions"]):
        path = private.command.staging_root / f"regional-{index}.alpha8"
        path.write_bytes(bytes(region["coverage"]["alpha"]))
        path.chmod(0o600)
        region["coverage"]["alpha"] = {"$alpha8": _descriptor(path)}
    result = _WireCase(
        private,
        bundle,
        {
            "type": "execute-anima-smart-patch-regional",
            "protocolVersion": "1",
            "requestId": private.command.request_id,
            "stagingRoot": str(private.command.staging_root),
        },
    )
    result.seal()
    return result


def _run(
    case: _WireCase,
    native: _Native,
    patch: pytest.MonkeyPatch,
    *,
    ordinary: bool = False,
    progress_sink: Any = None,
) -> _FlowRun:
    """Actual dispatcher/descriptor; original computation and publication."""
    result: Any = None
    extras: list[Any] = []
    sources: list[Any] = []
    progress: list[tuple[int, int]] = []
    original_extra = regional.encode_anima_prompt
    vae_cls = cast(Any, type(native.models.vae))
    original_source = vae_cls.encode

    @wraps(original_extra)
    def extra(value: Any, *args: Any, **kwargs: Any) -> Any:
        extras.append(copy.deepcopy(value))
        return original_extra(value, *args, **kwargs)

    @wraps(original_source)
    def source(self: Any, value: Any, *args: Any, **kwargs: Any) -> Any:
        if self is native.models.vae:
            sources.append(value.detach().cpu().clone())
        return original_source(self, value, *args, **kwargs)

    def forbidden_keep(*_args: Any, **_kwargs: Any) -> Any:
        pytest.fail("Public Smart TXT/IMG entered the INP/OUT KEEP executor")

    def report(step: int, total: int) -> None:
        progress.append((step, total))
        if progress_sink is not None:
            progress_sink(step, total)

    def wire_report(event: dict[str, object]) -> None:
        assert event["type"] == "generation-progress" and event["protocolVersion"] == "1"
        assert event["requestId"] == case.private.command.request_id
        report(cast(int, event["step"]), cast(int, event["totalSteps"]))

    def prepared(command: Any, **kwargs: Any) -> dict[str, object]:
        nonlocal result
        captured = kwargs.get("_anima_regional")
        inputs = smart_patch_execution.capture_smart_patch_execution(command)
        if captured is None:
            with regional._vae_cache_scope(native.models.vae):  # pyright: ignore[reportPrivateUsage]
                result = run_smart_patch_anima(
                    anima_sampling_payload(command.inference.sampling),
                    anima_prompt_payload(command.inference.positive_prompt),
                    anima_prompt_payload(command.inference.negative_prompt),
                    native.models,
                    inputs,
                    tokenizers=native.oracle_tokenizers,
                    progress=kwargs.get("on_progress"),
                )
        else:
            assert captured.command is command and captured.policy is command.inference
            result = smart.run_prepared_anima_smart_patch_regional(
                captured,
                native.models,
                inputs,
                runtime=native.runtime,
                profile=native.profile,
                tokenizers=native.tokenizers,
                progress=kwargs.get("on_progress"),
            )
        return cast(Any, smart_patch_execution)._publish(
            command, result.image, command.inference.sampling.seed
        )

    with patch.context() as scope:
        scope.setattr(worker, "execute_smart_patch", prepared)
        scope.setattr(worker, "supports_anima_compute", _available)
        scope.setattr(smart_patch_execution, "execute_smart_patch", prepared)
        scope.setattr(regional, "encode_anima_prompt", extra)
        scope.setattr(vae_cls, "encode", source)
        scope.setattr(smart_patch_denoising, "generate_anima_outpaint", forbidden_keep)
        case.wire["reportProgress"] = True
        with _observed(native, scope) as observed:
            if ordinary:
                done = inference_main.process_inference_request(
                    case.private.value["execution"],
                    config_dir=case.root,
                    runtime=native.runtime,
                    on_progress=wire_report,
                )
            else:
                done = inference_main.process_inference_request(
                    case.wire,
                    config_dir=case.root,
                    runtime=native.runtime,
                    on_progress=wire_report,
                )
        assert done["requestId"] == case.private.command.request_id
        assert done["protocolVersion"] == "1"
        if done["type"] == "error":
            assert "output" not in done
            raise DerivativeError(cast(str, done["code"]), cast(str, done["message"]))
        assert result is not None
        pixels = _published(case.private, native, done, observed)
    assert result.image.tobytes() == pixels
    assert progress == [
        (step, case.private.policy.sampling.total_steps)
        for step in range(1, case.private.policy.sampling.total_steps + 1)
    ]
    return _FlowRun(result, done, pixels, observed, sources, extras, progress)


@pytest.mark.parametrize("mode", _MODES)
def test_smart_flow_descriptor_dispatch_red(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    case = _case(tmp_path / f"descriptor-{mode}", mode)
    contexts = _contexts(case.private, native)
    with _preserved(native):
        run = _run(case, native, monkeypatch)
        # This exact independent record/assertion occurs after the actual PNG.
        _prediction_oracle(case.private, native, cast(Any, run), contexts[1], "negative")
        _association(case.private, native, run, contexts)


def test_smart_flow_descriptor_inpaint_control_green(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _inpaint_case(tmp_path / "legacy-inpaint")
    contexts = _contexts(case.private, native)
    with _preserved(native):
        run = _native_execute(case, native, monkeypatch)
        _prediction_oracle(case.private, native, run, contexts[1], "negative")


@pytest.mark.parametrize("mode", _MODES)
def test_public_flow_heun_preserves_original_signed_consumers(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    case = _case(tmp_path / f"heun-{mode}", mode, scheduler="heun")
    contexts = _contexts(case.private, native)
    with _preserved(native):
        run = _run(case, native, monkeypatch)
        _prediction_oracle(case.private, native, cast(Any, run), contexts[0], "positive")
        _prediction_oracle(case.private, native, cast(Any, run), contexts[1], "negative")
        _association(case.private, native, run, contexts)


@pytest.mark.parametrize("mode", _MODES)
def test_public_zero_regions_match_original_ordinary_flow(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    regional_case = _case(tmp_path / "regional-zero", mode, regions=False)
    ordinary_case = _case(tmp_path / "ordinary-zero", mode, regions=False)
    with _preserved(native):
        first = _run(regional_case, native, monkeypatch)
        second = _run(ordinary_case, native, monkeypatch, ordinary=True)
        assert native.torch.equal(first.result.latents, second.result.latents)
        assert first.pixels == second.pixels
        assert regional_case.private.command.output_path.read_bytes() == (
            ordinary_case.private.command.output_path.read_bytes()
        )
        assert first.extras == second.extras == []
        assert len(first.source_inputs) == len(second.source_inputs) == int(mode == "img2img")


@pytest.mark.parametrize("mode", _MODES)
def test_public_flow_snapshot_owns_every_signed_stream(tmp_path: Path, mode: str) -> None:
    case = _case(tmp_path / "owned", mode)
    before = _files(case)
    parsed = worker.parse_anima_smart_patch_regional_request(case.wire)
    assert parsed.captured.command.mode == mode
    assert parsed.captured.regional.prompts == case.private.captured.regional.prompts
    assert parsed.captured.policy is parsed.captured.command.inference
    assert parsed.captured.processing_size == (72, 64)
    assert parsed.captured.regional.bbox == (-13, 5, 107, 73)
    original_alpha = parsed.captured.regional.regions[1].alpha
    (case.root / "regional-1.alpha8").write_bytes(b"\xff" * (107 * 73))
    case.bundle["compiledPrompts"][-1]["text"] = "late unrelated Canvas negative"
    assert parsed.captured.regional.regions[1].alpha == original_alpha
    assert parsed.captured.regional.prompts[-1].text != "late unrelated Canvas negative"
    assert before["keep.png"] == (case.root / "keep.png").read_bytes()


def test_public_flow_capabilities_require_actual_anima_compute() -> None:
    assert (
        worker.ANIMA_SMART_PATCH_REGIONAL_TXT2IMG_CAPABILITY,
        worker.ANIMA_SMART_PATCH_REGIONAL_IMG2IMG_CAPABILITY,
    ) == _CAPABILITIES
    for unavailable in (
        inference_main.inference_ready_message(),
        inference_main.inference_ready_message(_runtime(bf16=False)),
    ):
        capabilities = cast(list[str], unavailable["capabilities"])
        assert not any(capability in capabilities for capability in _CAPABILITIES)
    actual = cast(list[str], inference_main.inference_ready_message(_runtime())["capabilities"])
    assert all(capability in actual for capability in _CAPABILITIES)
    assert worker.ANIMA_SMART_PATCH_REGIONAL_CAPABILITY in actual
    assert worker.ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_CAPABILITY in actual
    assert "anima-regional-negative-v1" in actual
    assert "smart-patch-execution" in actual and "smart-patch-seed-confirmation" in actual


@pytest.mark.parametrize("mode", _MODES)
def test_public_flow_exact_companion_is_required_before_model(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    case = _case(tmp_path / "companion", mode)
    case.bundle["execution"]["inference"]["model"]["qwen3Encoder"]["sha256"] = "0" * 64
    case.seal()
    monkeypatch.setattr(worker, "execute_smart_patch", _tripwire)
    with pytest.raises(DerivativeError) as caught:
        worker.execute_anima_smart_patch_regional_request(
            case.wire, config_dir=tmp_path, runtime=_runtime()
        )
    assert caught.value.code == "INVALID_REQUEST"
    assert "pinned Qwen3 and VAE" in str(caught.value)
    assert not case.private.command.output_path.exists()


@pytest.mark.parametrize("mode", _MODES)
def test_public_flow_existing_output_is_preserved(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    case = _case(tmp_path / "existing", mode)
    original = b"unrelated preexisting output"
    case.private.command.output_path.write_bytes(original)
    monkeypatch.setattr(worker, "execute_smart_patch", _tripwire)
    with pytest.raises(DerivativeError) as caught:
        worker.execute_anima_smart_patch_regional_request(
            case.wire, config_dir=tmp_path, runtime=_runtime()
        )
    assert caught.value.code == "OUTPUT_UNAVAILABLE"
    assert case.private.command.output_path.read_bytes() == original


@pytest.mark.parametrize("mode", _MODES)
@pytest.mark.parametrize(
    "change", ("profile", "inner-mode", "seed", "compiled-negative", "outer-id", "marker")
)
def test_public_flow_association_refuses_before_model(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str, change: str
) -> None:
    case = _case(tmp_path / change, mode)
    if change == "profile":
        case.bundle["profile"] = (
            "invoke-anima-smart-regional-img2img-v1"
            if mode == "txt2img"
            else "invoke-anima-smart-regional-txt2img-v1"
        )
    elif change == "inner-mode":
        case.bundle["execution"]["mode"] = "inpaint"
    elif change == "seed":
        case.bundle["recipe"]["item"]["seed"] += 1
    elif change == "compiled-negative":
        case.bundle["compiledPrompts"][-1]["sourceId"] = case.bundle["recipe"]["layerId"]
    elif change == "outer-id":
        case.wire["requestId"] = "different-request"
    else:
        del case.bundle["promptInterpretation"]
    case.seal()
    monkeypatch.setattr(worker, "execute_smart_patch", _tripwire)
    with pytest.raises(DerivativeError) as caught:
        worker.execute_anima_smart_patch_regional_request(
            case.wire, config_dir=tmp_path, runtime=_runtime()
        )
    assert caught.value.code == "INVALID_REQUEST"
    assert not case.private.command.output_path.exists()


@pytest.mark.parametrize("mode", _MODES)
@pytest.mark.parametrize("change", ("digest", "size", "symlink", "alias"))
def test_public_flow_later_raw_refuses_before_model(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str, change: str
) -> None:
    case = _case(tmp_path / change, mode)
    raw = case.root / "regional-1.alpha8"
    descriptor = case.bundle["recipe"]["regions"][1]["coverage"]["alpha"]["$alpha8"]
    if change == "digest":
        raw.write_bytes(b"\xff" * raw.stat().st_size)
    elif change == "size":
        descriptor["byteSize"] -= 1
    elif change == "symlink":
        foreign = tmp_path / "foreign.alpha8"
        raw.rename(foreign)
        raw.symlink_to(foreign)
    else:
        descriptor.update(case.bundle["recipe"]["regions"][0]["coverage"]["alpha"]["$alpha8"])
    case.seal()
    monkeypatch.setattr(worker, "execute_smart_patch", _tripwire)
    with pytest.raises(DerivativeError):
        worker.execute_anima_smart_patch_regional_request(
            case.wire, config_dir=tmp_path, runtime=_runtime()
        )
    assert not case.private.command.output_path.exists()


@pytest.mark.parametrize(
    ("mode", "change"),
    (
        ("txt2img", "source"),
        ("img2img", "missing-source"),
        ("txt2img", "keep"),
        ("img2img", "keep"),
    ),
)
def test_public_flow_source_and_keep_refuse_before_resource_loading(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str, change: str
) -> None:
    case = _case(tmp_path / change, mode)
    if change == "source":
        case.bundle["execution"]["modelSource"] = {
            **_descriptor(case.root / "source.png"),
            "width": 72,
            "height": 64,
        }
    elif change == "missing-source":
        case.bundle["execution"]["modelSource"] = None
    else:
        numeric = Image.new("RGBA", (9, 8), "white")
        numeric.putalpha(Image.new("L", numeric.size, 1))
        case.bundle["execution"]["latentKeepMask"] = _write_ref(
            case.root / "keep.png", numeric, srgb=False
        )
    case.seal()
    monkeypatch.setattr(worker, "supports_anima_compute", _available)
    monkeypatch.setattr(cast(Any, smart_patch_execution), "_verify_resources", _tripwire)
    with pytest.raises(DerivativeError) as caught:
        worker.execute_anima_smart_patch_regional_request(
            case.wire, config_dir=tmp_path, runtime=_runtime()
        )
    assert caught.value.code == "INVALID_REQUEST"
    assert not case.private.command.output_path.exists()


@pytest.mark.parametrize("mode", _MODES)
def test_public_flow_progress_failure_restores_and_recovers(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    case = _case(tmp_path / f"failed-{mode}", mode)
    sentinel = RuntimeError("declared public flow progress failure")
    progress: list[tuple[int, int]] = []

    def fail(step: int, total: int) -> None:
        progress.append((step, total))
        raise sentinel

    with _preserved(native):
        with pytest.raises(DerivativeError) as caught:
            _run(case, native, monkeypatch, progress_sink=fail)
        # The real dispatcher deliberately translates the callback exception to
        # its public failure response, without exposing an in-process cause.
        assert caught.value.code == "GENERATION_WORKER_FAILED"
        assert progress == [(1, case.private.policy.sampling.total_steps)]
        assert not case.private.command.output_path.exists()
    with _preserved(native):
        healthy = _run(case, native, monkeypatch)
        contexts = _contexts(case.private, native)
        _prediction_oracle(case.private, native, cast(Any, healthy), contexts[1], "negative")
        _association(case.private, native, healthy, contexts)
