"""Explicit Smart LoRA profiles reach the existing signed native consumer.

InvokeAI 4875d96531ca6712b288f6e660fcbb34143408c1 graph.ts and
canvas/addRegionalGuidance.ts share LoRA-bearing encoder edges; Anima denoise
and LayerPatcher keep the same ordered stack alive through denoising. These
tests reuse Studio's ordinary LoRA scope, authored matrices/closed-form Linear
oracle and original tiny Qwen/Cosmos/Wan models. Descriptor dispatch, signed
contexts/attention, original solvers/KEEP and exclusive RGB PNG publication stay
real. Only compute availability/model construction and OUT's neural LaMa output
are named collaborators. Public companion metadata is not an attestation of the
synthetic fixture bytes; genuine resource verification has separate cases here.
This does not qualify installed-worker, trained-model or visual usefulness.
"""

from __future__ import annotations

import copy
import threading
from collections.abc import Callable, Generator
from contextlib import contextmanager
from dataclasses import replace
from functools import wraps
from pathlib import Path
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import anima_lora, anima_worker, inference_main, smart_patch_execution
from imagegen_worker import anima_regional as regional
from imagegen_worker import anima_smart_patch_regional as smart
from imagegen_worker import anima_smart_patch_regional_worker as worker
from imagegen_worker.anima_lora import scoped_anima_generation_loras
from imagegen_worker.anima_worker import anima_prompt_payload, anima_sampling_payload
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.protocol import GenerationLora
from imagegen_worker.smart_patch_denoising import run_smart_patch_anima
from test_anima_flow_sampling import inputs as _flow_inputs
from test_anima_regional import (
    _contains_cause,  # pyright: ignore[reportPrivateUsage]
    _Native,  # pyright: ignore[reportPrivateUsage]
    _observed,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional import cpu_native as cpu_native
from test_anima_regional import native as native
from test_anima_regional import native_factory as native_factory
from test_anima_regional_lora import (
    _linear_oracle,  # pyright: ignore[reportPrivateUsage]
    _resource,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_outpaint import _execution  # pyright: ignore[reportPrivateUsage]
from test_anima_regional_worker import _runtime  # pyright: ignore[reportPrivateUsage]
from test_anima_smart_patch_regional import (
    _association,  # pyright: ignore[reportPrivateUsage]
    _Case,  # pyright: ignore[reportPrivateUsage]
    _keep_oracle,  # pyright: ignore[reportPrivateUsage]
    _prediction_oracle,  # pyright: ignore[reportPrivateUsage]
    _Run,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_smart_patch_regional import (
    _case as _private_case,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_smart_patch_regional import (
    _contexts as _unpatched_contexts,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_smart_patch_regional_flow import (
    _association as _flow_association,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_smart_patch_regional_flow import (
    _FlowRun,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_smart_patch_regional_flow import (
    _published as _flow_published,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_smart_patch_regional_flow_worker import (
    _case as _flow_case,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_smart_patch_regional_outpaint import (
    _case as _outpaint_case,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_smart_patch_regional_worker import (
    _available,  # pyright: ignore[reportPrivateUsage]
    _descriptor,  # pyright: ignore[reportPrivateUsage]
    _tripwire,  # pyright: ignore[reportPrivateUsage]
    _WireCase,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_smart_patch_regional_worker import (
    _case as _inpaint_case,  # pyright: ignore[reportPrivateUsage]
)

_MODES = ("txt2img", "img2img", "inpaint", "outpaint")
_COMPONENTS = ("transformer", "text_conditioner", "qwen3_encoder")
_Resource = tuple[GenerationLora, dict[str, Any]]


def _case(
    root: Path,
    mode: str,
    patch: pytest.MonkeyPatch,
    *,
    scheduler: str = "euler",
    regions: bool = True,
) -> _WireCase:
    if mode in ("txt2img", "img2img"):
        return _flow_case(root, mode, scheduler=scheduler, regions=regions)
    if mode == "outpaint":
        return _outpaint_case(root, patch, scheduler=scheduler, regions=regions).wire
    case = _inpaint_case(root, regions=regions)
    if scheduler != case.private.recipe["sampling"]["animaMethod"]:
        private = case.private
        private.recipe["sampling"]["animaMethod"] = scheduler
        private.value["execution"]["inference"]["sampling"] = _flow_inputs(
            mode="img2img",
            scheduler=scheduler,
            width=72,
            height=64,
            seed=123,
            steps=4,
            guidanceScale=3,
            strength=0.75,
        )["plan"]
        private.captured = smart.capture_anima_smart_patch_regional_input(private.value)
        case.bundle["recipe"]["sampling"] = copy.deepcopy(private.recipe["sampling"])
        case.bundle["execution"] = copy.deepcopy(private.value["execution"])
        case.seal()
    return case


def _set_stack(case: _WireCase, stack: tuple[GenerationLora, ...]) -> None:
    private = case.private
    mode = private.command.mode
    private.value["profile"] = f"invoke-anima-smart-regional-{'lora-' if stack else ''}{mode}-v1"
    private.value["execution"]["inference"]["loras"] = [
        {
            "path": str(item.path),
            "sha256": item.sha256,
            "byteSize": item.byte_size,
            "weight": item.weight,
        }
        for item in stack
    ]
    private.captured = smart.capture_anima_smart_patch_regional_input(private.value)
    case.bundle["profile"] = private.value["profile"]
    case.bundle["execution"] = copy.deepcopy(private.value["execution"])
    case.seal()


def _literal(root: Path, name: str = "first", weight: float = -0.35) -> GenerationLora:
    path = root / f"{name}.safetensors"
    path.write_bytes(b"Explicit descriptor-only resource; not native LoRA weights.")
    descriptor = _descriptor(path)
    return GenerationLora(path, descriptor["sha256"], descriptor["byteSize"], weight)


def _contexts(case: _Case, native: _Native, resources: tuple[_Resource, ...]) -> tuple[Any, Any]:
    # Independent ordinary-owner scope: dropping the production forwarding cannot
    # satisfy either the context oracle or the authored closed-form Linear check.
    with (
        native.torch.no_grad(),
        scoped_anima_generation_loras(
            native.models, tuple(item for item, _state in resources), native.torch
        ),
    ):
        _linear_oracle(native, resources)
        return _unpatched_contexts(case, native)


def _run(
    case: _WireCase,
    native: _Native,
    patch: pytest.MonkeyPatch,
    *,
    ordinary: bool = False,
    dispatch: bool = True,
    progress_sink: Any = None,
) -> _Run:
    """Real descriptor/dispatcher and native output; explicit model-load collaborator."""
    result: Any = None
    extras: list[Any] = []
    progress: list[tuple[int, int]] = []
    original_encode = regional.encode_anima_prompt

    @wraps(original_encode)
    def encode(value: Any, *args: Any, **kwargs: Any) -> Any:
        extras.append(copy.deepcopy(value))
        return original_encode(value, *args, **kwargs)

    def report(step: int, total: int) -> None:
        progress.append((step, total))
        if progress_sink is not None:
            progress_sink(step, total)

    def wire_report(event: dict[str, object]) -> None:
        assert event["type"] == "generation-progress"
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
                    loras=command.inference.loras,
                    tokenizers=native.oracle_tokenizers,
                    progress=kwargs.get("on_progress"),
                )
        else:
            assert captured.command is command and captured.policy is command.inference
            assert command.inference.loras == case.private.policy.loras
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
        scope.setattr(worker, "supports_anima_compute", _available)
        scope.setattr(worker, "execute_smart_patch", prepared)
        scope.setattr(smart_patch_execution, "execute_smart_patch", prepared)
        scope.setattr(regional, "encode_anima_prompt", encode)
        case.wire["reportProgress"] = True
        with _execution(native, scope) as execution, _observed(native, scope) as observed:
            if dispatch:
                done = inference_main.process_inference_request(
                    case.private.value["execution"] if ordinary else case.wire,
                    config_dir=case.root,
                    runtime=native.runtime,
                    on_progress=wire_report,
                )
            else:
                assert not ordinary
                done = worker.execute_anima_smart_patch_regional_request(
                    case.wire,
                    config_dir=case.root,
                    runtime=native.runtime,
                    on_progress=report,
                )
        assert result is not None and done["type"] == "smart-patch-executed", done
        if case.private.command.mode in ("txt2img", "img2img"):
            pixels = _flow_published(case.private, native, done, observed)
        else:
            with Image.open(case.private.command.output_path) as image:
                image.load()
                assert image.format == "PNG" and image.mode == "RGB" and image.size == (72, 64)
                assert image.info.get("icc_profile") == SRGB_ICC_PROFILE
                pixels = image.tobytes()
            assert len(observed.decoded) == 1
            decoded = observed.decoded[0]
            expected = (127.5 * (decoded[0, :, 0].clamp(-1, 1) + 1)).to(native.torch.uint8)
            assert pixels == expected.permute(1, 2, 0).contiguous().numpy().tobytes()
            metadata = cast(dict[str, Any], done["output"])
            descriptor = _descriptor(case.private.command.output_path)
            assert metadata == {
                "byteSize": descriptor["byteSize"],
                "sha256": descriptor["sha256"],
                "width": 72,
                "height": 64,
                "colorSpace": "srgb",
            }
            assert case.private.command.model_source.path.read_bytes() == case.private.source_bytes
            assert (
                case.private.command.latent_keep_mask.path.read_bytes() == case.private.keep_bytes
            )
        assert done["requestId"] == case.private.command.request_id
        assert done["actualSeed"] == case.private.policy.sampling.seed
        assert result.image.tobytes() == pixels
        assert progress == [
            (step, case.private.policy.sampling.total_steps)
            for step in range(1, case.private.policy.sampling.total_steps + 1)
        ]
        return _Run(result, done, pixels, observed, execution, extras)


def _assert_consumption(
    case: _WireCase,
    native: _Native,
    run: _Run,
    contexts: tuple[Any, Any],
    resources: tuple[_Resource, ...],
) -> None:
    assert case.private.command.output_path.is_file(), "Semantic oracle must follow real PNG"
    with (
        native.torch.no_grad(),
        scoped_anima_generation_loras(
            native.models, tuple(item for item, _state in resources), native.torch
        ),
    ):
        _linear_oracle(native, resources)
        # Original transformer replay, independent signed mask and exact captured
        # latents/timestep. Scope is required even for transformer-only resources.
        for index, sign in enumerate(("positive", "negative")):
            _prediction_oracle(case.private, native, run, contexts[index], sign)
    if case.private.command.mode in ("inpaint", "outpaint"):
        _association(case.private, native, run, contexts)
        _keep_oracle(case.private, native, run)
    else:
        _flow_association(
            case.private,
            native,
            _FlowRun(
                run.result,
                run.done,
                run.pixels,
                run.observed,
                run.execution.encodes,
                run.extras,
                [],
            ),
            contexts,
        )
        assert not run.execution.merges, "TXT/IMG borrowed Smart KEEP"


@pytest.mark.parametrize("mode", _MODES)
@pytest.mark.parametrize("scheduler", ("euler", "heun"))
def test_smart_regional_lora_final_consumer_red(
    native: _Native,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    scheduler: str,
) -> None:
    resources = (
        _resource(tmp_path, native, name="positive", weight=0.7),
        _resource(tmp_path, native, name="negative", seed=91, weight=-0.35),
    )
    case = _case(tmp_path / "active", mode, monkeypatch, scheduler=scheduler)
    _set_stack(case, tuple(item for item, _state in resources))
    with _preserved(native):
        expected = _contexts(case.private, native, resources)
        run = _run(case, native, monkeypatch)
        _assert_consumption(case, native, run, expected, resources)


@pytest.mark.parametrize("mode", _MODES)
def test_smart_regional_no_lora_control_green(
    native: _Native,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
) -> None:
    case = _case(tmp_path / "legacy", mode, monkeypatch)
    assert case.private.value["profile"] == f"invoke-anima-smart-regional-{mode}-v1"
    with _preserved(native):
        expected = _contexts(case.private, native, ())
        run = _run(case, native, monkeypatch)
        _assert_consumption(case, native, run, expected, ())


@pytest.mark.parametrize("mode", _MODES)
def test_enabled_zero_stack_matches_clean_control_green(
    cpu_native: _Native,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
) -> None:
    native = cpu_native
    resources = (_resource(tmp_path, native, name="enabled-zero", weight=0.0),)
    case = _case(tmp_path / "zero", mode, monkeypatch)
    _set_stack(case, tuple(item for item, _state in resources))
    clean = _case(tmp_path / "clean", mode, monkeypatch)
    with _preserved(native):
        expected = _contexts(case.private, native, resources)
        zero = _run(case, native, monkeypatch)
        _assert_consumption(case, native, zero, expected, resources)
        baseline = _run(clean, native, monkeypatch)
        assert zero.pixels == baseline.pixels
        for actual, original in zip(zero.observed.passes, baseline.observed.passes, strict=True):
            assert native.torch.equal(actual["context"], original["context"])
            assert native.torch.equal(actual["prediction"], original["prediction"])


@pytest.mark.parametrize("mode", _MODES)
def test_signed_zero_order_repeat_and_clean_restore_match_native_outputs(
    cpu_native: _Native,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
) -> None:
    native = cpu_native
    resources = (
        _resource(tmp_path, native, name="positive", weight=0.7),
        _resource(tmp_path, native, name="negative", seed=91, weight=-0.35),
    )
    stack = tuple(item for item, _state in resources)
    zero = tuple(replace(item, weight=0.0) for item in stack)
    runs: dict[str, _Run] = {}
    with _preserved(native):
        for label, selected in (
            ("baseline", ()),
            ("active", stack),
            ("zero", zero),
            ("repeat", stack),
            ("restored", ()),
        ):
            case = _case(tmp_path / label, mode, monkeypatch)
            _set_stack(case, selected)
            parsed = worker.parse_anima_smart_patch_regional_request(case.wire)
            assert parsed.captured.policy.loras == selected
            runs[label] = _run(case, native, monkeypatch)
        assert runs["active"].pixels != runs["baseline"].pixels
        assert runs["repeat"].pixels == runs["active"].pixels
        assert runs["zero"].pixels == runs["baseline"].pixels == runs["restored"].pixels
        for left, right in (("active", "repeat"), ("baseline", "zero"), ("baseline", "restored")):
            for first, second in zip(
                runs[left].observed.passes, runs[right].observed.passes, strict=True
            ):
                assert native.torch.equal(first["context"], second["context"])
                assert native.torch.equal(first["prediction"], second["prediction"])


@pytest.mark.parametrize("component", _COMPONENTS)
def test_component_reaches_global_negative_and_every_signed_region(
    cpu_native: _Native,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    component: str,
) -> None:
    native = cpu_native
    case = _case(tmp_path / "request", "txt2img", monkeypatch)
    resource = _resource(tmp_path, native, (component,), weight=-0.35)
    with _preserved(native):
        without = _contexts(case.private, native, ())
        _set_stack(case, (resource[0],))
        expected = _contexts(case.private, native, (resource,))
        actual = _run(case, native, monkeypatch)
        _assert_consumption(case, native, actual, expected, (resource,))
        if component == "transformer":
            assert all(native.torch.equal(a, b) for a, b in zip(without, expected, strict=True))
        else:
            for before, after in zip(without, expected, strict=True):
                for start in range(0, after.shape[1], 512):
                    assert not native.torch.equal(
                        before[:, start : start + 512], after[:, start : start + 512]
                    ), "Global or independently signed regional bank missed LoRA"


@pytest.mark.parametrize("mode", _MODES)
def test_no_region_lora_uses_original_smart_owner_byte_exactly(
    cpu_native: _Native,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
) -> None:
    native = cpu_native
    item, _state = _resource(tmp_path, native, weight=-0.35)
    regional_case = _case(tmp_path / "regional", mode, monkeypatch, regions=False)
    ordinary_case = _case(tmp_path / "ordinary", mode, monkeypatch, regions=False)
    _set_stack(regional_case, (item,))
    _set_stack(ordinary_case, (item,))
    with _preserved(native):
        actual = _run(regional_case, native, monkeypatch)
        ordinary = _run(ordinary_case, native, monkeypatch, ordinary=True)
    assert actual.pixels == ordinary.pixels
    for first, second in zip(actual.observed.passes, ordinary.observed.passes, strict=True):
        assert native.torch.equal(first["context"], second["context"])
        assert native.torch.equal(first["prediction"], second["prediction"])


@pytest.mark.parametrize("mode", _MODES)
@pytest.mark.parametrize("weight", (-0.35, 0.0))
def test_descriptor_preserves_exact_order_and_nonempty_zero_profile(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    weight: float,
) -> None:
    case = _case(tmp_path / "descriptor", mode, monkeypatch)
    first = _literal(tmp_path, "first", weight)
    second = _literal(tmp_path, "second", 0.7)
    _set_stack(case, (second, first))
    parsed = worker.parse_anima_smart_patch_regional_request(case.wire)
    assert parsed.captured.execution_profile == f"invoke-anima-smart-regional-lora-{mode}-v1"
    assert parsed.captured.policy.loras == (second, first)
    assert parsed.captured.policy is parsed.captured.command.inference
    case.bundle["execution"]["inference"]["loras"].reverse()
    assert parsed.captured.policy.loras == (second, first), "Captured order borrowed caller list"


@pytest.mark.parametrize("mode", _MODES)
def test_old_profiles_refuse_nonempty_and_new_profiles_refuse_empty_before_callback(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
) -> None:
    case = _case(tmp_path / "profile", mode, monkeypatch)
    item = _literal(tmp_path, weight=0.0)
    _set_stack(case, (item,))
    monkeypatch.setattr(worker, "execute_smart_patch", _tripwire)
    case.bundle["profile"] = f"invoke-anima-smart-regional-{mode}-v1"
    case.seal()
    with pytest.raises(DerivativeError) as legacy:
        worker.execute_anima_smart_patch_regional_request(
            case.wire, config_dir=case.root, runtime=_runtime()
        )
    assert legacy.value.code == "GENERATION_PROMPT_UNSUPPORTED"
    case.bundle["profile"] = f"invoke-anima-smart-regional-lora-{mode}-v1"
    case.bundle["execution"]["inference"]["loras"] = []
    case.seal()
    with pytest.raises(DerivativeError) as empty:
        worker.execute_anima_smart_patch_regional_request(
            case.wire, config_dir=case.root, runtime=_runtime()
        )
    assert empty.value.code == "GENERATION_PROMPT_UNSUPPORTED"


@pytest.mark.parametrize(
    "role", ("checkpoint", "qwen3Encoder", "vae", "source", "keep", "output", "bundle", "alpha")
)
def test_lora_resources_cannot_alias_models_or_owned_staging_roles(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    role: str,
) -> None:
    case = _case(tmp_path / "overlap", "inpaint", monkeypatch)
    _set_stack(case, (_literal(tmp_path),))
    execution = case.bundle["execution"]
    if role in ("checkpoint", "qwen3Encoder", "vae"):
        path = execution["inference"]["model"][role]["path"]
    else:
        path = {
            "source": execution["modelSource"]["path"],
            "keep": execution["latentKeepMask"]["path"],
            "output": execution["output"]["pngPath"],
            "bundle": str(case.root / "smart-regional.json"),
            "alpha": str(case.root / "regional-0.alpha8"),
        }[role]
    execution["inference"]["loras"][0]["path"] = path
    case.seal()
    monkeypatch.setattr(worker, "execute_smart_patch", _tripwire)
    with pytest.raises(DerivativeError) as overlap:
        worker.execute_anima_smart_patch_regional_request(
            case.wire, config_dir=case.root, runtime=_runtime()
        )
    assert overlap.value.code == "INVALID_PATH"


@pytest.mark.parametrize("change", ("duplicate", "nan", "infinite", "boolean", "mode"))
def test_lora_capture_rejects_malformed_or_wrong_mode_stack_before_callback(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    change: str,
) -> None:
    case = _case(tmp_path / "malformed", "inpaint", monkeypatch)
    _set_stack(case, (_literal(tmp_path),))
    value = copy.deepcopy(case.private.value)
    stack = value["execution"]["inference"]["loras"]
    if change == "duplicate":
        stack.append(copy.deepcopy(stack[0]))
    elif change == "mode":
        value["profile"] = "invoke-anima-smart-regional-lora-img2img-v1"
    else:
        invalid = {"nan": float("nan"), "infinite": float("inf"), "boolean": True}
        stack[0]["weight"] = invalid[change]
    with pytest.raises(DerivativeError):
        smart.capture_anima_smart_patch_regional_input(value)


def test_captured_policy_cannot_borrow_another_commands_stack(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    case = _case(tmp_path / "policy", "inpaint", monkeypatch)
    item = _literal(tmp_path)
    _set_stack(case, (item,))
    changed = replace(case.private.policy, loras=(replace(item, weight=0.0),))
    command = replace(case.private.command, inference=changed)
    with pytest.raises(DerivativeError) as owner:
        cast(Any, smart)._require_captured_command(case.private.captured, command)
    assert owner.value.code == "INVALID_REQUEST"


@pytest.mark.parametrize("weight", (-0.35, 0.0))
@pytest.mark.parametrize("when", ("before-load", "after-load"))
def test_original_exact_resource_owner_checks_lora_before_and_after_loading(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    weight: float,
    when: str,
) -> None:
    # Unlike public descriptors' declared pinned companion metadata, this private
    # fixture's stub model SHA/size exactly match their actual bytes. Thus the
    # original resource checker must reach this LoRA, not fail on setup first.
    private = _private_case(tmp_path / "resources")
    item = _literal(tmp_path, weight=weight)
    private.value["profile"] = "invoke-anima-smart-regional-lora-inpaint-v1"
    private.value["execution"]["inference"]["loras"] = [
        {**_descriptor(item.path), "weight": item.weight}
    ]
    private.captured = smart.capture_anima_smart_patch_regional_input(private.value)
    loaded: list[bool] = []

    def load(*_args: Any, **_kwargs: Any) -> Any:
        loaded.append(True)
        item.path.write_bytes(item.path.read_bytes() + b"changed after load")
        return object()

    monkeypatch.setattr(anima_worker, "load_anima_models", load)
    monkeypatch.setattr(smart, "run_prepared_anima_smart_patch_regional", _tripwire)
    if when == "before-load":
        item.path.write_bytes(item.path.read_bytes() + b"changed before load")
    with pytest.raises(DerivativeError) as changed:
        smart.execute_anima_smart_patch_regional(
            private.value, config_dir=private.command.staging_root, runtime=_runtime()
        )
    assert changed.value.code == "GENERATION_INPUT_CHANGED"
    assert loaded == ([True] if when == "after-load" else [])
    assert not private.command.output_path.exists()


def test_four_lora_capabilities_are_additive_and_require_native_anima_compute() -> None:
    declared = (
        worker.ANIMA_SMART_PATCH_REGIONAL_LORA_TXT2IMG_CAPABILITY,
        worker.ANIMA_SMART_PATCH_REGIONAL_LORA_IMG2IMG_CAPABILITY,
        worker.ANIMA_SMART_PATCH_REGIONAL_LORA_CAPABILITY,
        worker.ANIMA_SMART_PATCH_REGIONAL_LORA_OUTPAINT_CAPABILITY,
    )
    assert declared == tuple(f"anima-smart-patch-regional-lora-{mode}-v1" for mode in _MODES)
    for runtime in (None, _runtime(bf16=False)):
        capabilities = cast(
            list[str], inference_main.inference_ready_message(runtime)["capabilities"]
        )
        assert not set(declared) & set(capabilities)
    available = cast(list[str], inference_main.inference_ready_message(_runtime())["capabilities"])
    assert set(declared) <= set(available)
    assert all(f"anima-smart-patch-regional-{mode}-v1" in available for mode in _MODES)


@contextmanager
def _failure(
    native: _Native,
    patch: pytest.MonkeyPatch,
    kind: str,
    sentinel: Exception,
) -> Generator[dict[str, Any]]:
    options: dict[str, Any] = {}
    if kind == "partial-load":
        original = cast(Any, anima_lora)._load_component

        @wraps(original)
        def load(*args: Any, **kwargs: Any) -> None:
            original(*args, **kwargs)
            if args[1] == "text_conditioner":
                raise sentinel

        patch.setattr(anima_lora, "_load_component", load)
    elif kind == "regional-encode":
        original = regional.encode_anima_prompt

        @wraps(original)
        def encode(*args: Any, **kwargs: Any) -> Any:
            original(*args, **kwargs)
            raise sentinel

        patch.setattr(regional, "encode_anima_prompt", encode)
    elif kind == "decode":
        model_type = cast(Any, type(native.models.vae))
        original = model_type.decode

        @wraps(original)
        def decode(*args: Any, **kwargs: Any) -> Any:
            original(*args, **kwargs)
            raise sentinel

        patch.setattr(model_type, "decode", decode)
    else:

        def progress(step: int, _total: int) -> None:
            if step == 1:
                raise sentinel

        options["progress_sink"] = progress
    yield options


@pytest.mark.parametrize(
    ("mode", "failure"),
    [(mode, "cancel") for mode in _MODES]
    + [("txt2img", kind) for kind in ("partial-load", "regional-encode", "decode")],
)
def test_lora_error_or_cancel_restores_rng_tensors_peft_processors_and_exact_retry(
    cpu_native: _Native,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    failure: str,
) -> None:
    native = cpu_native
    item, _state = _resource(tmp_path, native)
    reference = _case(tmp_path / "reference", mode, monkeypatch)
    _set_stack(reference, (item,))
    with _preserved(native):
        expected = _run(reference, native, monkeypatch)
    failed = _case(tmp_path / "failed", mode, monkeypatch)
    _set_stack(failed, (item,))
    sentinel = RuntimeError("controlled Smart regional LoRA " + failure)
    with (
        _preserved(native),
        monkeypatch.context() as patch,
        _failure(native, patch, failure, sentinel) as options,
    ):
        with pytest.raises(Exception) as caught:
            _run(failed, native, patch, dispatch=False, **options)
        assert _contains_cause(caught.value, sentinel)
        assert not failed.private.command.output_path.exists()
        assert not list(failed.root.glob("*.tmp"))
        assert (
            failed.private.command.latent_keep_mask.path.read_bytes() == failed.private.keep_bytes
        )
        if failed.private.command.model_source is not None:
            assert (
                failed.private.command.model_source.path.read_bytes() == failed.private.source_bytes
            )
    assert not cast(Any, regional)._MODEL_OWNERS and not cast(Any, regional)._ATTENTION_OWNERS
    recovered = _case(tmp_path / "recovered", mode, monkeypatch)
    _set_stack(recovered, (item,))
    with _preserved(native):
        actual = _run(recovered, native, monkeypatch)
    assert actual.pixels == expected.pixels
    for before, after in zip(expected.observed.passes, actual.observed.passes, strict=True):
        assert native.torch.equal(before["prediction"], after["prediction"])


@pytest.mark.parametrize("cancel", (False, True))
def test_preexisting_peft_metadata_objects_survive_success_and_cancel(
    cpu_native: _Native,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    cancel: bool,
) -> None:
    native = cpu_native
    model = native.models.qwen3_encoder
    keys = ("_hf_peft_config_loaded", "_weight_conversions", "peft_config")
    saved = {key: (key in vars(model), cast(dict[str, Any], vars(model)).get(key)) for key in keys}
    model._hf_peft_config_loaded = False
    model._weight_conversions = []
    model.peft_config = {}
    owned = {key: cast(dict[str, Any], vars(model))[key] for key in keys}
    try:
        resource, _state = _resource(tmp_path, native, ("qwen3_encoder",), weight=-0.35)
        case = _case(tmp_path / "metadata", "txt2img", monkeypatch)
        _set_stack(case, (resource,))
        sentinel = RuntimeError("controlled Smart metadata cancellation after native step one")

        def progress(step: int, _total: int) -> None:
            if cancel and step == 1:
                raise sentinel

        with _preserved(native):
            if cancel:
                with pytest.raises(Exception) as caught:
                    _run(case, native, monkeypatch, dispatch=False, progress_sink=progress)
                assert _contains_cause(caught.value, sentinel)
                assert not case.private.command.output_path.exists()
            else:
                _run(case, native, monkeypatch)
        for key in keys:
            assert vars(model)[key] is owned[key]
        assert not model._hf_peft_config_loaded
        assert not owned["_weight_conversions"] and not owned["peft_config"]
    finally:
        for key, (present, value) in saved.items():
            if present:
                setattr(model, key, value)
            elif key in vars(model):
                delattr(model, key)


def test_shared_lora_rng_reservation_refuses_disjoint_models_and_recovers(
    cpu_native: _Native,
    native_factory: Callable[[str], _Native],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    first_native = cpu_native
    second = native_factory("cpu-float32-independent-smart-lora")
    assert first_native.models.transformer is not second.models.transformer
    item, _state = _resource(tmp_path, first_native, weight=-0.35)
    first = _case(tmp_path / "first", "txt2img", monkeypatch)
    other = _case(tmp_path / "other", "txt2img", monkeypatch)
    _set_stack(first, (item,))
    _set_stack(other, (item,))
    entered, release = threading.Event(), threading.Event()
    original = cast(Any, anima_lora)._load_component

    @wraps(original)
    def hold(*args: Any, **kwargs: Any) -> None:
        original(*args, **kwargs)
        if not entered.is_set():
            entered.set()
            assert release.wait(30), "Test must release held actual native adapter construction"

    monkeypatch.setattr(anima_lora, "_load_component", hold)
    failures: list[BaseException] = []
    completions: list[_Run] = []

    def first_call() -> None:
        try:
            completions.append(_run(first, first_native, monkeypatch, dispatch=False))
        except BaseException as error:
            failures.append(error)

    with _preserved(first_native), _preserved(second):
        thread = threading.Thread(target=first_call)
        thread.start()
        try:
            assert entered.wait(30), "First Smart job must reach native adapter construction"
            with pytest.raises(DerivativeError) as conflict:
                smart.run_prepared_anima_smart_patch_regional(
                    other.private.captured,
                    second.models,
                    other.private.inputs,
                    runtime=second.runtime,
                    profile=second.profile,
                    tokenizers=second.tokenizers,
                )
            assert conflict.value.code == "OWNERSHIP_CONFLICT"
            assert not other.private.command.output_path.exists()
        finally:
            release.set()
            thread.join(45)
            assert not thread.is_alive(), "Held Smart operation must physically exit"
        assert not failures and len(completions) == 1
    assert not cast(Any, regional)._MODEL_OWNERS and not cast(Any, regional)._ATTENTION_OWNERS
    with _preserved(second):
        _run(other, second, monkeypatch)


def test_current_canvas_rng_owner_also_blocks_smart_lora_scope(
    cpu_native: _Native,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    native = cpu_native
    item, _state = _resource(tmp_path, native)
    case = _case(tmp_path / "shared-rng", "txt2img", monkeypatch)
    _set_stack(case, (item,))
    # Reserve the exact Current Canvas owner with no shared model identities.
    # A parallel Smart-only sentinel would miss this actual cross-owner conflict.
    with (
        _preserved(native),
        cast(Any, regional)._reserve(
            (cast(Any, regional)._LORA_RNG_OWNER,), cast(Any, regional)._MODEL_OWNERS
        ),
        pytest.raises(DerivativeError) as conflict,
    ):
        smart.run_prepared_anima_smart_patch_regional(
            case.private.captured,
            native.models,
            case.private.inputs,
            runtime=native.runtime,
            profile=native.profile,
            tokenizers=native.tokenizers,
        )
    assert conflict.value.code == "OWNERSHIP_CONFLICT"
    assert not case.private.command.output_path.exists()
    assert not cast(Any, regional)._MODEL_OWNERS
