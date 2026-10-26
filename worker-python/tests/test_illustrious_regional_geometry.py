"""Authored private ordinary-Canvas geometry contract; execution belongs to root.

Numerical expectations are literal source pixels, not another resize algorithm.
Native tests reuse the neighboring random, production-width CLIPs/UNet, actual
Compel encoding, owned converter, bridge and original native attention. They do
not replace encoded tensors, attention mathematics or returned native outputs.
No trained weights, downloads, artifact directories or TS protocol are needed.

Root's isolated center-phase mutation changes (8*y, 8*x) to (8*y+4, 8*x+4).
Named RED: test_origin_phase_mutation_red, with distinct origin/center markers.
Named GREEN: test_constant_cell_phase_control_green, constant inside each cell.
Both execute the actual geometry helper and bridge, including native permission
and output oracles. The raw-alpha test separately catches premature thresholding.
Optional native dependencies may skip; qualification requires zero native skips.
This file's authorship/AST/lint checks establish no runtime or public readiness.
"""

from __future__ import annotations

import dataclasses
import inspect
import subprocess
import sys
import textwrap
import tracemalloc
from collections import UserDict
from enum import StrEnum
from pathlib import Path
from types import MappingProxyType
from typing import TYPE_CHECKING, Any, cast

import pytest

from imagegen_worker import illustrious_regional_geometry as geometry
from imagegen_worker.illustrious_regional_attention import (
    Alpha8,
    EncodedSegment,
    Everywhere,
    Shape,
    plan_illustrious_attention,
)
from imagegen_worker.inference import build_sdxl_conditioning
from test_illustrious_regional_attention_adapter import (
    _assert_restored,  # pyright: ignore[reportPrivateUsage]
    _snapshot,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_conditioning import (
    _arguments,  # pyright: ignore[reportPrivateUsage]
    _assert_state,  # pyright: ignore[reportPrivateUsage]
    _bindings,  # pyright: ignore[reportPrivateUsage]
    _command,  # pyright: ignore[reportPrivateUsage]
    _first_attention,  # pyright: ignore[reportPrivateUsage]
    _literal_context,  # pyright: ignore[reportPrivateUsage]
    _mask,  # pyright: ignore[reportPrivateUsage]
    _observe,  # pyright: ignore[reportPrivateUsage]
    _slots,  # pyright: ignore[reportPrivateUsage]
    _state,  # pyright: ignore[reportPrivateUsage]
    _transformer,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_conditioning import native as native

if TYPE_CHECKING:
    from imagegen_worker.compositor import PreviewRect

PROFILE = "ordinary-canvas-origin-nearest8-v1"
ATTENTION_PROFILE = "alpha8-ge128-ceil2x2-max-v1"
WORLD_QUERIES = (
    (-13, 19),
    (-5, 19),
    (3, 19),
    (11, 19),
    (19, 19),
    (-13, 27),
    (-5, 27),
    (3, 27),
    (11, 27),
    (19, 27),
    (-13, 35),
    (-5, 35),
    (3, 35),
    (11, 35),
    (19, 35),
)
NEGATIVE_RAW = (255, 0, 127, 128, 0, 0, 255, 0, 0, 128, 0, 0, 255, 0, 0)
POSITIVE_RAW = (0, 255, 128, 0, 127, 255, 0, 0, 128, 0, 0, 255, 0, 0, 255)
# Literal world support at the ORIGINAL pixel in each cell. None is calculated
# from geometry output, an attention plan, or the production sampling expression.
NEGATIVE_WORLD = {(-13, 19), (11, 19), (-5, 27), (19, 27), (3, 35)}
POSITIVE_WORLD = {(-5, 19), (3, 19), (-13, 27), (11, 27), (-5, 35), (19, 35)}


class _IntSubclass(int):
    pass


class _BytesSubclass(bytes):
    pass


class _StrSubclass(str):
    pass


class _DictSubclass(dict[str, int]):
    pass


class _ShapeSubclass(Shape):
    pass


class _ProfileEnum(StrEnum):
    SUPPORTED = PROFILE


def _rect(width: int = 40, height: int = 24, *, x: int = -13, y: int = 19) -> PreviewRect:
    return {"x": x, "y": y, "width": width, "height": height}


def _valid_arguments() -> dict[str, Any]:
    return {
        "alpha": bytes(960),
        "coverage_bounds": _rect(),
        "bbox": _rect(),
        "latent_shape": Shape(3, 5),
        "profile": PROFILE,
    }


def _sample(alpha: bytes, bounds: PreviewRect) -> Alpha8:
    return geometry.ordinary_canvas_coverage_to_latent(
        alpha=alpha,
        coverage_bounds=bounds,
        bbox=cast("PreviewRect", dict(bounds)),
        latent_shape=Shape(bounds["height"] // 8, bounds["width"] // 8),
        profile=PROFILE,
    )


def _world_pixels(markers: tuple[tuple[int, int, int], ...]) -> bytes:
    """Construct source pixels at literal world positions; never downsample."""
    raster = bytearray(960)
    for x, y, value in markers:
        assert -13 <= x < 27 and 19 <= y < 43
        raster[(y - 19) * 40 + x + 13] = value
    return bytes(raster)


def _cell_pixels(values: tuple[int, ...], *, constant_cells: bool) -> bytes:
    """Input fixture with independent world origins and phase canaries."""
    markers: list[tuple[int, int, int]] = []
    for (world_x, world_y), value in zip(WORLD_QUERIES, values, strict=True):
        if constant_cells:
            markers.extend(
                (world_x + dx, world_y + dy, value) for dy in range(8) for dx in range(8)
            )
        else:
            markers.append((world_x, world_y, value))
            # Opposite native permission at the CENTER exposes phase changes.
            markers.append((world_x + 4, world_y + 4, 255 if value < 128 else 0))
    return _world_pixels(tuple(markers))


def test_explicit_keyword_only_profile_and_local_error_surface() -> None:
    target = geometry.ordinary_canvas_coverage_to_latent
    signature = inspect.signature(target)
    assert tuple(signature.parameters) == (
        "alpha",
        "coverage_bounds",
        "bbox",
        "latent_shape",
        "profile",
    )
    for parameter in signature.parameters.values():
        assert parameter.kind is inspect.Parameter.KEYWORD_ONLY
        assert parameter.default is inspect.Parameter.empty
    assert not inspect.iscoroutinefunction(target)
    assert issubclass(geometry.IllustriousRegionalGeometryError, ValueError)
    assert geometry.IllustriousRegionalGeometryError.__module__ == geometry.__name__
    args = _valid_arguments()
    del args["profile"]
    with pytest.raises(TypeError, match="profile"):
        target(**args)


def test_literal_rectangular_raw_alpha_keeps_127_128_and_rejects_other_phases() -> None:
    alpha = _world_pixels(
        (
            (-13, 19, 0),
            (-5, 19, 1),
            (3, 19, 63),
            (11, 19, 127),
            (19, 19, 128),
            (-13, 27, 129),
            (-5, 27, 200),
            (3, 27, 254),
            (11, 27, 255),
            (19, 27, 17),
            (-13, 35, 3),
            (-5, 35, 9),
            (3, 35, 31),
            (11, 35, 65),
            (19, 35, 99),
            (-9, 23, 250),
            (-1, 23, 249),
            (7, 23, 248),
            (15, 23, 247),
            (23, 23, 246),
            (-6, 19, 245),
            (-13, 26, 244),
            (26, 42, 243),
        )
    )
    output = _sample(alpha, _rect())
    assert type(output) is Alpha8
    assert type(output.shape) is Shape and output.shape == Shape(3, 5)
    assert type(output.samples) is bytes
    assert output.samples == bytes((0, 1, 63, 127, 128, 129, 200, 254, 255, 17, 3, 9, 31, 65, 99))


@pytest.mark.parametrize(
    "x,y",
    [
        (-13, 19),
        (13, -19),
        (-1, -7),
        (5, 3),
        (0, 0),
        (-2_147_483_647, -2_147_483_647),
        (2_147_483_647, 2_147_483_647),
    ],
)
def test_world_translation_invariance_and_origin_only_coordinate_limit(x: int, y: int) -> None:
    alpha = _world_pixels(((-13, 19, 127), (19, 35, 128), (-9, 23, 255)))
    result = _sample(alpha, _rect(x=x, y=y))
    # In particular, x+width and y+height may exceed the origin cap.
    assert result.samples == bytes((127, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128))


@pytest.mark.parametrize("width,height", [(8, 8), (8, 2048), (2048, 8), (2000, 2000)])
def test_minimum_skinny_tall_wide_and_exact_four_million_area(width: int, height: int) -> None:
    raster = bytearray(width * height)
    raster[0] = 17
    raster[(height - 8) * width + width - 8] = 239
    output = _sample(bytes(raster), _rect(width, height))
    expected = bytearray((height // 8) * (width // 8))
    expected[0] = 17
    expected[-1] = 239
    assert output.shape == Shape(height // 8, width // 8)
    assert output.samples == bytes(expected)
    assert len(output.samples) <= 62_500


def _assert_refused_before_output(args: dict[str, Any], code: str, monkeypatch: Any) -> None:
    hits: list[str] = []

    def scratch(*_args: Any, **_kwargs: Any) -> Any:
        hits.append("bytearray")
        raise AssertionError("Output scratch allocated before complete validation.")

    def output(*_args: Any, **_kwargs: Any) -> Any:
        hits.append("Alpha8")
        raise AssertionError("Output constructed before complete validation.")

    with monkeypatch.context() as patch:
        # Allocation tripwires only; no geometry validation/sampling is replaced.
        patch.setattr(geometry, "bytearray", scratch, raising=False)
        patch.setattr(geometry, "Alpha8", output)
        with pytest.raises(geometry.IllustriousRegionalGeometryError) as caught:
            geometry.ordinary_canvas_coverage_to_latent(**args)
    assert type(caught.value) is geometry.IllustriousRegionalGeometryError
    assert caught.value.code == code
    assert hits == []


@pytest.mark.parametrize("owner", ["coverage_bounds", "bbox"])
@pytest.mark.parametrize(
    "kind",
    [
        "none",
        "list",
        "tuple",
        "proxy",
        "user-dict",
        "subclass",
        "missing",
        "extra",
        "renamed",
        "str-key-subclass",
    ],
)
def test_both_rectangle_containers_and_exact_key_sets_refuse_before_output(
    monkeypatch: Any, owner: str, kind: str
) -> None:
    valid = _rect()
    candidates: dict[str, Any] = {
        "none": None,
        "list": list(valid.items()),
        "tuple": tuple(valid.items()),
        "proxy": MappingProxyType(valid),
        "user-dict": UserDict(valid),
        "subclass": _DictSubclass(cast(Any, valid)),
        "missing": {"x": -13, "y": 19, "width": 40},
        "extra": {**valid, "opacity": 1},
        "renamed": {"x": -13, "y": 19, "width": 40, "h": 24},
        "str-key-subclass": {_StrSubclass("x"): -13, "y": 19, "width": 40, "height": 24},
    }
    args = _valid_arguments()
    args[owner] = candidates[kind]
    _assert_refused_before_output(args, "INPUT_INVALID", monkeypatch)


@pytest.mark.parametrize("owner", ["coverage_bounds", "bbox"])
@pytest.mark.parametrize("field", ["x", "y", "width", "height"])
@pytest.mark.parametrize("value", [True, False, None, "8", 8.0, float("nan"), _IntSubclass(8)])
def test_each_rectangle_field_requires_exact_ints(
    monkeypatch: Any, owner: str, field: str, value: Any
) -> None:
    args = _valid_arguments()
    args[owner][field] = value
    _assert_refused_before_output(args, "INPUT_INVALID", monkeypatch)


@pytest.mark.parametrize("owner", ["coverage_bounds", "bbox"])
@pytest.mark.parametrize("field", ["x", "y", "width", "height"])
@pytest.mark.parametrize("kind", ["float-equal", "int-subclass-equal"])
def test_rectangle_strict_types_are_not_hidden_by_numeric_equality_or_mismatch(
    monkeypatch: Any, owner: str, field: str, kind: str
) -> None:
    args = _valid_arguments()
    value = args[owner][field]
    args[owner][field] = float(value) if kind == "float-equal" else _IntSubclass(value)
    assert args["coverage_bounds"] == args["bbox"]
    _assert_refused_before_output(args, "INPUT_INVALID", monkeypatch)


@pytest.mark.parametrize("owner", ["coverage_bounds", "bbox"])
@pytest.mark.parametrize("field", ["x", "y"])
@pytest.mark.parametrize("value", [False, True])
def test_bool_origin_equal_to_valid_zero_or_one_is_still_invalid(
    monkeypatch: Any, owner: str, field: str, value: bool
) -> None:
    args = _valid_arguments()
    args["coverage_bounds"][field] = int(value)
    args["bbox"][field] = int(value)
    args[owner][field] = value
    assert args["coverage_bounds"] == args["bbox"]
    _assert_refused_before_output(args, "INPUT_INVALID", monkeypatch)


@pytest.mark.parametrize("owner", ["coverage_bounds", "bbox"])
@pytest.mark.parametrize("field", ["width", "height"])
@pytest.mark.parametrize(
    "value,code",
    [
        (-8, "INPUT_INVALID"),
        (0, "INPUT_INVALID"),
        (1, "INPUT_INVALID"),
        (7, "INPUT_INVALID"),
        (9, "INPUT_INVALID"),
        (15, "INPUT_INVALID"),
        (2047, "INPUT_INVALID"),
        (2049, "LIMIT"),
        (2056, "LIMIT"),
        (2**100, "LIMIT"),
    ],
)
def test_side_grid_and_limit_diagnostics_are_independent_for_each_rectangle(
    monkeypatch: Any, owner: str, field: str, value: int, code: str
) -> None:
    args = _valid_arguments()
    args[owner][field] = value
    _assert_refused_before_output(args, code, monkeypatch)


@pytest.mark.parametrize("owner", ["coverage_bounds", "bbox"])
@pytest.mark.parametrize("field", ["x", "y"])
@pytest.mark.parametrize("value", [-2_147_483_648, 2_147_483_648, -(2**100), 2**100])
def test_origin_excess_is_limit_before_output_or_rectangle_equality(
    monkeypatch: Any, owner: str, field: str, value: int
) -> None:
    args = _valid_arguments()
    args[owner][field] = value
    _assert_refused_before_output(args, "LIMIT", monkeypatch)


@pytest.mark.parametrize("owner", ["coverage_bounds", "bbox"])
def test_2048_square_is_area_limit_even_when_other_rectangle_is_small(
    monkeypatch: Any, owner: str
) -> None:
    args = _valid_arguments()
    args[owner] = _rect(2048, 2048)
    _assert_refused_before_output(args, "LIMIT", monkeypatch)


@pytest.mark.parametrize("width,height", [(2048, 2048), (2008, 2000), (2000, 2008)])
def test_area_limit_precedes_alpha_length_and_output(
    monkeypatch: Any, width: int, height: int
) -> None:
    args = _valid_arguments()
    args.update(coverage_bounds=_rect(width, height), bbox=_rect(width, height), alpha=b"")
    _assert_refused_before_output(args, "LIMIT", monkeypatch)


@pytest.mark.parametrize("field,value", [("x", -12), ("y", 20), ("width", 48), ("height", 32)])
def test_each_independently_valid_but_mismatched_rectangle_field_refuses(
    monkeypatch: Any, field: str, value: int
) -> None:
    args = _valid_arguments()
    args["bbox"][field] = value
    _assert_refused_before_output(args, "INPUT_INVALID", monkeypatch)


def test_equal_area_rectangular_bounds_transpose_is_not_equal_geometry(monkeypatch: Any) -> None:
    args = _valid_arguments()
    args["bbox"] = _rect(24, 40)
    _assert_refused_before_output(args, "INPUT_INVALID", monkeypatch)


@pytest.mark.parametrize(
    "shape",
    [
        None,
        (3, 5),
        {"height": 3, "width": 5},
        _ShapeSubclass(3, 5),
        Shape(5, 3),
        Shape(3, 4),
        Shape(0, 5),
        Shape(-3, 5),
        Shape(True, 5),
        Shape(3, True),
        Shape(cast(Any, 3.0), 5),
        Shape(3, cast(Any, 5.0)),
        Shape(_IntSubclass(3), 5),
        Shape(3, _IntSubclass(5)),
    ],
)
def test_strict_latent_shape_including_equal_area_transpose_refuses_before_output(
    monkeypatch: Any, shape: Any
) -> None:
    args = _valid_arguments()
    args["latent_shape"] = shape
    _assert_refused_before_output(args, "INPUT_INVALID", monkeypatch)


@pytest.mark.parametrize(
    "shape",
    [Shape(True, 1), Shape(1, True), Shape(cast(Any, 1.0), 1), Shape(1, cast(Any, 1.0))],
)
def test_shape_values_equal_to_one_still_forbid_bool_and_float(
    monkeypatch: Any, shape: Shape
) -> None:
    args = _valid_arguments()
    args.update(alpha=bytes(64), coverage_bounds=_rect(8, 8), bbox=_rect(8, 8), latent_shape=shape)
    _assert_refused_before_output(args, "INPUT_INVALID", monkeypatch)


@pytest.mark.parametrize(
    "alpha",
    [
        None,
        "0" * 960,
        [],
        tuple([0] * 960),
        bytearray(960),
        memoryview(bytes(960)),
        _BytesSubclass(bytes(960)),
        b"",
        bytes(959),
        bytes(961),
    ],
)
def test_exact_immutable_alpha_bytes_and_length_refuse_before_output(
    monkeypatch: Any, alpha: Any
) -> None:
    args = _valid_arguments()
    args["alpha"] = alpha
    _assert_refused_before_output(args, "INPUT_INVALID", monkeypatch)


@pytest.mark.parametrize(
    "profile",
    [
        None,
        True,
        1,
        b"ordinary-canvas-origin-nearest8-v1",
        "",
        "nearest",
        "Everywhere",
        "alpha8-ge128-ceil2x2-max-v1",
        PROFILE + " ",
        _StrSubclass(PROFILE),
        _ProfileEnum.SUPPORTED,
    ],
)
def test_explicit_exact_profile_including_malformed_last_argument_precedes_output(
    monkeypatch: Any, profile: Any
) -> None:
    args = _valid_arguments()
    args["profile"] = profile
    _assert_refused_before_output(args, "PROFILE_INVALID", monkeypatch)


def test_output_is_detached_immutable_and_rectangle_metadata_is_not_retained() -> None:
    bounds, bbox = _rect(), _rect()
    alpha = _world_pixels(((-13, 19, 127), (19, 35, 128)))
    original_alpha = alpha
    original_bounds, original_bbox = dict(bounds), dict(bbox)
    result = geometry.ordinary_canvas_coverage_to_latent(
        alpha=alpha, coverage_bounds=bounds, bbox=bbox, latent_shape=Shape(3, 5), profile=PROFILE
    )
    assert bounds == original_bounds and bbox == original_bbox
    assert alpha is original_alpha
    assert result.samples is not alpha
    expected = bytes((127, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128))
    assert result.samples == expected
    # Mutation is AFTER the synchronous call; concurrent mutation is unsupported.
    bounds.update(x=100, y=-100, width=8, height=8)
    cast(Any, bbox).clear()
    assert result.shape == Shape(3, 5) and result.samples == expected
    with pytest.raises(dataclasses.FrozenInstanceError):
        cast(Any, result).samples = b"changed"
    with pytest.raises(dataclasses.FrozenInstanceError):
        cast(Any, result.shape).height = 99
    with pytest.raises(TypeError):
        cast(Any, result.samples)[0] = 255
    with pytest.raises(TypeError):
        memoryview(result.samples)[0] = 255
    second = _sample(_world_pixels(((-13, 19, 255),)), _rect())
    assert second is not result and second.samples is not result.samples
    assert second.samples == bytes((255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0))
    assert result.samples == expected


@pytest.mark.parametrize("kind", ["zero", "covered-but-unsampled", "subthreshold", "full"])
def test_zero_empty_like_and_full_coverage_remain_alpha_never_global(kind: str) -> None:
    alpha = {
        "zero": bytes(960),
        "covered-but-unsampled": _world_pixels(((-12, 20, 255), (26, 42, 255))),
        "subthreshold": _world_pixels(((-13, 19, 127),)),
        "full": bytes([255]) * 960,
    }[kind]
    sampled = _sample(alpha, _rect())
    assert type(sampled) is Alpha8 and not isinstance(sampled, Everywhere)
    expected = {
        "zero": bytes(15),
        "covered-but-unsampled": bytes(15),
        "subthreshold": bytes((127, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)),
        "full": bytes([255]) * 15,
    }[kind]
    assert sampled.samples == expected
    plan = plan_illustrious_attention(
        latent_shape=Shape(3, 5),
        negative=(EncodedSegment("negative", 1, Everywhere()),),
        positive=(EncodedSegment("regional", 1, sampled),),
        profile=ATTENTION_PROFILE,
        layout="positive-only",
    )
    for factor, grid, queries in [
        (1, Shape(3, 5), 15),
        (2, Shape(2, 3), 6),
        (4, Shape(1, 2), 2),
        (8, Shape(1, 1), 1),
    ]:
        view = plan.query(factor=factor, shape=grid, key_length=1)
        for query in range(queries):
            spans = view.allowed_ranges(batch_index=0, query_index=query)
            assert tuple((span.start, span.end) for span in spans) == (
                ((0, 1),) if kind == "full" else ()
            )
    # Recipe kind/provenance and Main aggregate budgets are separate owners.


def test_maximum_owned_payload_is_one_62500_output_and_at_most_one_scratch(
    monkeypatch: Any,
) -> None:
    args = _valid_arguments()
    args.update(
        alpha=bytes([127]) * 4_000_000,
        coverage_bounds=_rect(2000, 2000),
        bbox=_rect(2000, 2000),
        latent_shape=Shape(250, 250),
    )
    scratch_sizes: list[int] = []

    def observe_scratch(*values: Any, **fields: Any) -> bytearray:
        scratch = bytearray(*values, **fields)
        scratch_sizes.append(len(scratch))
        return scratch

    was_tracing = tracemalloc.is_tracing()
    with monkeypatch.context() as patch:
        patch.setattr(geometry, "bytearray", observe_scratch, raising=False)
        if not was_tracing:
            tracemalloc.start()
        before, _ = tracemalloc.get_traced_memory()
        tracemalloc.reset_peak()
        try:
            result = geometry.ordinary_canvas_coverage_to_latent(**args)
            _current, peak = tracemalloc.get_traced_memory()
        finally:
            if not was_tracing:
                tracemalloc.stop()
    assert len(result.samples) == 62_500 and result.samples == bytes([127]) * 62_500
    assert len(scratch_sizes) <= 1 and sum(scratch_sizes) <= 62_500
    # Logical payload cap is exact above; allow small Python metadata overhead
    # here, while detecting an extra plane or a full-size list/source copy.
    assert peak - before <= 125_000 + 16_384


@pytest.mark.parametrize("invalid", ["profile", "latent_shape", "alpha"])
def test_maximum_plane_refusal_has_no_hidden_bytes_allocation(invalid: str) -> None:
    # No allocator is replaced here: an eager immutable plane/source copy is
    # visible even if it bypasses the bytearray/Alpha8 allocation tripwires.
    args = _valid_arguments()
    args.update(
        alpha=bytes(4_000_000),
        coverage_bounds=_rect(2000, 2000),
        bbox=_rect(2000, 2000),
        latent_shape=Shape(250, 250),
    )
    args[invalid] = {"profile": "unsupported", "latent_shape": Shape(1, 1), "alpha": b""}[invalid]
    code = "PROFILE_INVALID" if invalid == "profile" else "INPUT_INVALID"
    caught = pytest.raises(geometry.IllustriousRegionalGeometryError)
    was_tracing = tracemalloc.is_tracing()
    if not was_tracing:
        tracemalloc.start()
    before, _ = tracemalloc.get_traced_memory()
    tracemalloc.reset_peak()
    try:
        with caught as captured:
            geometry.ordinary_canvas_coverage_to_latent(**args)
        _current, peak = tracemalloc.get_traced_memory()
    finally:
        if not was_tracing:
            tracemalloc.stop()
    assert captured.value.code == code
    assert peak - before < 16_384, "Refusal allocated a 62,500-byte output plane."


def test_helper_import_and_actual_sampling_in_isolated_no_site_stdlib_python() -> None:
    source_root = Path(__file__).resolve().parents[1] / "src"
    script = textwrap.dedent(
        """
        import builtins
        import dataclasses
        import importlib.util
        from pathlib import Path
        import sys

        assert sys.flags.isolated == 1 and sys.flags.no_site == 1
        assert sys.dont_write_bytecode and "site" not in sys.modules
        assert not any("site-packages" in p or "dist-packages" in p for p in sys.path)
        source = Path(sys.argv[1]).resolve(strict=True)
        sys.path.insert(0, str(source))
        allowed_worker = {
            "imagegen_worker", "imagegen_worker.illustrious_regional_attention",
            "imagegen_worker.illustrious_regional_geometry",
        }
        denied = []

        def check_name(name):
            root = name.partition(".")[0]
            allowed = (
                name in allowed_worker if root == "imagegen_worker"
                else root in sys.stdlib_module_names or root in sys.builtin_module_names
            )
            if not allowed:
                denied.append(name)
                raise ImportError("Forbidden numerical-helper dependency: " + name)

        original_import = builtins.__import__

        def guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
            resolved = name
            if level:
                resolved = importlib.util.resolve_name(
                    "." * level + name, (globals or {}).get("__package__", "")
                )
            check_name(resolved)
            if resolved == "imagegen_worker":
                for member in fromlist or ():
                    if member not in ("WORKER_VERSION", "PROTOCOL_VERSION", "RUNTIME_PROFILE"):
                        check_name(resolved + "." + member)
            return original_import(name, globals, locals, fromlist, level)

        class ImportGuard:
            def find_spec(self, fullname, path=None, target=None):
                check_name(fullname)
                return None

        sys.meta_path.insert(0, ImportGuard())
        builtins.__import__ = guarded_import
        controls = (
            "PIL", "PIL.ImageCms", "torch", "numpy", "diffusers", "transformers", "compel",
            "imagegen_worker.compositor", "imagegen_worker.derivatives",
            "imagegen_worker.inference", "imagegen_worker.protocol",
        )
        for name in controls:
            try:
                guarded_import(name)
            except ImportError:
                pass
            else:
                raise AssertionError("Forbidden dependency control was accepted.")
        assert tuple(denied) == controls
        denied.clear()

        import imagegen_worker.illustrious_regional_geometry as target
        from imagegen_worker.illustrious_regional_attention import Alpha8, Shape

        assert Path(target.__file__).resolve() == (
            source / "imagegen_worker" / "illustrious_regional_geometry.py"
        )
        alpha = bytearray(960)
        alpha[0] = 127
        alpha[8] = 128
        alpha[320] = 17
        alpha[672] = 239
        rect = {"x": -13, "y": 19, "width": 40, "height": 24}
        result = target.ordinary_canvas_coverage_to_latent(
            alpha=bytes(alpha), coverage_bounds=rect, bbox=dict(rect),
            latent_shape=Shape(3, 5), profile="ordinary-canvas-origin-nearest8-v1",
        )
        assert type(result) is Alpha8 and result.shape == Shape(3, 5)
        assert result.samples == bytes((127, 128, 0, 0, 0, 17, 0, 0, 0, 0, 0, 0, 0, 0, 239))
        assert denied == []
        assert {
            name for name in sys.modules
            if name == "imagegen_worker" or name.startswith("imagegen_worker.")
        } == allowed_worker
        forbidden = {"PIL", "torch", "numpy", "diffusers", "transformers", "compel", "pytest"}
        assert not any(name.partition(".")[0] in forbidden for name in sys.modules)
        assert "site" not in sys.modules
        print("STDLIB_GEOMETRY_OK")
        """
    )
    completed = subprocess.run(
        [sys.executable, "-I", "-S", "-B", "-c", script, str(source_root)],
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    assert completed.returncode == 0, completed.stderr[:2000]
    assert completed.stdout == "STDLIB_GEOMETRY_OK\n" and completed.stderr == ""


def _encoded(native: Any, positive: str, negative: str) -> Any:
    command = dataclasses.replace(_command(positive, negative), width=40, height=24, bbox=_rect())
    return build_sdxl_conditioning(command, native.pipeline, native.runtime)


def _native_pairs(native: Any, *, constant_cells: bool) -> tuple[Any, Any, Any]:
    global_source = _encoded(native, "portrait", "blur")
    regional_source = _encoded(native, " ".join(["cat"] * 26), "noise")
    assert global_source.positive_length == global_source.negative_length == 77
    assert regional_source.positive_length == 154 and regional_source.negative_length == 77
    global_pair = native.bridge.encoded_bindings_from_sdxl_conditioning(
        "global", global_source, negative_coverage=Everywhere(), positive_coverage=Everywhere()
    )
    negative = _sample(_cell_pixels(NEGATIVE_RAW, constant_cells=constant_cells), _rect())
    positive = _sample(_cell_pixels(POSITIVE_RAW, constant_cells=constant_cells), _rect())
    # Open world (-13,19), close (-5,19); change geometry, keep encoded text fixed.
    changed_values = (255, 0, 128, 0, 127, 255, 0, 0, 128, 0, 0, 255, 0, 0, 255)
    changed = _sample(_cell_pixels(changed_values, constant_cells=constant_cells), _rect())
    regional_a = native.bridge.encoded_bindings_from_sdxl_conditioning(
        "regional", regional_source, negative_coverage=negative, positive_coverage=positive
    )
    regional_b = native.bridge.encoded_bindings_from_sdxl_conditioning(
        "regional", regional_source, negative_coverage=negative, positive_coverage=changed
    )
    assert native.torch.equal(regional_a.positive.context, regional_b.positive.context)
    assert native.torch.equal(regional_a.negative.context, regional_b.negative.context)
    return global_pair, regional_a, regional_b


def _literal_native_permissions(native: Any, *, factor: int = 1, changed: bool = False) -> Any:
    # The fine oracle enumerates literal world coordinates. Coarse expectations
    # below enumerate known ceil windows of that 3x5 world, including edge cells.
    if factor == 1:
        negative = tuple(i for i, world in enumerate(WORLD_QUERIES) if world in NEGATIVE_WORLD)
        positive_world = (POSITIVE_WORLD - {(-5, 19)}) | {(-13, 19)} if changed else POSITIVE_WORLD
        positive = tuple(i for i, world in enumerate(WORLD_QUERIES) if world in positive_world)
        queries = 15
    else:
        assert not changed
        negative, positive, queries = {
            2: ((0, 1, 2, 4), (0, 1, 3, 5), 6),
            4: ((0, 1), (0, 1), 2),
            8: ((0,), (0,), 1),
        }[factor]
    allowed = native.torch.zeros((2, 2, queries, 231), dtype=native.torch.bool)
    allowed[:, :, :, :77] = True
    for query in negative:
        allowed[0, :, query, 77:154] = True
    for query in positive:
        allowed[1, :, query, 77:231] = True
    # Negative [154:231] is terminal sign padding, never spatial coverage.
    return allowed


def _assert_original_native_oracle(
    native: Any,
    root: Any,
    seen: Any,
    negative: tuple[Any, ...],
    positive: tuple[Any, ...],
    allowed: Any,
    *,
    observation: int = 0,
) -> None:
    torch = native.torch
    queries = allowed.shape[2]
    actual = _mask(native, seen.masks[observation], 2, queries, 231)
    assert torch.equal(actual, allowed), "Original native attn2 consumed wrong world permissions."
    # Context oracle comes from real owned converter outputs, in declared order.
    context = torch.cat(
        (_literal_context(native, negative, 231), _literal_context(native, positive, 231))
    )
    assert torch.equal(seen.contexts[observation], context)
    attention = _first_attention(native, root)
    # Use the unchanged native Attention/processor and projection weights as the
    # numerical consumer oracle. No duplicate processor/softmax implementation.
    expected_output = attention(
        seen.queries[observation],
        encoder_hidden_states=context,
        attention_mask=allowed.reshape(4, queries, 231),
    )
    assert torch.allclose(seen.outputs[observation], expected_output, atol=2e-6, rtol=2e-6)


def _native_geometry_semantics(native: Any, monkeypatch: Any, *, constant_cells: bool) -> None:
    torch = native.torch
    root = native.pipeline.unet
    global_pair, regional_a, regional_b = _native_pairs(native, constant_cells=constant_cells)
    negative = (global_pair.negative, regional_a.negative)
    positive_a = (global_pair.positive, regional_a.positive)
    positive_b = (global_pair.positive, regional_b.positive)
    args = _arguments(native, root, negative=negative, positive=positive_a, shape=Shape(3, 5))
    # Explicit global pooled owners stay fixed while regional geometry changes.
    args.update(negative_pooled_source_id="global", positive_pooled_source_id="global")
    slots, state, snapshot = _slots(root), _state(root), _snapshot(root)
    try:
        with _observe(native, root, monkeypatch) as seen:
            first = native.bridge.run_illustrious_regional_conditioning(root, **args)
            second = native.bridge.run_illustrious_regional_conditioning(
                root, **{**args, "positive": positive_b}
            )
        assert len(seen.contexts) == len(seen.outputs) == len(seen.results) == 2
        assert first is seen.results[0] and second is seen.results[1]
        assert first.sample.shape == second.sample.shape == (2, 4, 3, 5)
        _assert_original_native_oracle(
            native, root, seen, negative, positive_a, _literal_native_permissions(native)
        )
        _assert_original_native_oracle(
            native,
            root,
            seen,
            negative,
            positive_b,
            _literal_native_permissions(native, changed=True),
            observation=1,
        )
        # At the FIRST original attention, query vectors and text are held fixed.
        assert torch.equal(seen.queries[0], seen.queries[1])
        assert torch.equal(seen.contexts[0], seen.contexts[1])
        a, b = seen.outputs
        assert torch.equal(a[0], b[0])
        # World (-13,19) opens and (-5,19) closes; both must affect native output.
        for query in (0, 1):
            assert (a[1, query] - b[1, query]).abs().max().item() > 1e-6
        # World (11,19) is blocked in both planes. This is attention-local,
        # not a claim of final spatial pixel preservation through the UNet.
        assert torch.equal(a[1, 3], b[1, 3])
        assert torch.equal(first.sample[0], second.sample[0])
        assert (first.sample[1] - second.sample[1]).abs().max().item() > 1e-6
        for inputs in seen.root_inputs:
            assert inputs["sample"].shape == (2, 4, 3, 5)
        assert torch.equal(
            seen.root_inputs[0]["added_cond_kwargs"]["text_embeds"],
            seen.root_inputs[1]["added_cond_kwargs"]["text_embeds"],
        )
    finally:
        _assert_restored(root, snapshot)
        assert _slots(root) == slots
        _assert_state(native, root, state)


def test_origin_phase_mutation_red(native: Any, monkeypatch: Any) -> None:
    """RED under center sampling, at original native permission/output semantics."""
    _native_geometry_semantics(native, monkeypatch, constant_cells=False)


def test_constant_cell_phase_control_green(native: Any, monkeypatch: Any) -> None:
    """GREEN under center sampling; actual helper and bridge still execute."""
    _native_geometry_semantics(native, monkeypatch, constant_cells=True)


@pytest.mark.parametrize("factor,grid", [(2, (2, 3)), (4, (1, 2)), (8, (1, 1))])
def test_actual_geometry_converter_bridge_coarse_ceil_native_permissions_and_padding(
    native: Any, monkeypatch: Any, factor: int, grid: tuple[int, int]
) -> None:
    root = _transformer(native)
    global_pair, regional, _changed = _native_pairs(native, constant_cells=False)
    negative = (global_pair.negative, regional.negative)
    positive = (global_pair.positive, regional.positive)
    args = _arguments(
        native, root, negative=negative, positive=positive, shape=Shape(3, 5), factor=factor
    )
    snapshot, slots, state = _snapshot(root), _slots(root), _state(root)
    try:
        with _observe(native, root, monkeypatch) as seen:
            result = native.bridge.run_illustrious_regional_conditioning(root, **args)
        assert result is seen.results[0]
        assert tuple(result.sample.shape) == (2, 8, *grid)
        assert tuple(args["sample"].shape[-2:]) == grid
        _assert_original_native_oracle(
            native,
            root,
            seen,
            negative,
            positive,
            _literal_native_permissions(native, factor=factor),
        )
    finally:
        _assert_restored(root, snapshot)
        assert _slots(root) == slots
        _assert_state(native, root, state)


@pytest.mark.parametrize("kind", ["zero", "covered-but-unsampled", "subthreshold"])
def test_empty_like_geometry_is_blocked_at_original_native_consumer(
    native: Any, monkeypatch: Any, kind: str
) -> None:
    torch = native.torch
    root = native.pipeline.unet
    alpha = {
        "zero": bytes(960),
        "covered-but-unsampled": _world_pixels(((-12, 20, 255), (26, 42, 255))),
        "subthreshold": _world_pixels(((-13, 19, 127),)),
    }[kind]
    coverage = _sample(alpha, _rect())
    global_pair = native.bridge.encoded_bindings_from_sdxl_conditioning(
        "global",
        _encoded(native, "portrait", "blur"),
        negative_coverage=Everywhere(),
        positive_coverage=Everywhere(),
    )
    regional_a = native.bridge.encoded_bindings_from_sdxl_conditioning(
        "regional",
        _encoded(native, "cat", "noise"),
        negative_coverage=coverage,
        positive_coverage=coverage,
    )
    regional_b = native.bridge.encoded_bindings_from_sdxl_conditioning(
        "regional",
        _encoded(native, "dog", "noise"),
        negative_coverage=coverage,
        positive_coverage=coverage,
    )
    assert not torch.equal(regional_a.positive.context, regional_b.positive.context)
    args = _arguments(
        native,
        root,
        negative=(global_pair.negative, regional_a.negative),
        positive=(global_pair.positive, regional_a.positive),
        shape=Shape(3, 5),
    )
    args.update(negative_pooled_source_id="global", positive_pooled_source_id="global")
    snapshot, slots, state = _snapshot(root), _slots(root), _state(root)
    try:
        with _observe(native, root, monkeypatch) as seen:
            first = native.bridge.run_illustrious_regional_conditioning(root, **args)
            second = native.bridge.run_illustrious_regional_conditioning(
                root, **{**args, "positive": (global_pair.positive, regional_b.positive)}
            )
        assert type(coverage) is Alpha8
        for mask in seen.masks:
            allowed = _mask(native, mask, 2, 15, 154)
            assert allowed[:, :, :, :77].all()
            assert not allowed[:, :, :, 77:].any()
        assert torch.equal(seen.outputs[0], seen.outputs[1])
        assert torch.equal(first.sample, second.sample)
    finally:
        _assert_restored(root, snapshot)
        assert _slots(root) == slots
        _assert_state(native, root, state)


def test_four_stage_vae_normal_pipeline_noise_and_actual_bridge_use_h8_w8(
    native: Any, monkeypatch: Any
) -> None:
    """Actual 24x40 pipeline noise, VAE encode and bridge samples are all 3x5."""
    torch = native.torch
    original = native.pipeline
    components = original.components
    shared = (original.text_encoder, original.text_encoder_2, original.unet)
    snapshots = tuple(_snapshot(module) for module in shared)
    slots = tuple(_slots(module) for module in shared)
    states = tuple(_state(module) for module in shared)
    with torch.random.fork_rng(devices=[]):
        torch.manual_seed(261026)
        vae = native.diffusers.AutoencoderKL(
            in_channels=3,
            out_channels=3,
            down_block_types=("DownEncoderBlock2D",) * 4,
            up_block_types=("UpDecoderBlock2D",) * 4,
            block_out_channels=(8, 8, 8, 8),
            layers_per_block=1,
            latent_channels=4,
            norm_num_groups=4,
            sample_size=40,
        ).eval()
    scheduler = native.diffusers.DPMSolverMultistepScheduler.from_config(original.scheduler.config)
    pipeline = native.diffusers.StableDiffusionXLPipeline(
        vae=vae,
        text_encoder=original.text_encoder,
        text_encoder_2=original.text_encoder_2,
        tokenizer=original.tokenizer,
        tokenizer_2=original.tokenizer_2,
        unet=original.unet,
        scheduler=scheduler,
        add_watermarker=False,
    )
    pipeline.set_progress_bar_config(disable=True)
    captured: list[dict[str, Any]] = []

    def capture(_root: Any, args: Any, kwargs: Any) -> None:
        # Observation only: retain actual NORMAL pipeline-generated noise and
        # timestep/time IDs, without replacing prepare_latents or UNet outputs.
        captured.append(
            {
                "sample": args[0].detach().clone(),
                "timestep": args[1].detach().clone(),
                "time_ids": kwargs["added_cond_kwargs"]["time_ids"].detach().clone(),
            }
        )

    try:
        assert len(vae.encoder.down_blocks) == len(vae.decoder.up_blocks) == 4
        assert pipeline.vae_scale_factor == 8
        encoded_pixels = vae.encode(torch.zeros(1, 3, 24, 40)).latent_dist.mode()
        assert tuple(encoded_pixels.shape) == (1, 4, 3, 5)
        source = _encoded(native, "portrait", "blur")
        handle = original.unet.register_forward_pre_hook(capture, with_kwargs=True)
        try:
            result = pipeline(
                width=40,
                height=24,
                num_inference_steps=2,
                guidance_scale=5.0,
                prompt_embeds=source.positive,
                negative_prompt_embeds=source.negative,
                pooled_prompt_embeds=source.positive_pooled,
                negative_pooled_prompt_embeds=source.negative_pooled,
                generator=torch.Generator(device="cpu").manual_seed(42),
                output_type="latent",
            )
        finally:
            handle.remove()
        assert tuple(result.images.shape) == (1, 4, 3, 5)
        assert torch.isfinite(result.images).all()
        assert len(captured) == 2
        assert all(tuple(item["sample"].shape) == (2, 4, 3, 5) for item in captured)
        assert not torch.equal(captured[0]["sample"], captured[1]["sample"])
        _assert_restored(original.unet, snapshots[2])

        global_pair, regional, _changed = _native_pairs(native, constant_cells=False)
        negative = (global_pair.negative, regional.negative)
        positive = (global_pair.positive, regional.positive)
        # Consume the real pipeline's first noise/time input through the owned
        # converter/bridge with ordinary-Canvas geometry, not synthetic latents.
        with _observe(native, original.unet, monkeypatch) as seen:
            consumed = native.bridge.run_illustrious_regional_conditioning(
                original.unet,
                negative=negative,
                positive=positive,
                latent_shape=Shape(3, 5),
                layout="cfg-negative-first",
                bindings=_bindings(native, original.unet),
                sample=captured[0]["sample"],
                # Native scheduler timesteps may be int64; preserve the actual
                # value while satisfying the bridge's explicit float32 profile.
                timestep=captured[0]["timestep"].to(dtype=torch.float32),
                time_ids=captured[0]["time_ids"],
                negative_pooled_source_id="global",
                positive_pooled_source_id="global",
            )
        assert consumed is seen.results[0] and tuple(consumed.sample.shape) == (2, 4, 3, 5)
        assert torch.equal(seen.root_inputs[0]["sample"], captured[0]["sample"])
        _assert_original_native_oracle(
            native, original.unet, seen, negative, positive, _literal_native_permissions(native)
        )
    finally:
        for module, snapshot, saved_slots, state in zip(
            shared, snapshots, slots, states, strict=True
        ):
            _assert_restored(module, snapshot)
            assert _slots(module) == saved_slots
            _assert_state(native, module, state)
        assert original.components.keys() == components.keys()
        for key, component in components.items():
            assert original.components[key] is component
