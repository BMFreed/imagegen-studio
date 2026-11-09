"""Owned descriptor dispatch to original Smart/Anima signed native consumers.

Literal complete inputs use real Main TypeScript prompt/sampling compilation;
these are not genuine saved Main or trained model fixtures. The native tests
replace only CUDA availability/model construction with existing qualified small
CPU/CUDA originals and explicit production resource/loading collaborators. The
declared companion metadata is not a claim about the fixture stub weight bytes.
Descriptor snapshots, dispatcher, strict complete capture,
signed native conditioning/attention/KEEP/decode and exclusive RGB publication
remain real. ROOT owns installed queue/Retry and trained qualification.
"""

from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import anima_regional as regional
from imagegen_worker import anima_smart_patch_regional as smart
from imagegen_worker import anima_smart_patch_regional_worker as worker
from imagegen_worker import inference_main, smart_patch_execution
from imagegen_worker.anima_worker import anima_prompt_payload, anima_sampling_payload
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.inference_anima import ANIMA_BASE_ARCHITECTURE
from imagegen_worker.smart_patch_denoising import run_smart_patch_anima
from test_anima_regional import (
    _Native,  # pyright: ignore[reportPrivateUsage]
    _observed,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional import cpu_native as cpu_native
from test_anima_regional import native as native
from test_anima_regional import native_factory as native_factory
from test_anima_regional_outpaint import _execution  # pyright: ignore[reportPrivateUsage]
from test_anima_regional_worker import _runtime  # pyright: ignore[reportPrivateUsage]
from test_anima_smart_patch_regional import (
    _association,  # pyright: ignore[reportPrivateUsage]
    _Case,  # pyright: ignore[reportPrivateUsage]
    _contexts,  # pyright: ignore[reportPrivateUsage]
    _keep_oracle,  # pyright: ignore[reportPrivateUsage]
    _prediction_oracle,  # pyright: ignore[reportPrivateUsage]
    _Run,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_smart_patch_regional import (
    _case as _private_case,  # pyright: ignore[reportPrivateUsage]
)


def _sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _descriptor(path: Path) -> dict[str, Any]:
    raw = path.read_bytes()
    return {"path": str(path), "byteSize": len(raw), "sha256": _sha(raw)}


@dataclass
class _WireCase:
    private: _Case
    bundle: dict[str, Any]
    wire: dict[str, Any]

    @property
    def root(self) -> Path:
        return self.private.command.staging_root

    def seal(self, raw: bytes | None = None) -> None:
        path = self.root / "smart-regional.json"
        path.write_bytes(json.dumps(self.bundle).encode("utf-8") if raw is None else raw)
        path.chmod(0o600)
        self.wire["bundle"] = _descriptor(path)


def _case(directory: Path, *, regions: bool = True) -> _WireCase:
    private = _private_case(directory, regions=regions)
    private.command.model_source.path.chmod(0o600)
    private.command.latent_keep_mask.path.chmod(0o600)
    identities = ANIMA_BASE_ARCHITECTURE.companion_identities
    assert identities is not None
    for role, name in (("qwen3Encoder", "qwen3_encoder"), ("vae", "vae")):
        digest, size = identities[name]
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


def _files(case: _WireCase) -> dict[str, bytes]:
    return {path.name: path.read_bytes() for path in case.root.iterdir() if path.is_file()}


def _tripwire(*_args: Any, **_kwargs: Any) -> Any:
    pytest.fail("Malformed Smart regional transport reached native/model work")


def _available(_runtime: object) -> bool:
    return True


def test_descriptor_snapshot_keeps_non_aligned_world_and_owned_signed_input(tmp_path: Path) -> None:
    case = _case(tmp_path / "owned")
    before = _files(case)
    parsed = worker.parse_anima_smart_patch_regional_request(case.wire)
    assert parsed.captured.regional.bbox == (-13, 5, 107, 73)
    assert parsed.captured.processing_size == (72, 64)
    assert parsed.captured.policy is parsed.captured.command.inference
    assert parsed.captured.regional.prompts == case.private.captured.regional.prompts
    assert parsed.captured.regional.regions == case.private.captured.regional.regions
    assert parsed.report_progress is False
    case.bundle["recipe"]["globalPrompts"]["negative"]["text"] = "later Canvas mutation"
    raw = case.root / "regional-0.alpha8"
    raw.write_bytes(b"\xff" * raw.stat().st_size)
    assert parsed.captured.regional.regions[0].alpha == bytes(
        case.private.recipe["regions"][0]["coverage"]["alpha"]
    )
    assert before["source.png"] == (case.root / "source.png").read_bytes()
    assert before["keep.png"] == (case.root / "keep.png").read_bytes()
    assert parsed.captured.regional.prompts[1].text != "later Canvas mutation"


@pytest.mark.parametrize("marker", [None, True, 1, "", "legacy", [], {}])
def test_public_interpretation_is_explicit_and_private_absence_stays_valid(
    tmp_path: Path, marker: Any
) -> None:
    case = _case(tmp_path / "interpretation")
    assert smart.capture_anima_smart_patch_regional_input(case.private.value)
    case.bundle["promptInterpretation"] = marker
    case.seal()
    with pytest.raises(DerivativeError):
        worker.parse_anima_smart_patch_regional_request(case.wire)
    bad = {**case.private.value, "promptInterpretation": marker}
    with pytest.raises(DerivativeError):
        smart.capture_anima_smart_patch_regional_input(bad)


def test_missing_public_interpretation_refuses_without_changing_legacy_input(
    tmp_path: Path,
) -> None:
    case = _case(tmp_path / "missing-marker")
    del case.bundle["promptInterpretation"]
    case.seal()
    with pytest.raises(DerivativeError):
        worker.parse_anima_smart_patch_regional_request(case.wire)
    assert smart.capture_anima_smart_patch_regional_input(case.private.value)


@pytest.mark.parametrize("role", ["qwen3Encoder", "vae"])
@pytest.mark.parametrize("field", ["sha256", "byteSize"])
def test_public_original_companion_identity_refuses_before_execution(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, role: str, field: str
) -> None:
    case = _case(tmp_path / f"{role}-{field}")
    resource = case.bundle["execution"]["inference"]["model"][role]
    resource[field] = "0" * 64 if field == "sha256" else resource[field] + 1
    case.seal()
    monkeypatch.setattr(worker, "execute_smart_patch", _tripwire)
    with pytest.raises(DerivativeError) as caught:
        worker.execute_anima_smart_patch_regional_request(
            case.wire, config_dir=tmp_path, runtime=_runtime()
        )
    assert "pinned Qwen3 and VAE" in str(caught.value)


def test_existing_output_is_preserved_before_any_native_execution(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "existing-output")
    case.private.command.output_path.write_bytes(b"foreign existing output")
    before = _files(case)
    monkeypatch.setattr(worker, "execute_smart_patch", _tripwire)
    with pytest.raises(DerivativeError) as caught:
        worker.execute_anima_smart_patch_regional_request(
            case.wire, config_dir=tmp_path, runtime=_runtime()
        )
    assert caught.value.code == "OUTPUT_UNAVAILABLE"
    assert _files(case) == before


@pytest.mark.parametrize(
    "change",
    [
        "outer-id",
        "outer-version",
        "outer-type",
        "outer-extra",
        "outer-root",
        "bundle-id",
        "bundle-root",
        "bundle-extra",
        "bundle-profile",
        "recipe-family",
        "recipe-owner",
        "recipe-seed",
        "recipe-processing",
        "recipe-global",
        "late-signed-record",
        "nonstatic-iteration",
        "nonstatic-pair",
    ],
)
def test_complete_association_refuses_before_model_callback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, change: str
) -> None:
    case = _case(tmp_path / change)
    if change == "outer-id":
        case.wire["requestId"] = "different-request"
    elif change == "outer-version":
        case.wire["protocolVersion"] = 1
    elif change == "outer-type":
        case.wire["type"] = "execute-smart-patch"
    elif change == "outer-extra":
        case.wire["execution"] = copy.deepcopy(case.bundle["execution"])
    elif change == "outer-root":
        other = tmp_path / "other"
        other.mkdir(mode=0o700)
        case.wire["stagingRoot"] = str(other)
    elif change == "bundle-id":
        case.bundle["execution"]["requestId"] = "different-request"
    elif change == "bundle-root":
        other = tmp_path / "other"
        other.mkdir(mode=0o700)
        case.bundle["execution"]["output"]["stagingRoot"] = str(other)
    elif change == "bundle-extra":
        case.bundle["replacementText"] = "not an approved override"
    elif change == "bundle-profile":
        case.bundle["profile"] = "invoke-krea2-global-support-v1"
    elif change == "recipe-family":
        case.bundle["recipe"]["family"] = "illustrious"
    elif change == "recipe-owner":
        case.bundle["recipe"]["regions"][1]["regionId"] = case.bundle["recipe"]["layerId"]
    elif change == "recipe-seed":
        case.bundle["recipe"]["item"]["seed"] += 1
    elif change == "recipe-processing":
        case.bundle["recipe"]["internalResolution"]["width"] += 8
    elif change == "recipe-global":
        case.bundle["recipe"]["globalPrompts"]["negative"]["text"] = "Canvas exclusion"
    elif change == "late-signed-record":
        case.bundle["compiledPrompts"][-1]["sourceId"] = case.bundle["recipe"]["layerId"]
    elif change == "nonstatic-iteration":
        case.bundle["recipe"]["item"]["iteration"] = 1
    else:
        case.bundle["recipe"]["item"]["promptPairIndex"] = 1
    case.seal()
    before = _files(case)
    monkeypatch.setattr(worker, "execute_smart_patch", _tripwire)
    with pytest.raises(DerivativeError):
        worker.execute_anima_smart_patch_regional_request(
            case.wire, config_dir=tmp_path, runtime=_runtime()
        )
    assert _files(case) == before


@pytest.mark.parametrize(
    "change",
    ["missing", "digest", "size", "symlink", "hardlink", "directory", "outside", "swap", "alias"],
)
def test_later_raw_member_is_qualified_before_any_model_work(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, change: str
) -> None:
    case = _case(tmp_path / change)
    path = case.root / "regional-1.alpha8"
    descriptor = case.bundle["recipe"]["regions"][1]["coverage"]["alpha"]["$alpha8"]
    if change == "missing":
        path.unlink()
    elif change == "digest":
        path.write_bytes(b"\xff" * path.stat().st_size)
    elif change == "size":
        descriptor["byteSize"] -= 1
    elif change == "symlink":
        real = tmp_path / "foreign-alpha"
        path.rename(real)
        path.symlink_to(real)
    elif change == "hardlink":
        (tmp_path / "second-link").hardlink_to(path)
    elif change == "directory":
        path.unlink()
        path.mkdir()
    elif change == "outside":
        real = tmp_path / "outside.alpha8"
        path.rename(real)
        descriptor["path"] = str(real)
    elif change == "swap":
        other = case.bundle["recipe"]["regions"][0]["coverage"]["alpha"]
        case.bundle["recipe"]["regions"][0]["coverage"]["alpha"] = copy.deepcopy(
            case.bundle["recipe"]["regions"][1]["coverage"]["alpha"]
        )
        case.bundle["recipe"]["regions"][1]["coverage"]["alpha"] = other
    else:
        source = case.bundle["execution"]["modelSource"]
        descriptor.update({key: source[key] for key in ("path", "byteSize", "sha256")})
    case.seal()
    monkeypatch.setattr(worker, "execute_smart_patch", _tripwire)
    with pytest.raises(DerivativeError):
        worker.execute_anima_smart_patch_regional_request(
            case.wire, config_dir=tmp_path, runtime=_runtime()
        )
    assert not case.private.command.output_path.exists()


@pytest.mark.parametrize(
    "change", ["bundle-size", "duplicate-json", "nonfinite-json", "truncated-json"]
)
def test_bundle_limits_and_json_shape_refuse_before_model_work(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, change: str
) -> None:
    case = _case(tmp_path / change)
    if change == "bundle-size":
        case.wire["bundle"]["byteSize"] = 1024 * 1024 + 1
    elif change == "duplicate-json":
        raw = json.dumps(case.bundle).encode()
        case.seal(b'{"schemaVersion":1,' + raw[1:])
    elif change == "nonfinite-json":
        case.seal(json.dumps({**case.bundle, "schemaVersion": float("nan")}).encode())
    else:
        case.seal(b'{"schemaVersion":')
    monkeypatch.setattr(worker, "execute_smart_patch", _tripwire)
    with pytest.raises(DerivativeError):
        worker.execute_anima_smart_patch_regional_request(
            case.wire, config_dir=tmp_path, runtime=_runtime()
        )


@pytest.mark.parametrize("report", [None, False, 1, "true"])
def test_present_progress_field_requires_exact_true(tmp_path: Path, report: Any) -> None:
    case = _case(tmp_path / "progress-invalid")
    case.wire["reportProgress"] = report
    with pytest.raises(DerivativeError):
        worker.parse_anima_smart_patch_regional_request(case.wire)


def test_exact_captured_command_owner_and_original_receipt_are_forwarded(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "forward")
    case.wire["reportProgress"] = True
    result: dict[str, object] = {"type": "smart-patch-executed", "sentinel": object()}
    calls: list[Any] = []

    def execute(command: Any, **kwargs: Any) -> dict[str, object]:
        captured = kwargs["_anima_regional"]
        assert captured.command is command and captured.policy is command.inference
        assert captured.regional.regions[0].alpha == bytes(
            case.private.recipe["regions"][0]["coverage"]["alpha"]
        )
        calls.append((command, kwargs))
        kwargs["on_progress"](1, command.inference.sampling.total_steps)
        return result

    monkeypatch.setattr(worker, "execute_smart_patch", execute)
    monkeypatch.setattr(worker, "supports_anima_compute", _available)
    progress: list[tuple[int, int]] = []
    before = _files(case)
    actual = worker.execute_anima_smart_patch_regional_request(
        case.wire,
        config_dir=tmp_path,
        runtime=_runtime(),
        on_progress=lambda step, total: progress.append((step, total)),
    )
    assert actual is result and len(calls) == 1
    assert progress == [(1, case.private.policy.sampling.total_steps)]
    assert _files(case) == before


def test_cpu_unavailability_and_missing_progress_sink_precede_execution(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "availability")
    monkeypatch.setattr(worker, "execute_smart_patch", _tripwire)
    with pytest.raises(DerivativeError) as unavailable:
        worker.execute_anima_smart_patch_regional_request(
            case.wire, config_dir=tmp_path, runtime=_runtime(bf16=False)
        )
    assert unavailable.value.code == "INFERENCE_UNAVAILABLE"
    case.wire["reportProgress"] = True
    with pytest.raises(DerivativeError) as missing:
        worker.execute_anima_smart_patch_regional_request(
            case.wire, config_dir=tmp_path, runtime=_runtime()
        )
    assert missing.value.code == "INVALID_REQUEST"


def test_capability_is_additive_and_requires_actual_anima_compute() -> None:
    capability = worker.ANIMA_SMART_PATCH_REGIONAL_CAPABILITY
    assert capability not in cast(
        list[str], inference_main.inference_ready_message()["capabilities"]
    )
    assert capability not in cast(
        list[str], inference_main.inference_ready_message(_runtime(bf16=False))["capabilities"]
    )
    actual = cast(list[str], inference_main.inference_ready_message(_runtime())["capabilities"])
    assert capability in actual
    assert "smart-patch-execution" in actual and "smart-patch-seed-confirmation" in actual
    assert "anima-regional-negative-v1" in actual


def _native_execute(
    case: _WireCase,
    native: _Native,
    patch: pytest.MonkeyPatch,
    *,
    ordinary: bool = False,
    progress_sink: Any = None,
) -> _Run:
    """Only availability/model construction are collaborators; originals compute."""
    result: Any = None
    extras: list[Any] = []
    progress: list[dict[str, object]] = []
    original_encode = regional.encode_anima_prompt

    def encode(value: Any, *args: Any, **kwargs: Any) -> Any:
        extras.append(copy.deepcopy(value))
        return original_encode(value, *args, **kwargs)

    def prepared(command: Any, **kwargs: Any) -> dict[str, object]:
        nonlocal result
        captured = kwargs.get("_anima_regional")
        inputs = smart_patch_execution.capture_smart_patch_execution(command)
        if captured is None:
            # Ordinary control has no borrowed-state scope; isolate that native
            # Wan cache side effect without changing its numerical computation.
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
        scope.setattr(regional, "encode_anima_prompt", encode)
        with _execution(native, scope) as execution, _observed(native, scope) as observed:
            if ordinary:
                done = inference_main.process_inference_request(
                    case.private.value["execution"],
                    config_dir=case.root,
                    runtime=native.runtime,
                    on_progress=progress.append,
                )
            else:
                case.wire["reportProgress"] = True
                done = worker.execute_anima_smart_patch_regional_request(
                    case.wire,
                    config_dir=case.root,
                    runtime=native.runtime,
                    on_progress=progress_sink
                    if progress_sink is not None
                    else lambda step, total: progress.append({"step": step, "totalSteps": total}),
                )
        assert result is not None and done["type"] == "smart-patch-executed"
        assert done["requestId"] == case.private.command.request_id
        assert done["actualSeed"] == case.private.policy.sampling.seed
        with Image.open(case.private.command.output_path) as image:
            image.load()
            assert image.format == "PNG" and image.mode == "RGB" and image.size == (72, 64)
            assert image.info.get("icc_profile") == SRGB_ICC_PROFILE
            pixels = image.tobytes()
        decoded = observed.decoded[0]
        expected = (127.5 * (decoded[0, :, 0].clamp(-1, 1) + 1)).to(native.torch.uint8)
        expected_bytes = expected.permute(1, 2, 0).contiguous().numpy().tobytes()
        assert bool(pixels == result.image.tobytes() == expected_bytes), (
            "Published RGB differs from native output."
        )
        metadata = cast(dict[str, Any], done["output"])
        assert metadata["sha256"] == _sha(case.private.command.output_path.read_bytes())
        assert progress and len(progress) == case.private.policy.sampling.total_steps
        assert (case.root / "source.png").read_bytes() == case.private.source_bytes
        assert (case.root / "keep.png").read_bytes() == case.private.keep_bytes
        return _Run(result, done, pixels, observed, execution, extras)


def test_smart_regional_descriptor_native_dispatch_red(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "native-regional")
    contexts = _contexts(case.private, native)
    with _preserved(native):
        run = _native_execute(case, native, monkeypatch)
        # A valid ordinary-dispatch substitution must publish real RGB before
        # the independently replayed native prediction detects the wrong bank.
        _prediction_oracle(case.private, native, run, contexts[1], "negative")
        _association(case.private, native, run, contexts)
        _keep_oracle(case.private, native, run)


def test_smart_regional_ordinary_dispatch_control_green(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "native-ordinary", regions=False)
    contexts = _contexts(case.private, native)
    with _preserved(native):
        run = _native_execute(case, native, monkeypatch, ordinary=True)
        _prediction_oracle(case.private, native, run, contexts[0], "positive")
        # Ordinary Smart does not run the regional owner's tokenizer preflight.
        # Observe its original encoders and every native consumer directly.
        observed = run.observed
        assert observed.qwen == observed.conditioner == 2
        assert run.extras == [] and len(observed.tokenizers) == 4
        assert all(
            not item["borrowedWrapper"] and not item["borrowedBackend"]
            for item in observed.tokenizers
        )
        assert len(observed.passes) == 2 * case.private.policy.sampling.total_steps
        for index, item in enumerate(observed.passes):
            assert native.torch.equal(item["context"], contexts[index % 2])
        count = len(observed.passes) * 2 * len(native.models.transformer.transformer_blocks)
        assert len(observed.processors) == len(observed.dispatch) == len(observed.sdpa) == count
        assert all(
            item["mask"] is None
            for collection in (observed.processors, observed.dispatch, observed.sdpa)
            for item in collection
        )
        for item in observed.dispatch:
            epsilon = float(native.torch.finfo(native.dtype).eps)
            assert item["maxError"] <= 4 * epsilon * (1 + item["maxMagnitude"])
        assert (
            len(observed.decoded) == len(run.execution.encodes) == len(run.execution.results) == 1
        )
        _keep_oracle(case.private, native, run)


def test_native_progress_failure_releases_owners_and_permits_fresh_descriptor(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "native-failure")
    sentinel = RuntimeError("later public Smart regional progress sentinel")

    def fail(step: int, _total: int) -> None:
        if step == 2:
            raise sentinel

    with _preserved(native):
        with pytest.raises(DerivativeError) as caught:
            _native_execute(case, native, monkeypatch, progress_sink=fail)
        error: BaseException | None = caught.value
        while error is not None and error is not sentinel:
            error = error.__cause__
        assert error is sentinel
        assert not case.private.command.output_path.exists()
        run = _native_execute(case, native, monkeypatch)
        _association(case.private, native, run, _contexts(case.private, native))


def test_dispatcher_correlates_original_smart_completion_and_progress(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "dispatcher")
    case.wire["reportProgress"] = True
    original: dict[str, object] = {
        "type": "smart-patch-executed",
        "requestId": case.private.command.request_id,
    }
    calls: list[Any] = []

    def execute(value: Any, **kwargs: Any) -> dict[str, object]:
        calls.append(value)
        assert value is case.wire
        kwargs["on_progress"](1, 3)
        return original

    monkeypatch.setattr(worker, "execute_anima_smart_patch_regional_request", execute)
    progress: list[dict[str, object]] = []
    actual = inference_main.process_inference_request(
        case.wire, config_dir=tmp_path, runtime=_runtime(), on_progress=progress.append
    )
    assert actual is original and calls == [case.wire]
    assert progress == [
        {
            "type": "generation-progress",
            "protocolVersion": "1",
            "requestId": case.private.command.request_id,
            "step": 1,
            "totalSteps": 3,
        }
    ]
