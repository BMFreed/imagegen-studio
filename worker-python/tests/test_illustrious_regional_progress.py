"""Scalar regional progress through original native steps and the real JSONL owner.

InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd was read at
app/invocations/sd/denoise_latents.py, backend/stable_diffusion/diffusers_pipeline.py
and app/services/shared/invocation_context.py: completed-step notifications follow
the original scheduler transition. Studio adapts its existing run_sdxl_pipeline
callback; these tests neither implement a loop nor request callback tensors.

Small real CPU/CUDA models and the existing output/preservation oracles qualify
native ordering, unchanged pixels and recoverable sink failure. Worker/JSONL
tests retain real file snapshots/parser/dispatch and explicitly replace only
the native loader and output collaborators; those tests are not ML evidence.
ROOT owns collection, execution, isolated mutation and installed UI acceptance.

Mutation selectors: test_regional_progress_callback_mutation_red must fail when
the regional runner drops progress forwarding; the no-progress control remains
GREEN. No mutation is installed by this file. Authorship permits AST/Ruff only.
"""

from __future__ import annotations

import contextlib
import importlib
import inspect
import io
import json
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from functools import wraps
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest

from imagegen_worker import illustrious_regional_worker as worker
from imagegen_worker import inference_main
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.inference import MLRuntime
from test_illustrious_regional_embeddings import (
    _models,  # pyright: ignore[reportPrivateUsage]
    _no_native,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _assert_png,  # pyright: ignore[reportPrivateUsage]
    _before_filework,  # pyright: ignore[reportPrivateUsage]
    _generate,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _observe as _output_observe,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_sampling import (
    _args,  # pyright: ignore[reportPrivateUsage]
    _output_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_worker import (
    _case as _worker_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_worker import (
    _seal as _seal_worker_case,  # pyright: ignore[reportPrivateUsage]
)

CAPABILITY = "illustrious-regional-progress-v1"
STEPS = 3


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


@contextmanager
def _native_events(native: Any, monkeypatch: pytest.MonkeyPatch) -> Generator[Any]:
    """Observe completed original Euler calls, not a wrapper's entry counter."""
    cls = native.diffusers.EulerDiscreteScheduler
    original_step = cls.step
    pipeline_cls = cast(Any, type(native.pipeline))
    original_call = pipeline_cls.__call__
    vae_cls = cast(Any, type(native.pipeline.vae))
    original_decode = vae_cls.decode
    seen = SimpleNamespace(events=[], options=[], completed=0)

    @wraps(original_step)
    def step(current: Any, *args: Any, **kwargs: Any) -> Any:
        result = original_step(current, *args, **kwargs)
        seen.completed += 1
        seen.events.append(("euler-return", seen.completed))
        return result

    @wraps(original_call)
    def call(current: Any, *args: Any, **kwargs: Any) -> Any:
        seen.options.append(
            (
                kwargs.get("callback_on_step_end"),
                tuple(kwargs.get("callback_on_step_end_tensor_inputs", ())),
            )
        )
        return original_call(current, *args, **kwargs)

    @wraps(original_decode)
    def decode(current: Any, *args: Any, **kwargs: Any) -> Any:
        result = original_decode(current, *args, **kwargs)
        if current is native.pipeline.vae:
            seen.events.append(("decode-return", seen.completed))
        return result

    with monkeypatch.context() as patch:
        patch.setattr(cls, "step", step)
        patch.setattr(pipeline_cls, "__call__", call)
        patch.setattr(vae_cls, "decode", decode)
        yield seen


def _assert_native_once(seen: Any, *, steps: int = STEPS) -> None:
    assert seen.builds == [("cat", "blur"), ("dog", "grain")]
    assert len(seen.clips) == 8
    assert len(seen.pipeline_inputs) == len(seen.pipeline_results) == 1
    assert len(seen.steps) == len(seen.root_inputs) == len(seen.contexts) == steps
    assert len(seen.decodes) == len(seen.decode_results) == 1
    assert len(seen.entries) == len(seen.publications) == len(seen.receipts) == 1


def test_regional_progress_callback_mutation_red(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The exact scalar sequence follows real transitions and cannot alter PT/PNG."""
    baseline = _output_case(tmp_path, lane, name="quiet")
    with (
        _output_observe(output, lane, monkeypatch) as quiet,
        _native_events(lane, monkeypatch) as quiet_events,
    ):
        baseline_done = _generate(output, lane, baseline)
    baseline_rgb = _assert_png(lane, baseline, quiet, baseline_done)
    _assert_native_once(quiet)
    assert quiet_events.options == [(None, ())]

    observed = _output_case(tmp_path, lane, name="progress")
    notifications: list[tuple[int, int]] = []
    with (
        _output_observe(output, lane, monkeypatch) as seen,
        _native_events(lane, monkeypatch) as events,
    ):

        def progress(completed: int, total: int) -> None:
            assert type(completed) is type(total) is int
            assert events.completed == completed
            assert events.events[-1] == ("euler-return", completed)
            assert len(seen.steps) == len(seen.root_inputs) == completed
            assert not seen.decodes and not seen.publications
            notifications.append((completed, total))
            events.events.append(("progress", completed))

        observed.args["on_progress"] = progress
        done = _generate(output, lane, observed)
    assert notifications == [(1, STEPS), (2, STEPS), (3, STEPS)]
    assert events.events == [
        (kind, step) for step in range(1, STEPS + 1) for kind in ("euler-return", "progress")
    ] + [("decode-return", STEPS)]
    assert len(events.options) == 1
    assert callable(events.options[0][0]) and events.options[0][1] == ()
    _assert_native_once(seen)
    assert lane.torch.equal(seen.native_results[0][1], quiet.native_results[0][1])
    assert _assert_png(lane, observed, seen, done) == baseline_rgb


def test_regional_no_progress_control_green(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A dropped-progress mutation leaves legacy native execution independently GREEN."""
    case = _output_case(tmp_path, lane)
    # Explicit None is the same default; downstream legacy seams omit the key.
    case.args["on_progress"] = None
    with (
        _output_observe(output, lane, monkeypatch) as seen,
        _native_events(lane, monkeypatch) as events,
    ):
        done = _generate(output, lane, case)
    assert "on_progress" not in seen.entries[0][1]
    assert events.options == [(None, ())]
    assert events.events == [("euler-return", n) for n in range(1, STEPS + 1)] + [
        ("decode-return", STEPS)
    ]
    _assert_native_once(seen)
    # The helper compares only arguments that actually cross the default seam.
    del case.args["on_progress"]
    assert _assert_png(lane, case, seen, done)


def test_native_progress_sink_failure_preserves_identity_and_allows_fresh_output(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _output_case(tmp_path, lane)
    sentinel = RuntimeError("completed-step sink failure")
    received: list[tuple[int, int]] = []
    with (
        _output_observe(output, lane, monkeypatch) as failed,
        _native_events(lane, monkeypatch) as events,
    ):

        def fail(completed: int, total: int) -> None:
            assert events.completed == completed
            received.append((completed, total))
            if completed == 2:
                raise sentinel

        case.args["on_progress"] = fail
        with pytest.raises(RuntimeError) as caught:
            _generate(output, lane, case)
    assert caught.value is sentinel
    assert received == [(1, STEPS), (2, STEPS)]
    assert events.completed == 2
    assert len(failed.steps) == len(failed.root_inputs) == 2
    assert failed.builds == [("cat", "blur"), ("dog", "grain")]
    assert not failed.decodes and not failed.pipeline_results
    assert not failed.publications and not failed.receipts
    assert not case.command.output_path.exists()
    assert not Path(str(case.command.output_path) + ".thumb.webp").exists()
    assert not list(case.root.glob(".*.tmp"))

    recovered: list[tuple[int, int]] = []

    def recover(completed: int, total: int) -> None:
        recovered.append((completed, total))

    case.args["on_progress"] = recover
    with _output_observe(output, lane, monkeypatch) as healthy:
        done = _generate(output, lane, case)
    assert recovered == [(1, STEPS), (2, STEPS), (3, STEPS)]
    _assert_native_once(healthy)
    assert _assert_png(lane, case, healthy, done)


@pytest.mark.parametrize("entry", ("denoising", "output"))
@pytest.mark.parametrize("sink", (False, 1, "not-callable"))
def test_noncallable_native_sink_refuses_before_files_or_encoding(
    tmp_path: Path,
    cpu: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    entry: str,
    sink: object,
) -> None:
    recipe = _recipe(_region())
    if entry == "denoising":
        args = _args(cpu, recipe)
        with (
            _no_native(cpu, monkeypatch),
            pytest.raises(cpu.denoising.IllustriousRegionalDenoisingError) as caught,
        ):
            cpu.denoising.run_current_canvas_regional_denoising(recipe, on_progress=sink, **args)
    else:
        case = _output_case(tmp_path, cpu)
        with (
            _before_filework(cpu, monkeypatch),
            pytest.raises(output.IllustriousRegionalOutputError) as caught,
        ):
            output.generate_current_canvas_regional_txt2img(
                case.recipe, command=case.command, on_progress=sink, **case.args
            )
    assert caught.value.code == "INPUT_INVALID"
    assert "callable" in str(caught.value)


def _dispatch_collaborators(monkeypatch: pytest.MonkeyPatch) -> Any:
    """Use the existing worker fixture's explicitly non-native collaborators."""
    seen = SimpleNamespace(loads=[], outputs=[], hooks=[], noise=False)
    component = SimpleNamespace(eval=lambda: None)
    pipeline = SimpleNamespace(
        text_encoder=component, text_encoder_2=component, unet=component, vae=component
    )
    runtime = cast(
        MLRuntime, SimpleNamespace(torch=SimpleNamespace(no_grad=contextlib.nullcontext))
    )

    def load(parameters: Any, **kwargs: Any) -> tuple[Any, Any]:
        seen.loads.append((parameters, kwargs))
        assert kwargs["mode"] == "txt2img"
        assert parameters.positive_embeddings == parameters.negative_embeddings == ()
        return pipeline, None

    def publish(recipe: Any, **kwargs: Any) -> dict[str, object]:
        seen.outputs.append((recipe, kwargs))
        assert kwargs["pipeline"] is pipeline and kwargs["runtime"] is runtime
        if seen.noise:
            print("regional library diagnostic belongs on stderr")
        if "on_progress" in kwargs:
            for step in range(1, kwargs["command"].steps + 1):
                kwargs["on_progress"](step, kwargs["command"].steps)
        command = kwargs["command"]
        return {
            "type": "generation-done",
            "protocolVersion": "1",
            "requestId": command.request_id,
            "outputPath": str(command.output_path),
            "seed": command.seed,
        }

    def bindings(*_args: Any) -> tuple[()]:
        return ()

    monkeypatch.setattr(worker, "load_illustrious_pipeline", load)
    monkeypatch.setattr(worker, "install_capture_hooks", seen.hooks.append)
    monkeypatch.setattr(worker, "qualify_bindings", bindings)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_txt2img", publish)
    return SimpleNamespace(runtime=runtime, seen=seen)


@pytest.mark.parametrize("requested", (False, True))
def test_owned_worker_opt_in_alone_selects_scalar_sink(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, requested: bool
) -> None:
    case = _worker_case(tmp_path)
    if requested:
        case.wire["reportProgress"] = True
    parsed = worker.parse_regional_request(case.wire)
    assert parsed.report_progress is requested
    collaborators = _dispatch_collaborators(monkeypatch)
    notifications: list[tuple[int, int]] = []

    def progress(completed: int, total: int) -> None:
        notifications.append((completed, total))

    response = worker.execute_regional_request(
        case.wire, config_dir=tmp_path, runtime=collaborators.runtime, on_progress=progress
    )
    assert response["type"] == "generation-done" and response["requestId"] == "private-1"
    assert len(collaborators.seen.loads) == len(collaborators.seen.outputs) == 1
    kwargs = collaborators.seen.outputs[0][1]
    if requested:
        assert kwargs["on_progress"] is progress
        assert notifications == [(1, 2), (2, 2)]
    else:
        assert "on_progress" not in kwargs and notifications == []


@pytest.mark.parametrize("flag", (False, None, "true", 1, 0, [], {}))
def test_present_nontrue_progress_flag_refuses_before_owned_file_reads(
    tmp_path: Path, flag: object
) -> None:
    case = _worker_case(tmp_path)
    case.wire["reportProgress"] = flag
    # A different refusal would occur if parsing proceeded into owned snapshots.
    case.manifest.unlink()
    with pytest.raises(DerivativeError, match="reportProgress") as caught:
        worker.parse_regional_request(case.wire)
    assert caught.value.code == "INVALID_REQUEST"


@pytest.mark.parametrize("sink", (None, False, "not-callable"))
def test_requested_worker_progress_requires_callable_before_native_loading(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, sink: object
) -> None:
    case = _worker_case(tmp_path)
    case.wire["reportProgress"] = True
    collaborators = _dispatch_collaborators(monkeypatch)
    with pytest.raises(DerivativeError, match="callable") as caught:
        worker.execute_regional_request(
            case.wire,
            config_dir=tmp_path,
            runtime=collaborators.runtime,
            on_progress=cast(Any, sink),
        )
    assert caught.value.code == "INVALID_REQUEST"
    assert collaborators.seen.loads == collaborators.seen.outputs == []


def test_real_jsonl_entry_keeps_saved_stdout_correlated_and_legacy_quiet(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    parents = [tmp_path / name for name in ("opted", "legacy")]
    for parent in parents:
        parent.mkdir()
    opted, legacy = (_worker_case(parent) for parent in parents)
    for case, request_id in ((opted, "progress-A"), (legacy, "quiet-B")):
        case.request["requestId"] = case.wire["requestId"] = request_id
        _seal_worker_case(case)
    opted.wire["reportProgress"] = True
    collaborators = _dispatch_collaborators(monkeypatch)
    collaborators.seen.noise = True
    stdin = io.BytesIO(b"".join(json.dumps(case.wire).encode() + b"\n" for case in (opted, legacy)))
    stdout, stderr = io.BytesIO(), io.StringIO()
    monkeypatch.setattr(inference_main, "_qualify", lambda: (tmp_path, collaborators.runtime))
    monkeypatch.setattr(inference_main.sys, "stdin", SimpleNamespace(buffer=stdin))
    monkeypatch.setattr(inference_main.sys, "stdout", SimpleNamespace(buffer=stdout))
    monkeypatch.setattr(inference_main.sys, "stderr", stderr)
    assert inference_main.main() == 0
    messages = [json.loads(line) for line in stdout.getvalue().splitlines()]
    assert len(messages) == 5
    assert messages[0]["type"] == "ready"
    capabilities = messages[0]["capabilities"]
    assert capabilities.count(CAPABILITY) == 1
    assert "denoising-progress" in capabilities
    assert "private-current-canvas-regional-v1" in capabilities
    assert messages[1:3] == [
        {
            "type": "generation-progress",
            "protocolVersion": "1",
            "requestId": opted.wire["requestId"],
            "step": step,
            "totalSteps": 2,
        }
        for step in (1, 2)
    ]
    assert [message["type"] for message in messages[3:]] == [
        "generation-done",
        "generation-done",
    ]
    assert messages[3]["outputPath"] == str(opted.root / "result.png")
    assert messages[4]["outputPath"] == str(legacy.root / "result.png")
    assert [message["requestId"] for message in messages[3:]] == ["progress-A", "quiet-B"]
    assert "on_progress" in collaborators.seen.outputs[0][1]
    assert "on_progress" not in collaborators.seen.outputs[1][1]
    assert len(collaborators.seen.loads) == len(collaborators.seen.outputs) == 2
    assert stderr.getvalue().count("regional library diagnostic belongs on stderr") == 2


def test_progress_is_optional_scalar_keyword_without_native_callback_surface(output: Any) -> None:
    denoising = importlib.import_module("imagegen_worker.illustrious_regional_denoising")
    for entry in (
        denoising.run_current_canvas_regional_denoising,
        output.generate_current_canvas_regional_txt2img,
        worker.execute_regional_request,
    ):
        signature = inspect.signature(entry)
        progress = signature.parameters["on_progress"]
        assert progress.kind is inspect.Parameter.KEYWORD_ONLY and progress.default is None
        assert not any(
            parameter.kind is inspect.Parameter.VAR_KEYWORD
            for parameter in signature.parameters.values()
        )
        assert not {
            "callback",
            "callback_on_step_end",
            "callback_on_step_end_tensor_inputs",
            "on_denoising_step",
        }.intersection(signature.parameters)
