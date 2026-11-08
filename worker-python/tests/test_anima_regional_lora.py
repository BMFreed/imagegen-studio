"""Global Anima adapters compose with the existing regional/native execution owners.

Complete recipes still come from Main. Ordinary scoped adapters supply the independent
conditioning reference; known authored matrices separately check every native adapter
row and its closed-form Linear contribution. Original processors, sampling, Wan decode
and reopened RGB/RGBA pixels remain consumers. These small models do not qualify trained
quality or installed application loading. OUT replaces only neural LaMa as in its suite.
"""

from __future__ import annotations

import contextlib
import hashlib
import threading
from collections.abc import Callable, Generator
from dataclasses import dataclass, replace
from functools import wraps
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import anima_lora, inference_main
from imagegen_worker import anima_regional as regional
from imagegen_worker import anima_regional_worker as worker
from imagegen_worker.anima_lora import scoped_anima_generation_loras
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.protocol import GenerationLora
from test_anima_lora import (
    _TARGETS,  # pyright: ignore[reportPrivateUsage]
    _file,  # pyright: ignore[reportPrivateUsage]
    _state,  # pyright: ignore[reportPrivateUsage]
)
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
from test_anima_regional_img2img import _call as _image_call  # pyright: ignore[reportPrivateUsage]
from test_anima_regional_img2img import _wire as _image_wire  # pyright: ignore[reportPrivateUsage]
from test_anima_regional_outpaint import (
    _call as _outpaint_call,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_outpaint import (
    _execution,  # pyright: ignore[reportPrivateUsage]
    _lama,  # pyright: ignore[reportPrivateUsage]
    _mask_reference,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_outpaint import (
    _published as _outpaint_published,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_outpaint import (
    _wire as _outpaint_wire,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_worker import (
    _case,  # pyright: ignore[reportPrivateUsage]
    _descriptor,  # pyright: ignore[reportPrivateUsage]
    _runtime,  # pyright: ignore[reportPrivateUsage]
)

_PROFILE = "invoke-anima-global-lora-v1"
_FLOW = "invoke-anima-flow-sampling-v1"
_COMPONENTS = ("transformer", "text_conditioner", "qwen3_encoder")
_MODES = ("txt2img", "img2img", "outpaint")
_Producer = Callable[..., dict[str, Any]]


@dataclass
class _Run:
    pixels: bytes
    observed: _Observation


def _call(root: Path, produce: _Producer, mode: str, *, variant: str = "base") -> _Call:
    if mode == "txt2img":
        return _command(root, produce(variant))
    constructor = _image_call if mode == "img2img" else _outpaint_call
    return constructor(root, produce, "euler", strength=1.0, steps=3, variant=variant)


def _resource(
    root: Path,
    native: _Native,
    components: tuple[str, ...] = _COMPONENTS,
    *,
    name: str = "known-global",
    seed: int = 40,
    weight: float = 0.7,
) -> tuple[GenerationLora, dict[str, Any]]:
    fixture = (native.torch, native.diffusers, native.models, native.tokenizers)
    state = {key: tensor for c in components for key, tensor in _state(fixture, c, seed).items()}
    return _file(root, fixture, state, name=name, weight=weight), state


def _arguments(call: _Call, native: _Native, **changes: Any) -> dict[str, Any]:
    return {
        "command": call.command,
        "compiled_prompts": call.handoff["compiledPrompts"],
        "models": native.models,
        "runtime": native.runtime,
        "profile": native.profile,
        "tokenizers": native.tokenizers,
        "sampling_profile": _FLOW,
        "lora_profile": _PROFILE,
        **changes,
    }


def _frontend(mode: str) -> Any:
    return {
        "txt2img": regional.generate_current_canvas_regional_anima_txt2img,
        "img2img": regional.generate_current_canvas_regional_anima_img2img,
        "outpaint": regional.generate_current_canvas_regional_anima_outpaint,
    }[mode]


def _run(
    call: _Call,
    native: _Native,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    **changes: Any,
) -> _Run:
    keep = None
    if mode == "outpaint":
        with Image.open(call.command.target_path) as source:
            _, keep = _mask_reference(source, native.torch)
    with monkeypatch.context() as patch:
        infill = _lama(call, patch) if mode == "outpaint" else contextlib.nullcontext()
        with infill, _execution(native, patch) as seen, _observed(native, patch) as observed:
            done = _frontend(mode)(call.handoff["recipe"], **_arguments(call, native, **changes))
        pixels = (
            _outpaint_published(call, native, done, observed, seen, cast(Image.Image, keep))
            if mode == "outpaint"
            else _published(call, native, done, observed)
        )
    return _Run(pixels, observed)


def _linear_oracle(
    native: _Native, resources: tuple[tuple[GenerationLora, dict[str, Any]], ...]
) -> None:
    """Authored A/B values, rank/alpha and closed-form contributions, not PEFT outputs."""
    torch = native.torch
    tolerance = 8 * float(torch.finfo(native.dtype).eps)
    for component in _COMPONENTS:
        for path, stem in _TARGETS[component]:
            selected = [(item, state) for item, state in resources if stem + ".alpha" in state]
            module = getattr(native.models, component).get_submodule(path)
            if not selected:
                assert not hasattr(module, "lora_A")
                continue
            assert set(module.lora_A) == {
                f"igs_anima_lora_{index}"
                for index, (_item, state) in enumerate(resources)
                if stem + ".alpha" in state
            }
            x = torch.linspace(-0.75, 0.75, module.in_features, device=native.device)
            x = x.to(native.dtype).unsqueeze(0)
            base = module.base_layer
            expected = torch.nn.functional.linear(x, base.weight, base.bias)
            for index, (item, state) in enumerate(resources):
                if stem + ".alpha" not in state:
                    continue
                name = f"igs_anima_lora_{index}"
                a, b = module.lora_A[name].weight, module.lora_B[name].weight
                down = state[stem + ".lora_A.weight"].to(device=a.device, dtype=a.dtype)
                up = state[stem + ".lora_B.weight"].to(device=b.device, dtype=b.dtype)
                assert torch.equal(a, down) and torch.equal(b, up), "Exact owned adapter rows"
                rank = down.shape[0]
                scale = item.weight * float(state[stem + ".alpha"].item()) / rank
                assert module.scaling[name] == scale
                if scale != 0:
                    expected = (
                        expected
                        + torch.nn.functional.linear(
                            torch.nn.functional.linear(x.to(a.dtype), down), up
                        )
                        * scale
                    )
            torch.testing.assert_close(
                module(x), expected.to(native.dtype), rtol=tolerance, atol=tolerance
            )


def _contexts(
    call: _Call,
    native: _Native,
    resources: tuple[tuple[GenerationLora, dict[str, Any]], ...],
) -> tuple[Any, Any]:
    # A separate ordinary-owner invocation is the integration oracle: region execution cannot
    # satisfy it by forgetting to forward the stack. Matrix/scale checks above are independent.
    with (
        native.torch.no_grad(),
        scoped_anima_generation_loras(
            native.models, tuple(item for item, _state in resources), native.torch
        ),
    ):
        _linear_oracle(native, resources)
        return _context_oracle(call.handoff, native)


@pytest.mark.parametrize("component", _COMPONENTS)
def test_global_lora_reaches_global_negative_and_every_regional_context(
    native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    component: str,
) -> None:
    call = _call(tmp_path / "request", main_inputs, "txt2img")
    resource = _resource(tmp_path, native, (component,), weight=-0.35)
    call.command = replace(call.command, loras=(resource[0],))
    with _preserved(native):
        without = _context_oracle(call.handoff, native)
        expected = _contexts(call, native, (resource,))
        actual = _run(call, native, monkeypatch, "txt2img")
        _native_association(call, native, actual.observed, expected)
        if component == "transformer":
            assert all(native.torch.equal(a, b) for a, b in zip(without, expected, strict=True))
        else:
            assert not native.torch.equal(without[1], expected[1]), "Global negative missed LoRA"
            for start in range(0, expected[0].shape[1], 512):
                assert not native.torch.equal(
                    without[0][:, start : start + 512], expected[0][:, start : start + 512]
                ), "Global or regional positive missed LoRA"


@pytest.mark.parametrize("mode", _MODES)
def test_regional_global_lora_native_consumption_red(
    native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
) -> None:
    first = _resource(tmp_path, native, name="positive", weight=0.7)
    second = _resource(tmp_path, native, name="negative", seed=91, weight=-0.35)
    resources = (first, second)
    runs: dict[str, _Run] = {}
    expected: tuple[Any, Any] | None = None
    with _preserved(native):
        for label, stack in (
            ("baseline", ()),
            ("active", tuple(item for item, _state in resources)),
            ("zero", tuple(replace(item, weight=0.0) for item, _state in resources)),
            ("repeat", tuple(item for item, _state in resources)),
            ("restored", ()),
        ):
            call = _call(tmp_path / label, main_inputs, mode)
            call.command = replace(call.command, loras=stack)
            if label == "active":
                expected = _contexts(call, native, resources)
            runs[label] = _run(call, native, monkeypatch, mode)
            if label == "active":
                assert expected is not None
                _native_association(call, native, runs[label].observed, expected)
        assert runs["active"].pixels != runs["baseline"].pixels, "LoRA did not reach native PNG"
        assert runs["repeat"].pixels == runs["active"].pixels
        assert runs["zero"].pixels == runs["restored"].pixels == runs["baseline"].pixels
        for left, right in (("baseline", "zero"), ("active", "repeat"), ("baseline", "restored")):
            for a, b in zip(runs[left].observed.passes, runs[right].observed.passes, strict=True):
                assert native.torch.equal(a["context"], b["context"])
                assert native.torch.equal(a["prediction"], b["prediction"])
        assert any(
            not native.torch.equal(a["prediction"], b["prediction"])
            for a, b in zip(
                runs["active"].observed.passes, runs["baseline"].observed.passes, strict=True
            )
        ), "Original native transformer did not consume the adapter"


def test_regional_no_lora_control_green(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    call = _call(tmp_path / "original", main_inputs, "txt2img")
    with _preserved(cpu_native):
        expected = _context_oracle(call.handoff, cpu_native)
        actual = _run(call, cpu_native, monkeypatch, "txt2img", lora_profile=None)
        _native_association(call, cpu_native, actual.observed, expected)


@pytest.mark.parametrize("mode", _MODES)
def test_existing_private_defaults_refuse_lora_before_model_or_target_consumption(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
) -> None:
    call = _call(tmp_path / "request", main_inputs, mode)
    item, _state = _resource(tmp_path, cpu_native)
    call.command = replace(call.command, loras=(item,))

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        pytest.fail("Private refusal must precede model/target consumption")

    monkeypatch.setattr(regional, "_model_profile", forbidden)
    monkeypatch.setattr(regional, "_owned_outpaint_inputs", forbidden)
    with pytest.raises(DerivativeError) as error:
        _frontend(mode)(call.handoff["recipe"], **_arguments(call, cpu_native, lora_profile=None))
    assert error.value.code == "GENERATION_PROMPT_UNSUPPORTED"
    assert (
        not call.command.output_path.exists()
        and call.command.target_path.read_bytes() == call.target_bytes
    )


@pytest.mark.parametrize("change", ["profile", "staging", "model", "weight"])
def test_lora_profile_resource_identity_refusals_precede_borrowed_model_mutation(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    change: str,
) -> None:
    call = _call(tmp_path / "request", main_inputs, "txt2img")
    item, _state = _resource(tmp_path, cpu_native)
    profile = _PROFILE
    if change == "profile":
        profile = "unsupported-global-lora-v2"
    elif change == "staging":
        item = replace(item, path=call.command.target_path)
    elif change == "model":
        item = replace(item, path=call.command.bundle.checkpoint.path)
    else:
        item = replace(item, weight=float("nan"))
    call.command = replace(call.command, loras=(item,))

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        pytest.fail("Input qualification must precede native model borrowing")

    monkeypatch.setattr(regional, "_model_profile", forbidden)
    with pytest.raises(DerivativeError) as error:
        _frontend("txt2img")(
            call.handoff["recipe"], **_arguments(call, cpu_native, lora_profile=profile)
        )
    assert error.value.code == (
        "GENERATION_LORA_UNSUPPORTED" if change == "weight" else "INVALID_REQUEST"
    )
    assert not call.command.output_path.exists()


def test_all_lora_snapshots_qualify_before_first_install_or_encoder_forward(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    call = _call(tmp_path / "request", main_inputs, "txt2img")
    first, _state = _resource(tmp_path, cpu_native, name="first")
    last, _state = _resource(tmp_path, cpu_native, name="changed", seed=91)
    call.command = replace(call.command, loras=(first, last))
    last.path.write_bytes(last.path.read_bytes() + b"changed after capture")

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        pytest.fail("Later changed resource must precede every native adapter install")

    monkeypatch.setattr(anima_lora, "_load_component", forbidden)
    with _preserved(cpu_native), _observed(cpu_native, monkeypatch) as observed:
        with pytest.raises(DerivativeError) as error:
            _frontend("txt2img")(call.handoff["recipe"], **_arguments(call, cpu_native))
        assert error.value.code == "GENERATION_INPUT_CHANGED"
        assert observed.qwen == observed.conditioner == 0 and not observed.passes
    assert not call.command.output_path.exists()


def test_preloaded_adapters_still_refuse_both_frontend_and_standalone_attention_scope(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
) -> None:
    native = cpu_native
    call = _call(tmp_path / "request", main_inputs, "txt2img")
    item, _state = _resource(tmp_path, native)
    mask = native.torch.ones((1, 1, 16, 512), dtype=native.torch.bool)
    with _preserved(native), scoped_anima_generation_loras(native.models, (item,), native.torch):
        with pytest.raises(DerivativeError) as front:
            _frontend("txt2img")(call.handoff["recipe"], **_arguments(call, native))
        assert front.value.code == "INFERENCE_UNAVAILABLE"
        with (
            pytest.raises(DerivativeError) as attention,
            regional.scoped_anima_regional_attention(native.models.transformer, mask, native.torch),
        ):
            pytest.fail("Standalone scope must not accept borrowed preloaded adapters")
        assert attention.value.code == "INFERENCE_UNAVAILABLE"
    assert not call.command.output_path.exists()


@contextlib.contextmanager
def _failure(
    native: _Native, patch: pytest.MonkeyPatch, kind: str, sentinel: Exception
) -> Generator[dict[str, Any]]:
    options: dict[str, Any] = {}
    if kind == "partial-load":
        original = cast(Any, anima_lora)._load_component

        @wraps(original)
        def load(model: Any, component: str, targets: Any, name: str) -> None:
            original(model, component, targets, name)
            if component == "text_conditioner":
                raise sentinel

        patch.setattr(anima_lora, "_load_component", load)
    elif kind == "regional-encode":
        original = regional.encode_anima_prompt

        @wraps(original)
        def encoded(*args: Any, **kwargs: Any) -> Any:
            original(*args, **kwargs)
            raise sentinel

        patch.setattr(regional, "encode_anima_prompt", encoded)
    elif kind == "decode":
        model_type = cast(Any, type(native.models.vae))
        original = model_type.decode

        @wraps(original)
        def decoded(*args: Any, **kwargs: Any) -> Any:
            original(*args, **kwargs)
            raise sentinel

        patch.setattr(model_type, "decode", decoded)
    else:

        def progress(step: int, _total: int) -> None:
            if step == 2:
                raise sentinel

        options["on_progress"] = progress
    yield options


@pytest.mark.parametrize(
    ("mode", "failure"),
    [
        ("txt2img", "partial-load"),
        ("txt2img", "regional-encode"),
        ("txt2img", "late-denoise"),
        ("txt2img", "decode"),
        ("img2img", "late-denoise"),
        ("outpaint", "late-denoise"),
    ],
)
def test_owned_lora_failures_restore_models_rng_processors_and_allow_exact_fresh_call(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    failure: str,
) -> None:
    native = cpu_native
    item, _state = _resource(tmp_path, native)
    reference = _call(tmp_path / "reference", main_inputs, mode)
    reference.command = replace(reference.command, loras=(item,))
    with _preserved(native):
        expected = _run(reference, native, monkeypatch, mode)
    failed = _call(tmp_path / "failure", main_inputs, mode)
    failed.command = replace(failed.command, loras=(item,))
    sentinel = RuntimeError("controlled owned regional LoRA " + failure)
    with (
        _preserved(native),
        monkeypatch.context() as patch,
        _failure(native, patch, failure, sentinel) as options,
    ):
        with pytest.raises(Exception) as caught:
            _run(failed, native, patch, mode, **options)
        assert _contains_cause(caught.value, sentinel)
        assert not failed.command.output_path.exists()
        assert failed.command.target_path.read_bytes() == failed.target_bytes
        assert not list(failed.command.staging_root.glob("*.tmp"))
    assert not cast(Any, regional)._MODEL_OWNERS and not cast(Any, regional)._ATTENTION_OWNERS
    recovered = _call(tmp_path / "recovered", main_inputs, mode)
    recovered.command = replace(recovered.command, loras=(item,))
    with _preserved(native):
        actual = _run(recovered, native, monkeypatch, mode)
    assert actual.pixels == expected.pixels
    for first, second in zip(expected.observed.passes, actual.observed.passes, strict=True):
        assert native.torch.equal(first["prediction"], second["prediction"])


@pytest.mark.parametrize("mode", _MODES)
@pytest.mark.parametrize("enabled", [False, True])
def test_public_worker_preserves_exact_stack_and_selects_lora_profile_only_for_resources(
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    enabled: bool,
) -> None:
    source = _call(tmp_path / "source", main_inputs, mode)
    case = (
        _case(tmp_path / "wire", source.handoff)
        if mode == "txt2img"
        else (_image_wire if mode == "img2img" else _outpaint_wire)(tmp_path / "wire", source)
    )
    lora = tmp_path / "descriptor-only.safetensors"
    lora.write_bytes(
        b"Explicit loader collaborator; native resource qualification has separate cases."
    )
    if enabled:
        case.bundle["request"]["job"]["loras"] = [{**_descriptor(lora), "weight": -0.35}]
    case.seal()
    captured = worker.parse_anima_regional_request(case.wire)
    assert len(captured.command.loras) == int(enabled)
    if enabled:
        assert captured.command.loras[0] == GenerationLora(
            lora, hashlib.sha256(lora.read_bytes()).hexdigest(), lora.stat().st_size, -0.35
        )
    runtime = _runtime()
    order: list[str] = []
    models = SimpleNamespace(
        **{name: SimpleNamespace(eval=lambda: None) for name in (*_COMPONENTS, "vae")}
    )

    def load(bundle: Any, **kwargs: Any) -> Any:
        assert bundle == captured.command.bundle and kwargs == {
            "device": "cuda",
            "dtype": cast(Any, runtime.torch).bfloat16,
        }
        order.append("load")
        return models

    prepared = cast(Any, (object(), object()))

    def prepare(command: Any) -> Any:
        assert command == captured.command
        order.append("prepare")
        return prepared

    def generate(recipe: Any, **kwargs: Any) -> dict[str, object]:
        assert recipe == captured.recipe and kwargs["command"] == captured.command
        assert kwargs["models"] is models and kwargs["runtime"] is runtime
        assert kwargs.get("lora_profile") == (_PROFILE if enabled else None)
        assert ("lora_profile" in kwargs) is enabled
        if mode == "outpaint":
            assert order == ["prepare", "load"] and kwargs["_prepared_outpaint"] is prepared
        else:
            assert order == ["load"]
        return {"type": "generation-done", "requestId": captured.command.request_id}

    monkeypatch.setattr(worker, "load_anima_models", load)
    monkeypatch.setattr(worker, "prepare_worker_outpaint", prepare)
    monkeypatch.setattr(worker, _frontend(mode).__name__, generate)
    done = worker.execute_anima_regional_request(case.wire, config_dir=tmp_path, runtime=runtime)
    assert done == {"type": "generation-done", "requestId": captured.command.request_id}


def test_regional_lora_capability_is_additive_only_for_qualified_anima_runtime() -> None:
    assert worker.ANIMA_REGIONAL_LORA_CAPABILITY == "anima-regional-lora-v1"
    ready = inference_main.inference_ready_message(_runtime())
    assert ready["workerVersion"] == "0.14.0"
    capabilities = cast(list[str], ready["capabilities"])
    assert "anima-regional-lora-v1" in capabilities
    assert "anima-regional-lora-v1" not in cast(
        list[str], inference_main.inference_ready_message()["capabilities"]
    )


@pytest.mark.parametrize("own_metadata", [False, True])
def test_native_adapter_metadata_presence_and_original_objects_are_restored(
    native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    own_metadata: bool,
) -> None:
    model = native.models.qwen3_encoder
    keys = ("_hf_peft_config_loaded", "_weight_conversions", "peft_config")
    if own_metadata:
        model._hf_peft_config_loaded = False
        model._weight_conversions = []
        model.peft_config = {}
    before = {key: (key in vars(model), cast(dict[str, Any], vars(model)).get(key)) for key in keys}
    resource, _state = _resource(tmp_path, native, ("qwen3_encoder",), weight=-0.35)
    call = _call(tmp_path / "request", main_inputs, "txt2img")
    call.command = replace(call.command, loras=(resource,))
    with _preserved(native):
        _run(call, native, monkeypatch, "txt2img")
    for key, (owned, original) in before.items():
        assert (key in vars(model)) is owned
        if owned:
            assert vars(model)[key] is original
            if type(original) is dict or type(original) is list:
                assert not original


def test_regional_lora_global_rng_refuses_disjoint_overlap_and_recovers(
    cpu_native: _Native,
    native_factory: Callable[[str], _Native],
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A distinct fixture cache key constructs another CPU model set before either RNG scope.
    second = native_factory("cpu-float32-independent-lora")
    assert second.models.transformer is not cpu_native.models.transformer
    resource, _state = _resource(tmp_path, cpu_native, weight=-0.35)
    first_call = _call(tmp_path / "first", main_inputs, "txt2img")
    second_call = _call(tmp_path / "second", main_inputs, "txt2img")
    first_call.command = replace(first_call.command, loras=(resource,))
    second_call.command = replace(second_call.command, loras=(resource,))
    entered, release = threading.Event(), threading.Event()
    load = cast(Any, anima_lora)._load_component

    @wraps(load)
    def hold(*args: Any, **kwargs: Any) -> None:
        load(*args, **kwargs)
        if not entered.is_set():
            entered.set()
            assert release.wait(30), "Test must release the held native adapter constructor"

    monkeypatch.setattr(anima_lora, "_load_component", hold)
    failures: list[BaseException] = []
    completions: list[dict[str, object]] = []

    def run_first() -> None:
        try:
            completions.append(
                cast(
                    dict[str, object],
                    _frontend("txt2img")(
                        first_call.handoff["recipe"], **_arguments(first_call, cpu_native)
                    ),
                )
            )
        except BaseException as error:
            failures.append(error)

    with _preserved(cpu_native), _preserved(second):
        thread = threading.Thread(target=run_first)
        thread.start()
        try:
            assert entered.wait(30), "First operation must reach actual native adapter loading"
            with pytest.raises(DerivativeError) as conflict:
                _frontend("txt2img")(
                    second_call.handoff["recipe"], **_arguments(second_call, second)
                )
            assert conflict.value.code == "OWNERSHIP_CONFLICT"
            assert not second_call.command.output_path.exists()
        finally:
            release.set()
            thread.join(45)
        assert not thread.is_alive()
        assert not failures, failures
        assert len(completions) == 1 and completions[0]["type"] == "generation-done"
        done = _frontend("txt2img")(
            second_call.handoff["recipe"], **_arguments(second_call, second)
        )
        assert done["type"] == "generation-done"
