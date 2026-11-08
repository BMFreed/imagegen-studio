"""Explicit public composition through the original CPU-native qualification seam.

These cases do not claim CUDA/trained/public-lane execution. They retain the
original processors and compare actual processor/dispatch/SDPA consumption with
independent nearest/ceil permissions and the current Invoke Krea-2 predicate.
"""

from __future__ import annotations

import ast
import copy
from collections.abc import Callable
from pathlib import Path
from typing import Any, cast

import pytest

from imagegen_worker.derivatives import DerivativeError
from test_anima_regional import (
    _command,  # pyright: ignore[reportPrivateUsage]
    _context_oracle,  # pyright: ignore[reportPrivateUsage]
    _execute,  # pyright: ignore[reportPrivateUsage]
    _mask_oracle,  # pyright: ignore[reportPrivateUsage]
    _Native,  # pyright: ignore[reportPrivateUsage]
    _observed,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
    _published,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional import (
    cpu_native as cpu_native,
)
from test_anima_regional import (
    main_inputs as main_inputs,
)
from test_anima_regional import (
    native_factory as native_factory,
)
from test_anima_regional_worker import (
    _dormant_reference,  # pyright: ignore[reportPrivateUsage]
)

_PROFILE = "invoke-krea2-global-support-v1"


def test_dormant_authored_metadata_preserves_original_native_predictions_and_rgb(
    cpu_native: _Native,
    main_inputs: Callable[..., dict[str, Any]],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    handoff = main_inputs()
    dormant = copy.deepcopy(handoff)
    dormant["recipe"]["regions"][0]["authoredPrompts"]["positive"]["embeddingRefs"] = [
        _dormant_reference()
    ]
    pixels: list[bytes] = []
    passes: list[list[dict[str, Any]]] = []
    with _preserved(cpu_native):
        for index, value in enumerate((handoff, dormant)):
            call = _command(tmp_path / f"dormant-{index}", value)
            with _observed(cpu_native, monkeypatch) as observed:
                done = _execute(call, cpu_native, composition_profile=_PROFILE)
            pixels.append(_published(call, cpu_native, done, observed))
            passes.append(observed.passes)
    assert pixels[0] == pixels[1]
    for original, retained in zip(passes[0], passes[1], strict=True):
        assert cpu_native.torch.equal(original["context"], retained["context"])
        assert cpu_native.torch.equal(original["prediction"], retained["prediction"])


def _invoke_global_support(background: Any) -> Any:
    source = (
        Path(__file__).resolve().parents[3]
        / "sources/InvokeAI/invokeai/backend/krea2/regional_prompting.py"
    )
    tree = ast.parse(source.read_text())
    predicates = [
        node.value
        for node in ast.walk(tree)
        if isinstance(node, ast.Assign)
        and any(
            isinstance(target, ast.Name) and target.id == "unmasked_conditioning_mask"
            for target in node.targets
        )
    ]
    assert len(predicates) == 1, "Current Invoke must supply the adapted source predicate"
    predicate = ast.Expression(predicates[0])
    expected = ast.parse("background_mask | ~background_mask.any()", mode="eval")
    assert ast.dump(predicate) == ast.dump(expected)
    # Execute only the selected source expression, never import Invoke/runtime.
    return eval(
        compile(predicate, str(source), "eval"),
        {"__builtins__": {}},
        {
            "background_mask": background,
        },
    )


@pytest.mark.parametrize("geometry", ["full", "partial", "overlap", "zero"])
def test_original_processors_consume_only_the_explicit_global_support_change(
    cpu_native: _Native,
    main_inputs: Callable[..., dict[str, Any]],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    geometry: str,
) -> None:
    native = cpu_native
    handoff = main_inputs("zero" if geometry == "zero" else "base")
    bbox = handoff["recipe"]["bbox"]
    for region in handoff["recipe"]["regions"]:
        coverage = region["coverage"]
        if geometry == "partial":
            cutoff = bbox["width"] * (bbox["height"] // 2)
            coverage["alpha"][cutoff:] = [0] * (len(coverage["alpha"]) - cutoff)
        elif geometry == "overlap":
            coverage["alpha"] = [255] * (bbox["width"] * bbox["height"])
            coverage["intersection"] = copy.deepcopy(bbox)
    call = _command(tmp_path / geometry, handoff)
    before = copy.deepcopy(handoff)
    ordinary_mask = _mask_oracle(handoff, native.torch)
    expected = ordinary_mask.clone()
    if geometry != "zero":
        background = ordinary_mask[0, 0, :, 0]
        expected[0, 0, :, :512] = _invoke_global_support(background).unsqueeze(1)
        assert bool(native.torch.equal(expected[..., 512:], ordinary_mask[..., 512:])), (
            "Global-support adaptation changed regional permission columns"
        )
        assert bool(native.torch.equal(expected, ordinary_mask)) is (geometry == "partial")
    events: list[tuple[int, int]] = []

    def progress(step: int, total: int) -> None:
        events.append((step, total))

    with _preserved(native):
        contexts = _context_oracle(handoff, native)
        with _observed(native, monkeypatch) as observed:
            done = _execute(
                call,
                native,
                composition_profile=_PROFILE,
                on_progress=progress,
            )
        _published(call, native, done, observed)
        assert events == [(1, 2), (2, 2)]
        assert len(observed.passes) == 4 and observed.qwen == observed.conditioner
        for index, prediction in enumerate(observed.passes):
            assert native.torch.equal(prediction["context"], contexts[index % 2])
        for observations in (observed.processors, observed.dispatch, observed.sdpa):
            assert observations
            for item in observations:
                masked = (
                    geometry != "zero"
                    and item["pass"] % 2 == 0
                    and item["kind"] == "cross"
                    and item["block"] % 2 == 0
                )
                if masked:
                    assert item["mask"] is not None
                    assert native.torch.equal(item["mask"], expected), (
                        "Original native attention consumed wrong global/regional permissions"
                    )
                else:
                    assert item["mask"] is None, "Negative, odd, self or zero-row call was masked"
    assert handoff == before


def test_default_profile_restores_exact_predictions_and_png_after_explicit_profile(
    cpu_native: _Native,
    main_inputs: Callable[..., dict[str, Any]],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    native = cpu_native
    handoff = main_inputs()
    observations: list[Any] = []
    pixels: list[bytes] = []
    with _preserved(native):
        for index, profile in enumerate((None, _PROFILE, None)):
            call = _command(tmp_path / f"profile-{index}", handoff)
            with _observed(native, monkeypatch) as observed:
                done = _execute(call, native, composition_profile=profile)
            pixels.append(_published(call, native, done, observed))
            observations.append(observed)
        assert pixels[0] == pixels[2]
        for first, restored in zip(observations[0].passes, observations[2].passes, strict=True):
            assert native.torch.equal(first["prediction"], restored["prediction"])
        assert not native.torch.equal(
            observations[0].passes[0]["prediction"], observations[1].passes[0]["prediction"]
        ), "Explicit full-coverage global support never influenced original native prediction"
        assert native.torch.equal(
            observations[0].passes[0]["latents"], observations[1].passes[0]["latents"]
        )
        assert native.torch.equal(
            observations[0].passes[0]["context"], observations[1].passes[0]["context"]
        )


def test_progress_failure_restores_native_graph_and_allows_fresh_profile_execution(
    cpu_native: _Native,
    main_inputs: Callable[..., dict[str, Any]],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    native = cpu_native
    handoff = main_inputs()
    sentinel = RuntimeError("declared regional progress failure")
    events: list[tuple[int, int]] = []

    def fail(step: int, total: int) -> None:
        events.append((step, total))
        raise sentinel

    call = _command(tmp_path / "failed-progress", handoff)
    with _preserved(native):
        with _observed(native, monkeypatch) as observed, pytest.raises(Exception) as error:
            _execute(call, native, composition_profile=_PROFILE, on_progress=fail)
        cause: BaseException | None = error.value
        while cause is not None and cause is not sentinel:
            cause = cause.__cause__ or cause.__context__
        assert cause is sentinel
        assert events == [(1, 2)] and len(observed.passes) == 2
        assert call.command.target_path.read_bytes() == call.target_bytes
        assert not call.command.output_path.exists() and not observed.decoded
        assert not list(call.command.staging_root.glob("*.tmp"))
    fresh = _command(tmp_path / "fresh-progress", handoff)
    with _preserved(native), _observed(native, monkeypatch) as restored:
        done = _execute(fresh, native, composition_profile=_PROFILE)
        _published(fresh, native, done, restored)
        assert len(restored.passes) == 4


@pytest.mark.parametrize("change", ["profile", "progress"])
def test_bad_explicit_policy_refuses_before_any_original_native_forward(
    cpu_native: _Native,
    main_inputs: Callable[..., dict[str, Any]],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    change: str,
) -> None:
    native = cpu_native
    call = _command(tmp_path / "bad-policy", main_inputs())
    options = (
        {"composition_profile": "unrecognized-v1"}
        if change == "profile"
        else {"on_progress": cast(Any, False)}
    )
    with _preserved(native), _observed(native, monkeypatch) as observed:
        with pytest.raises(DerivativeError):
            _execute(call, native, **options)
        assert not observed.passes and observed.qwen == observed.conditioner == 0
    assert call.command.target_path.read_bytes() == call.target_bytes
    assert not call.command.output_path.exists()
