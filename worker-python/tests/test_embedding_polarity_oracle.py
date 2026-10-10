"""Oracle mechanics through real native tiny layers; these are not trained evidence.

Reuse the existing seeded CLIP/Compel/Diffusers fixture and actual production
loader, conditioning builder and handoff. No test invents expected tensor values.
"""

from __future__ import annotations

import importlib
import importlib.util
import sys
from dataclasses import replace
from functools import lru_cache
from pathlib import Path
from typing import Any, cast

import pytest

from imagegen_worker.inference import (
    build_sdxl_conditioning,
    run_sdxl_pipeline,
)
from test_sdxl_embeddings import (
    _command,  # pyright: ignore[reportPrivateUsage]
    saved,
    state,
)
from test_sdxl_embeddings import native as native


@lru_cache(maxsize=1)
def oracle() -> Any:
    source = Path(__file__).resolve().parents[2] / "scripts" / "noobai-embedding-polarity-oracle.py"
    spec = importlib.util.spec_from_file_location("igs_native_embedding_polarity_oracle", source)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def assignments(root: Path, torch: Any) -> dict[str, Any]:
    trained_state = state(torch)
    trained = saved(root, trained_state, name="trained")
    zero = saved(
        root,
        {key: torch.zeros_like(value) for key, value in trained_state.items()},
        name="zero",
    )
    command = replace(
        _command(root),
        positive_prompt="portrait <Case-Sensitive>",
        negative_prompt="blur <Case-Sensitive>",
    )
    return {
        label: replace(
            command,
            request_id=f"mechanical-{index}",
            positive_embeddings=(positive,),
            negative_embeddings=(negative,),
        )
        for index, (label, positive, negative) in enumerate(
            (
                ("trained/trained", trained, trained),
                ("trained/zero", trained, zero),
                ("zero/trained", zero, trained),
                ("zero/zero", zero, zero),
            )
        )
    }


@pytest.mark.parametrize("legacy_pooling", [False, True])
def test_four_native_assignments_and_original_handoff(
    tmp_path: Path, native: Any, legacy_pooling: bool
) -> None:
    torch, runtime, make = native
    pipeline = make()
    if legacy_pooling:
        # The installed original SDXL configs use this legacy argmax-pooling branch.
        for encoder in (pipeline.text_encoder, pipeline.text_encoder_2):
            encoder.config.eos_token_id = 2
            encoder.text_model.eos_token_id = 2
    commands = assignments(tmp_path, torch)
    originals = dict(commands)
    native_call = type(pipeline).__call__
    values = {}
    for index, (label, command) in enumerate(commands.items()):
        evidence, actual = oracle().inspect_assignment(
            command, pipeline, runtime, namespace=f"igs_reference_mechanical_{index}"
        )
        assert evidence == {
            "hiddenPositiveMatches": True,
            "hiddenNegativeMatches": True,
            "pooledPositiveMatches": True,
            "pooledNegativeMatches": True,
            "handoff": {
                "hiddenPositiveMatches": True,
                "hiddenNegativeMatches": True,
                "pooledPositiveMatches": True,
                "pooledNegativeMatches": True,
                "observations": 1,
                "generatorStateUnchanged": True,
                "methodRestored": True,
            },
        }
        assert type(pipeline).__call__ is native_call
        values[label] = actual
    assert oracle().assert_branch_isolation(values, torch) == {
        field: {"oppositeUnchanged": True, "ownResourceChanges": True}
        for field in ("positiveHidden", "negativeHidden", "positivePooled", "negativePooled")
    }
    assert commands == originals
    assert {command.positive_prompt for command in commands.values()} == {
        "portrait <Case-Sensitive>"
    }
    assert {command.negative_prompt for command in commands.values()} == {"blur <Case-Sensitive>"}


@pytest.mark.parametrize("assignment", ["trained/zero", "zero/trained"])
def test_real_swapped_resource_lists_fail_the_directional_oracle(
    tmp_path: Path, native: Any, assignment: str
) -> None:
    torch, runtime, make = native
    pipeline = make()
    command = assignments(tmp_path, torch)[assignment]
    swapped = replace(
        command,
        positive_embeddings=command.negative_embeddings,
        negative_embeddings=command.positive_embeddings,
    )
    with torch.inference_mode():
        actual = build_sdxl_conditioning(swapped, pipeline, runtime)
        expected = oracle().build_reference_conditioning(
            command, pipeline, runtime, namespace="igs_reference_swap_control"
        )
    assert swapped.positive_prompt == command.positive_prompt
    assert swapped.negative_prompt == command.negative_prompt
    with pytest.raises(
        AssertionError,
        match=(
            r"^Installed positive embedding conditioning differs "
            r"from independent native reference\.$"
        ),
    ):
        oracle().assert_conditioning_matches(actual, expected, torch)


@pytest.mark.parametrize("pooled", [False, True])
def test_hidden_or_pooled_swap_is_rejected_at_comparison_and_actual_handoff(
    tmp_path: Path, native: Any, pooled: bool
) -> None:
    torch, runtime, make = native
    pipeline = make()
    command = assignments(tmp_path, torch)["trained/zero"]
    with torch.inference_mode():
        actual = build_sdxl_conditioning(command, pipeline, runtime)
        expected = oracle().build_reference_conditioning(
            command, pipeline, runtime, namespace="igs_reference_handoff_control"
        )
    oracle().assert_conditioning_matches(actual, expected, torch)
    observed = oracle().observe_native_handoff(
        command, pipeline, actual, expected, runtime, run_sdxl_pipeline
    )
    assert observed["observations"] == 1
    assert observed["generatorStateUnchanged"] is True
    assert observed["methodRestored"] is True
    if pooled:
        wrong = replace(
            actual,
            positive_pooled=actual.negative_pooled,
            negative_pooled=actual.positive_pooled,
        )
        comparison = "Installed positive pooled embedding conditioning differs"
        handoff = "pooled_prompt_embeds is routed incorrectly"
    else:
        wrong = replace(actual, positive=actual.negative, negative=actual.positive)
        comparison = "Installed positive embedding conditioning differs"
        handoff = "prompt_embeds is routed incorrectly"
    with pytest.raises(AssertionError, match=comparison):
        oracle().assert_conditioning_matches(wrong, expected, torch)
    native_call = type(pipeline).__call__
    with pytest.raises(AssertionError, match=handoff):
        oracle().observe_native_handoff(
            command, pipeline, wrong, expected, runtime, run_sdxl_pipeline
        )
    assert type(pipeline).__call__ is native_call


def test_reference_alias_manager_cannot_expand_the_other_signed_resource(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    torch, runtime, make = native
    pipeline = make()
    command = assignments(tmp_path, torch)["trained/zero"]
    with torch.inference_mode():
        actual = build_sdxl_conditioning(command, pipeline, runtime)
        expected = oracle().build_reference_conditioning(
            command, pipeline, runtime, namespace="igs_reference_good_manager"
        )
    oracle().assert_conditioning_matches(actual, expected, torch)

    def wrong_manager(pads: dict[int, list[int]]) -> Any:
        provider = cast(Any, importlib.import_module("compel.embeddings_provider"))
        first, second = pads
        opposites = {first: second, second: first}

        class WrongManager(provider.BaseTextualInversionManager):
            def expand_textual_inversion_token_ids_if_necessary(self, ids: list[int]) -> list[int]:
                result: list[int] = []
                for token in ids:
                    selected = opposites.get(token, token)
                    result.append(selected)
                    result.extend(pads.get(selected, []))
                return result

        return WrongManager()

    monkeypatch.setattr(oracle(), "reference_manager", wrong_manager)
    with pytest.raises(AssertionError, match="Reference expansion did not preserve"):
        oracle().build_reference_conditioning(
            command, pipeline, runtime, namespace="igs_reference_bad_manager"
        )


@pytest.mark.parametrize("field", ["positive", "negative", "positive_pooled", "negative_pooled"])
def test_real_neighbor_matrix_refuses_opposite_branch_drift(
    tmp_path: Path, native: Any, field: str
) -> None:
    torch, runtime, make = native
    pipeline = make()
    with torch.inference_mode():
        values = {
            label: build_sdxl_conditioning(command, pipeline, runtime)
            for label, command in assignments(tmp_path, torch).items()
        }
    oracle().assert_branch_isolation(values, torch)
    target = "trained/zero" if field.startswith("positive") else "zero/trained"
    wrong = {
        **values,
        target: replace(values[target], **{field: getattr(values["zero/zero"], field)}),
    }
    with pytest.raises(AssertionError, match=f"opposite sign changed {field}"):
        oracle().assert_branch_isolation(wrong, torch)


@pytest.mark.parametrize("field", ["positive", "negative", "positive_pooled", "negative_pooled"])
def test_nonfinite_native_tensor_cannot_qualify(tmp_path: Path, native: Any, field: str) -> None:
    torch, runtime, make = native
    pipeline = make()
    command = assignments(tmp_path, torch)["trained/zero"]
    with torch.inference_mode():
        actual = build_sdxl_conditioning(command, pipeline, runtime)
        expected = oracle().build_reference_conditioning(
            command, pipeline, runtime, namespace="igs_reference_finite_control"
        )
    oracle().assert_conditioning_matches(actual, expected, torch)
    nonfinite = getattr(actual, field).clone()
    nonfinite.reshape(-1)[0] = float("nan")
    wrong = replace(actual, **{field: nonfinite})
    with pytest.raises(AssertionError):
        oracle().assert_conditioning_matches(wrong, expected, torch)
    native_call = type(pipeline).__call__
    with pytest.raises(AssertionError):
        oracle().observe_native_handoff(
            command, pipeline, wrong, expected, runtime, run_sdxl_pipeline
        )
    assert type(pipeline).__call__ is native_call
