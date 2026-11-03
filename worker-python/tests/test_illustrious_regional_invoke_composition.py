"""Versioned Invoke Canvas composition contracts; ROOT owns every test execution.

Source: InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd, active webv2
features/generation/core/{graph.ts,canvas/addRegionalGuidance.ts},
workbench/canvas-operations/generationCompositePlan.ts, and backend
app/invocations/{mask.py,sd/denoise_latents.py},
backend/stable_diffusion/diffusion/{conditioning_data,regional_prompt_data}.py.

These tests use the existing native fixture/encoder/processors, never an encoder
override or alternate denoising loop. Literal expected banks and permissions are
separate from the derived plan. The low-alpha and empty-positive cases are
semantic mutation targets; their legacy controls deliberately keep old behavior.
Wire tests use explicit non-native loader/output collaborators only to inspect
dispatch. None of these authored cases is an executed or trained-quality claim.
"""

from __future__ import annotations

import contextlib
import copy
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest

from imagegen_worker import illustrious_regional_denoising as denoising
from imagegen_worker import illustrious_regional_recipe as recipe_owner
from imagegen_worker import illustrious_regional_worker as worker
from imagegen_worker import inference_main
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.illustrious_regional_attention import (
    Alpha8,
    EncodedSegment,
    Everywhere,
    Shape,
    plan_illustrious_attention,
)
from imagegen_worker.illustrious_regional_geometry import ordinary_canvas_coverage_to_latent
from imagegen_worker.inference import MLRuntime
from imagegen_worker.protocol import IllustriousNoiseProfile
from test_illustrious_regional_conditioning import (
    _assert_ranges,  # pyright: ignore[reportPrivateUsage]
    _dense_native_oracle,  # pyright: ignore[reportPrivateUsage]
    _first_attention,  # pyright: ignore[reportPrivateUsage]
    _mask,  # pyright: ignore[reportPrivateUsage]
    _observe,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_denoising import _preserved  # pyright: ignore[reportPrivateUsage]
from test_illustrious_regional_embeddings import (
    _with_resources,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    GRID,
    REGIONS,
    _arguments,  # pyright: ignore[reportPrivateUsage]
    _encode,  # pyright: ignore[reportPrivateUsage]
    _literal_bank,  # pyright: ignore[reportPrivateUsage]
    _literal_masks,  # pyright: ignore[reportPrivateUsage]
    _parameters,  # pyright: ignore[reportPrivateUsage]
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import native as _recipe_native
from test_illustrious_regional_recipe import native_producer as _recipe_native_producer
from test_illustrious_regional_worker import (
    _case,  # pyright: ignore[reportPrivateUsage]
    _seal,  # pyright: ignore[reportPrivateUsage]
)

native = _recipe_native
native_producer = _recipe_native_producer
CPU = "ordinary-canvas-invoke-dualclip-exact-ti-shared-readonly-cpu-v1"
CUDA = "ordinary-canvas-invoke-dualclip-exact-ti-shared-readonly-cuda-fp16-v1"
LEGACY = "ordinary-canvas-static-dualclip-exact-ti-shared-readonly-cpu-v1"
GEOMETRY = "ordinary-canvas-invoke-alpha-positive-nearest8-v1"


def _inputs(**changes: Any) -> tuple[Any, ...]:
    args: dict[str, Any] = {
        "recipe": _with_resources(_recipe(_region())),
        "parameters": _parameters(scheduler="euler"),
        "profile": CPU,
        "layout": "cfg-negative-first",
        "global_negative_coverage": Everywhere(),
        "global_positive_coverage": Everywhere(),
        "negative_pooled_source_id": "current-canvas",
        "positive_pooled_source_id": "current-canvas",
        **changes,
    }
    return recipe_owner._recipe_inputs(**args)  # pyright: ignore[reportPrivateUsage]


@pytest.mark.parametrize("cfg", [1, 0, -1, 30.01, float("inf"), float("nan"), True])
def test_invoke_cfg_boundary_refuses_before_native_work(cfg: Any) -> None:
    with pytest.raises(recipe_owner.IllustriousRegionalRecipeError):
        _inputs(
            parameters=_parameters(cfg_scale=cfg),
            layout="positive-only" if cfg == 1 else "cfg-negative-first",
        )


@pytest.mark.parametrize("cfg", [1.00001, 5, 30])
def test_invoke_cfg_boundary_accepts_explicit_two_signs(cfg: float) -> None:
    assert _inputs(parameters=_parameters(cfg_scale=cfg))[2].cfg_scale == cfg


@pytest.mark.parametrize(
    "changes",
    [
        {"global_negative_coverage": Alpha8(GRID, bytes([255] * 6))},
        {"global_positive_coverage": Alpha8(GRID, bytes([255] * 6))},
        {"negative_pooled_source_id": REGIONS[0]},
        {"positive_pooled_source_id": REGIONS[0]},
        {"layout": "positive-only"},
    ],
)
def test_invoke_cannot_select_private_support_pool_or_layout(changes: dict[str, Any]) -> None:
    with pytest.raises(recipe_owner.IllustriousRegionalRecipeError):
        _inputs(**changes)
    if changes.get("layout") != "positive-only":
        assert _inputs(profile=LEGACY, **changes)


@pytest.mark.parametrize("profile,lane", [(CPU, "cpu"), (CUDA, "cuda-fp16")])
def test_invoke_execution_requires_matching_v2_noise_policy(profile: Any, lane: str) -> None:
    select = cast(Any, denoising._execution_profile)  # pyright: ignore[reportPrivateUsage]
    assert select(f"ordinary-canvas-euler-txt2img-{lane}-v2", profile)[1] is True
    with pytest.raises(denoising.IllustriousRegionalDenoisingError):
        select(f"ordinary-canvas-euler-txt2img-{lane}-v1", profile)
    opposite = "cpu" if lane == "cuda-fp16" else "cuda-fp16"
    with pytest.raises(denoising.IllustriousRegionalDenoisingError):
        select(f"ordinary-canvas-euler-txt2img-{opposite}-v2", profile)


@pytest.mark.parametrize("profile", [GEOMETRY, "ordinary-canvas-origin-nearest8-v1"])
def test_canvas_alpha_before_nearest_odd_grid_and_legacy_control(profile: Any) -> None:
    values = bytes([0, 1, 127, 128, 255] * 3)
    # Off-sample 255 values discriminate nearest from max/area resampling.
    world = bytearray([255] * (40 * 24))
    for y in range(3):
        for x in range(5):
            world[(8 * y) * 40 + 8 * x] = values[y * 5 + x]
    raw = bytes(world)
    bbox = {"x": -13, "y": 5, "width": 40, "height": 24}
    coverage = ordinary_canvas_coverage_to_latent(
        alpha=raw,
        coverage_bounds=cast(Any, dict(bbox)),
        bbox=cast(Any, bbox),
        latent_shape=Shape(3, 5),
        profile=profile,
    )
    assert coverage.samples == (
        bytes([0, 255, 255, 255, 255] * 3) if profile == GEOMETRY else values
    )
    assert raw == bytes(world) and bbox == {"x": -13, "y": 5, "width": 40, "height": 24}


def test_invoke_overlap_ceil_pool_and_sign_padding_keep_independent_ranges() -> None:
    raw = bytes([0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255])
    local = Alpha8(Shape(3, 5), raw)
    plan = plan_illustrious_attention(
        latent_shape=Shape(3, 5),
        negative=(EncodedSegment("global", 77, Everywhere()),),
        positive=(
            EncodedSegment("global", 77, Everywhere()),
            EncodedSegment("left", 77, local),
            EncodedSegment("right", 77, local),
        ),
        profile="alpha8-ge128-ceil2x2-max-v1",
        layout="cfg-negative-first",
    )
    assert plan.key_length == 231
    view = plan.query(factor=1, shape=Shape(3, 5), key_length=231)
    assert tuple(r.binding_id for r in view.allowed_ranges(batch_index=1, query_index=1)) == (
        "global",
        "left",
        "right",
    )
    assert tuple((r.start, r.end) for r in view.allowed_ranges(batch_index=0, query_index=1)) == (
        (0, 77),
    )
    local_levels = cast(Any, plan.positive.segments[1].coverage).levels
    assert [(level.factor, level.shape) for level in local_levels] == [
        (1, Shape(3, 5)),
        (2, Shape(2, 3)),
        (4, Shape(1, 2)),
        (8, Shape(1, 1)),
    ]
    assert [level.samples for level in local_levels] == [
        raw,
        bytes([255, 0, 0, 0, 0, 255]),
        bytes([255, 255]),
        bytes([255]),
    ]


@pytest.mark.parametrize("positive", [None, "", " ", "dog"])
@pytest.mark.parametrize("negative,inherited", [("", False), ("grain", False), ("blur", True)])
def test_native_invoke_signed_participation_preserves_authored_recipe_and_global_pool(
    native: Any, monkeypatch: Any, positive: str | None, negative: str, inherited: bool
) -> None:
    recipe = _with_resources(
        _recipe(_region(positive=positive, negative=negative, inherited=inherited))
    )
    before = copy.deepcopy(recipe)
    global_expected = _encode(native, "cat", "blur")
    local_expected = _encode(native, positive or "", negative)
    positive_streams = (global_expected, local_expected) if positive else (global_expected,)
    negative_streams = (global_expected, local_expected) if negative else (global_expected,)
    keys = max(
        sum(s.positive_length for s in positive_streams),
        sum(s.negative_length for s in negative_streams),
    )
    context = native.torch.cat(
        (
            _literal_bank(native, negative_streams, "negative", keys),
            _literal_bank(native, positive_streams, "positive", keys),
        )
    )
    args = _arguments(native, profile=CPU, parameters=_parameters(scheduler="euler"))
    with _preserved(native), _observe(native, native.pipeline.unet, monkeypatch) as seen:
        result = native.recipe.run_current_canvas_regional_recipe(recipe, **args)
    assert recipe == before and result is seen.results[0]
    plan = seen.plans[0]
    _assert_ranges(
        seen.plans[0],
        "positive",
        (("current-canvas", 0, 77),) + (((REGIONS[0], 77, 154),) if positive else ()),
    )
    _assert_ranges(
        seen.plans[0],
        "negative",
        (("current-canvas", 0, 77),) + (((REGIONS[0], 77, 154),) if negative else ()),
    )
    assert native.torch.equal(seen.contexts[0], context)
    masks = _literal_masks(
        native,
        negative_lengths=tuple(s.negative_length for s in negative_streams),
        positive_lengths=tuple(s.positive_length for s in positive_streams),
        visibility=((True, False, True, True, True, True),),
    )
    assert native.torch.equal(_mask(native, seen.masks[0], 2, 6, keys), masks)
    pools = seen.root_inputs[0]["added_cond_kwargs"]["text_embeds"]
    assert native.torch.equal(
        pools, native.torch.cat((global_expected.negative_pooled, global_expected.positive_pooled))
    )
    oracle = _dense_native_oracle(
        native, _first_attention(native, native.pipeline.unet), seen.queries[0], context, masks
    )
    assert native.torch.allclose(seen.outputs[0], oracle, atol=2e-6, rtol=2e-6)
    assert plan.batch_signs == ("negative", "positive")


def test_native_empty_local_signs_do_not_spend_emitted_row_budget(
    native: Any, monkeypatch: Any
) -> None:
    # The pinned tiny tokenizer emits three tokens per occurrence; keep raw input below 300.
    positive = "cat " * 60
    recipe = _with_resources(
        _recipe(
            *(_region(index, positive="", negative="") for index in range(3)), positive=positive
        )
    )
    expected = _encode(native, positive, "blur")
    assert expected.positive_length == 231
    args = _arguments(
        native, profile=CPU, parameters=_parameters(positive=positive, scheduler="euler")
    )
    with _preserved(native), _observe(native, native.pipeline.unet, monkeypatch) as seen:
        native.recipe.run_current_canvas_regional_recipe(recipe, **args)
    assert seen.plans[0].positive.length == 231 and seen.plans[0].negative.length == 77
    assert native.torch.equal(seen.contexts[0][1:2], expected.positive[:, :231])
    with _preserved(native), pytest.raises(recipe_owner.IllustriousRegionalRecipeError) as error:
        native.recipe.run_current_canvas_regional_recipe(recipe, **{**args, "profile": LEGACY})
    assert error.value.code == "LIMIT"


@pytest.mark.parametrize("authored", [False, True])
def test_native_empty_global_streams_remain_without_local_empty_contributions(
    native: Any, monkeypatch: Any, authored: bool
) -> None:
    region = _region(positive=None, negative="", inherited=True)
    if not authored:
        region.pop("authoredPrompts")
    recipe = _with_resources(_recipe(region, positive="", negative=""))
    before = copy.deepcopy(recipe)
    args = _arguments(
        native, profile=CPU, parameters=_parameters(positive="", negative="", scheduler="euler")
    )
    with _preserved(native), _observe(native, native.pipeline.unet, monkeypatch) as seen:
        native.recipe.run_current_canvas_regional_recipe(recipe, **args)
    assert recipe == before
    for sign in ("negative", "positive"):
        _assert_ranges(seen.plans[0], sign, (("current-canvas", 0, 77),))
    assert seen.contexts[0].shape == (2, 77, 2048)
    assert native.torch.count_nonzero(seen.contexts[0]) == 0


def test_native_invoke_profile_uses_existing_v2_euler_and_vae_owner(native: Any) -> None:
    recipe = _with_resources(_recipe(_region(positive="dog", negative="")))
    before = copy.deepcopy(recipe)
    args = _arguments(
        native,
        profile=CPU,
        parameters=_parameters(
            scheduler="euler",
            steps=1,
            noise_profile=IllustriousNoiseProfile(
                schema_version=1,
                base_schedule="sdxl-scaled-linear-v1",
                rescale_betas_zero_snr=False,
                timestep_spacing="leading",
            ),
        ),
    )
    for key in ("sample", "timestep", "time_ids"):
        args.pop(key)
    with _preserved(native):
        result = denoising.run_current_canvas_regional_denoising(
            recipe, **args, denoising_profile="ordinary-canvas-euler-txt2img-cpu-v2"
        )
    assert recipe == before
    assert result.images.shape == (1, 3, 16, 24)
    assert native.torch.isfinite(result.images).all()


def test_native_legacy_empty_stream_and_raw_alpha_control(native: Any, monkeypatch: Any) -> None:
    recipe = _with_resources(_recipe(_region(positive="", negative="")))
    args = _arguments(native, profile=LEGACY)
    with _preserved(native), _observe(native, native.pipeline.unet, monkeypatch) as seen:
        native.recipe.run_current_canvas_regional_recipe(recipe, **args)
    _assert_ranges(seen.plans[0], "positive", (("current-canvas", 0, 77), (REGIONS[0], 77, 154)))
    _assert_ranges(seen.plans[0], "negative", (("current-canvas", 0, 77), (REGIONS[0], 77, 154)))
    expected = _literal_masks(native, negative_lengths=(77, 77), positive_lengths=(77, 77))
    assert native.torch.equal(_mask(native, seen.masks[0], 2, 6, 154), expected)
    assert (
        _inputs(profile=LEGACY, layout="positive-only", parameters=_parameters(cfg_scale=1))[
            2
        ].cfg_scale
        == 1
    )


@pytest.mark.parametrize("marker", [None, "invoke-canvas-v1"])
def test_owned_bundle_marker_is_explicit_and_preserves_recipe(
    tmp_path: Path, marker: str | None
) -> None:
    case = _case(tmp_path)
    if marker is not None:
        case.bundle["compositionProfile"] = marker
        _seal(case)
    expected_alpha = case.alpha.read_bytes()
    parsed = worker.parse_regional_request(case.wire)
    assert parsed.composition_profile == marker
    assert parsed.recipe["regions"][0]["coverage"]["alpha"] == expected_alpha
    assert (
        parsed.recipe["regions"][0]["authoredPrompts"]
        == case.bundle["recipe"]["regions"][0]["authoredPrompts"]
    )


@pytest.mark.parametrize("marker", [None, "", "invoke-canvas-v2", 1, False, {}])
def test_owned_bundle_rejects_unknown_or_null_explicit_profile(tmp_path: Path, marker: Any) -> None:
    case = _case(tmp_path)
    case.bundle["compositionProfile"] = marker
    _seal(case)
    with pytest.raises(DerivativeError):
        worker.parse_regional_request(case.wire)


def test_owned_bundle_rejects_extra_composition_fields(tmp_path: Path) -> None:
    case = _case(tmp_path)
    case.bundle.update(compositionProfile="invoke-canvas-v1", composition={"alpha": "soft"})
    _seal(case)
    with pytest.raises(DerivativeError):
        worker.parse_regional_request(case.wire)


@pytest.mark.parametrize("marker", [None, "invoke-canvas-v1"])
def test_worker_dispatch_selects_profile_only_from_owned_marker(
    tmp_path: Path, monkeypatch: Any, marker: str | None
) -> None:
    case = _case(tmp_path)
    if marker is not None:
        case.bundle["compositionProfile"] = marker
        _seal(case)
    component = SimpleNamespace(eval=lambda: None)
    pipeline = SimpleNamespace(
        text_encoder=component, text_encoder_2=component, unet=component, vae=component
    )
    runtime = cast(
        MLRuntime, SimpleNamespace(torch=SimpleNamespace(no_grad=contextlib.nullcontext))
    )
    observed: list[Any] = []

    def load(*args: Any, **kwargs: Any) -> tuple[Any, None]:
        return pipeline, None

    def output(recipe: Any, **kwargs: Any) -> dict[str, object]:
        observed.append(kwargs)
        return {"type": "generation-done"}

    monkeypatch.setattr(worker, "load_illustrious_pipeline", load)

    def hooks(*args: Any) -> None:
        return None

    def bindings(*args: Any) -> tuple[()]:
        return ()

    monkeypatch.setattr(worker, "install_capture_hooks", hooks)
    monkeypatch.setattr(worker, "qualify_bindings", bindings)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_txt2img", output)
    assert worker.execute_regional_request(case.wire, config_dir=tmp_path, runtime=runtime) == {
        "type": "generation-done"
    }
    assert len(observed) == 1
    assert observed[0]["profile"] == (
        CUDA if marker else "ordinary-canvas-static-dualclip-exact-ti-shared-readonly-cuda-fp16-v1"
    )
    assert observed[0]["denoising_profile"] == "ordinary-canvas-euler-txt2img-cuda-fp16-v2"
    capabilities = cast(list[str], inference_main.inference_ready_message()["capabilities"])
    assert "illustrious-regional-invoke-v1" in capabilities
    assert "private-current-canvas-regional-v1" in capabilities
