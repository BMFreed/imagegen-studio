"""Private CPU numerical contract, with no model or attention execution claim.

The public factory/query/ranges path is the subject. Dense permissions below
come directly from original factor-sized windows and independently stated token
prefixes, never from production pyramids or recursively pooled test data.
The named 128 boundary and binary control are isolated mutation witnesses.
"""

from __future__ import annotations

import dataclasses
import inspect
import subprocess
import sys
import textwrap
import unittest
from collections.abc import Callable
from pathlib import Path
from typing import Any, cast
from unittest.mock import patch

from imagegen_worker import illustrious_regional_attention as regional
from imagegen_worker.illustrious_regional_attention import (
    Alpha8,
    AlphaLevel,
    AlphaPyramid,
    AttentionPlan,
    EncodedSegment,
    Everywhere,
    IllustriousRegionalAttentionError,
    PlannedSegment,
    QueryView,
    Shape,
    SignedPlan,
    TokenRange,
    plan_illustrious_attention,
)

PROFILE = "alpha8-ge128-ceil2x2-max-v1"
INPUT_INVALID = "REGIONAL_ATTENTION_INPUT_INVALID"
LIMIT = "REGIONAL_ATTENTION_LIMIT"
QUERY_INVALID = "REGIONAL_ATTENTION_QUERY_INVALID"
FACTORS = (1, 2, 4, 8)

# Oracle rows are (sign, ((binding, start, end, original bytes or None), ...)).
# None is internal to this independent oracle, never a production coverage input.
OracleSpan = tuple[str, int, int, bytes | None]
OracleRow = tuple[str, tuple[OracleSpan, ...]]


class IntSubclass(int):
    pass


class StrSubclass(str):
    pass


class BytesSubclass(bytes):
    pass


class TupleSubclass(tuple[object, ...]):
    pass


class ExplosiveInput:
    """Type rejection must precede coercion, iteration, comparisons or repr."""

    def _unexpected(self, *_args: object, **_kwargs: object) -> Any:
        raise AssertionError("An invalid input's behavior was evaluated.")

    __repr__ = _unexpected
    __str__ = _unexpected
    __iter__ = _unexpected
    __len__ = _unexpected
    __bool__ = _unexpected
    __eq__ = _unexpected
    __index__ = _unexpected
    __bytes__ = _unexpected


def _plan(
    shape: object,
    negative: object,
    positive: object,
    layout: object = "cfg-negative-first",
) -> AttentionPlan:
    # Invalid-input cases cross this typed API deliberately; do not normalize
    # their values or let fixture construction hide the public refusal boundary.
    return plan_illustrious_attention(
        latent_shape=cast(Any, shape),
        negative=cast(Any, negative),
        positive=cast(Any, positive),
        profile=PROFILE,
        layout=cast(Any, layout),
    )


def _spans(ranges: tuple[TokenRange, ...]) -> tuple[tuple[str, int, int], ...]:
    return tuple((item.binding_id, item.start, item.end) for item in ranges)


def _levels(segment: PlannedSegment) -> tuple[AlphaLevel, ...]:
    coverage = segment.coverage
    if type(coverage) is not AlphaPyramid:
        raise AssertionError("Expected an AlphaPyramid for the alpha-backed segment.")
    return coverage.levels


class IllustriousRegionalAttentionTests(unittest.TestCase):
    def assert_error(self, code: str, action: Callable[[], object]) -> None:
        with self.assertRaises(IllustriousRegionalAttentionError) as caught:
            action()
        self.assertIsInstance(caught.exception, ValueError)
        self.assertEqual(caught.exception.code, code)
        self.assertIs(type(caught.exception.code), str)
        # Bounded failure output even when the input contains a large byte plane.
        self.assertLessEqual(len(str(caught.exception)), 512)

    def assert_dense_permissions(
        self,
        plan: AttentionPlan,
        height: int,
        width: int,
        rows: tuple[OracleRow, ...],
        key_length: int,
    ) -> None:
        """Compare every permission, including sign padding and fully masked rows."""
        self.assertEqual(plan.key_length, key_length)
        self.assertEqual(plan.batch_signs, tuple(row[0] for row in rows))
        for factor in FACTORS:
            grid_h = (height + factor - 1) // factor
            grid_w = (width + factor - 1) // factor
            view = plan.query(factor=factor, shape=Shape(grid_h, grid_w), key_length=key_length)
            self.assertIsInstance(view, QueryView)
            self.assertEqual(view.factor, factor)
            self.assertEqual(view.shape, Shape(grid_h, grid_w))
            self.assertEqual(view.key_length, key_length)
            self.assertEqual(view.batch_signs, tuple(row[0] for row in rows))
            for batch_index, (_sign, spans) in enumerate(rows):
                for query_index in range(grid_h * grid_w):
                    y, x = divmod(query_index, grid_w)
                    expected_spans: list[tuple[str, int, int]] = []
                    for binding, start, end, original in spans:
                        visible = original is None or any(
                            original[source_y * width + source_x] >= 128
                            for source_y in range(y * factor, min((y + 1) * factor, height))
                            for source_x in range(x * factor, min((x + 1) * factor, width))
                        )
                        if visible:
                            expected_spans.append((binding, start, end))
                    actual = view.allowed_ranges(batch_index=batch_index, query_index=query_index)
                    self.assertIs(type(actual), tuple)
                    for item in actual:
                        self.assertIs(type(item), TokenRange)
                    location = f"factor={factor}, batch={batch_index}, query={query_index}"
                    self.assertEqual(_spans(actual), tuple(expected_spans), location)
                    for key_index in range(key_length):
                        expected = any(start <= key_index < end for _, start, end in expected_spans)
                        permitted = any(item.start <= key_index < item.end for item in actual)
                        self.assertEqual(permitted, expected, f"{location}, key={key_index}")

    def assert_immutable_tree(self, value: object) -> None:
        if type(value) in (int, str, bytes):
            return
        if type(value) is tuple:
            for member in cast(tuple[object, ...], value):
                self.assert_immutable_tree(member)
            return
        if not dataclasses.is_dataclass(value) or isinstance(value, type):
            self.fail("Unexpected mutable/non-record output.")
        self.assertTrue(cast(Any, type(value)).__dataclass_params__.frozen)
        self.assertFalse(hasattr(value, "__dict__"), "Output records must use slots.")
        for field in dataclasses.fields(value):
            self.assert_immutable_tree(getattr(value, field.name))

    def test_factory_and_query_arguments_are_explicit_and_keyword_only(self) -> None:
        signatures = (
            (
                plan_illustrious_attention,
                ("latent_shape", "negative", "positive", "profile", "layout"),
            ),
            (AttentionPlan.query, ("factor", "shape", "key_length")),
            (QueryView.allowed_ranges, ("batch_index", "query_index")),
        )
        for function, expected in signatures:
            parameters = inspect.signature(function).parameters
            self.assertEqual(tuple(name for name in parameters if name != "self"), expected)
            for name in expected:
                self.assertIs(parameters[name].kind, inspect.Parameter.KEYWORD_ONLY)
                self.assertIs(parameters[name].default, inspect.Parameter.empty)

    def test_literal_odd_3_by_5_raw_levels_preserve_soft_alpha(self) -> None:
        shape = Shape(3, 5)
        original = bytes((0, 127, 128, 255, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 129))
        plan = _plan(
            shape,
            (EncodedSegment("n", 1, Everywhere()),),
            (EncodedSegment("p", 3, Alpha8(shape, original)),),
        )
        levels = _levels(plan.positive.segments[0])
        self.assertIs(type(levels), tuple)
        expected = (
            (1, Shape(3, 5), original),
            (2, Shape(2, 3), bytes((127, 255, 8, 10, 12, 129))),
            (4, Shape(1, 2), bytes((255, 129))),
            (8, Shape(1, 1), bytes((255,))),
        )
        self.assertEqual(len(levels), 4)
        for level, (factor, grid, samples) in zip(levels, expected, strict=True):
            self.assertIs(type(level), AlphaLevel)
            self.assertEqual((level.factor, level.shape), (factor, grid))
            self.assertIs(type(level.samples), bytes)
            self.assertTrue(level.samples == samples, f"Wrong raw samples at factor {factor}.")
        self.assert_dense_permissions(
            plan,
            3,
            5,
            (("negative", (("n", 0, 1, None),)), ("positive", (("p", 0, 3, original),))),
            3,
        )

    def test_literal_odd_5_by_3_raw_levels_keep_orientation(self) -> None:
        shape = Shape(5, 3)
        original = bytes((0, 127, 128, 255, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 129))
        plan = _plan(
            shape,
            (EncodedSegment("n", 1, Alpha8(shape, original)),),
            (EncodedSegment("p", 1, Everywhere()),),
        )
        levels = _levels(plan.negative.segments[0])
        self.assertEqual(
            tuple((level.factor, level.shape, level.samples) for level in levels),
            (
                (1, Shape(5, 3), original),
                (2, Shape(3, 2), bytes((255, 128, 9, 10, 12, 129))),
                (4, Shape(2, 1), bytes((255, 129))),
                (8, Shape(1, 1), bytes((255,))),
            ),
        )
        self.assert_dense_permissions(
            plan,
            5,
            3,
            (("negative", (("n", 0, 1, original),)), ("positive", (("p", 0, 1, None),))),
            1,
        )

    def test_odd_last_cell_tracks_flat_indices_14_5_1_0(self) -> None:
        shape = Shape(3, 5)
        original = bytes((0,) * 14 + (255,))
        plan = _plan(
            shape,
            (EncodedSegment("n", 2, Everywhere()),),
            (EncodedSegment("edge", 1, Alpha8(shape, original)),),
        )
        levels = _levels(plan.positive.segments[0])
        for level, edge in zip(levels, (14, 5, 1, 0), strict=True):
            self.assertEqual(tuple(i for i, alpha in enumerate(level.samples) if alpha), (edge,))
            view = plan.query(factor=level.factor, shape=level.shape, key_length=2)
            for query_index in range(level.shape.height * level.shape.width):
                expected = (("edge", 0, 1),) if query_index == edge else ()
                self.assertEqual(
                    _spans(view.allowed_ranges(batch_index=1, query_index=query_index)), expected
                )

    def test_one_by_one_retains_all_four_factor_records(self) -> None:
        shape = Shape(1, 1)
        for alpha in (0, 127, 128, 255):
            with self.subTest(alpha=alpha):
                original = bytes((alpha,))
                plan = _plan(
                    shape,
                    (EncodedSegment("n", 1, Alpha8(shape, original)),),
                    (EncodedSegment("p", 1, Alpha8(shape, original)),),
                )
                levels = _levels(plan.positive.segments[0])
                self.assertEqual(tuple(level.factor for level in levels), FACTORS)
                self.assertEqual(tuple(level.shape for level in levels), (shape,) * 4)
                self.assertEqual(tuple(level.samples for level in levels), (original,) * 4)
                self.assert_dense_permissions(
                    plan,
                    1,
                    1,
                    (
                        ("negative", (("n", 0, 1, original),)),
                        ("positive", (("p", 0, 1, original),)),
                    ),
                    1,
                )

    def test_one_by_256_and_256_by_one_match_original_windows(self) -> None:
        original = bytes((0, 127, 128, 255)) * 64
        for height, width in ((1, 256), (256, 1)):
            with self.subTest(height=height, width=width):
                shape = Shape(height, width)
                plan = _plan(
                    shape,
                    (EncodedSegment("n", 2, Everywhere()),),
                    (EncodedSegment("p", 3, Alpha8(shape, original)),),
                )
                self.assert_dense_permissions(
                    plan,
                    height,
                    width,
                    (("negative", (("n", 0, 2, None),)), ("positive", (("p", 0, 3, original),))),
                    3,
                )

    def test_cfg_prefixes_overlap_and_negative_padding_match_dense_oracle(self) -> None:
        shape = Shape(3, 5)
        a = bytes((0, 127, 128, 255, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 129))
        b = bytes((255, 0, 127, 0, 128, 0, 255, 0, 128, 0, 127, 128, 0, 0, 255))
        plan = _plan(
            shape,
            (
                EncodedSegment("n-global", 2, Everywhere()),
                EncodedSegment("n-a", 3, Alpha8(shape, a)),
                EncodedSegment("n-b", 1, Alpha8(shape, b)),
            ),
            (
                EncodedSegment("p-b", 1, Alpha8(shape, b)),
                EncodedSegment("p-global", 2, Everywhere()),
                EncodedSegment("p-a", 5, Alpha8(shape, a)),
            ),
        )
        self.assertEqual((plan.negative.sign, plan.negative.length), ("negative", 6))
        self.assertEqual((plan.positive.sign, plan.positive.length), ("positive", 8))
        self.assertEqual(
            _spans(tuple(item.token_range for item in plan.negative.segments)),
            (("n-global", 0, 2), ("n-a", 2, 5), ("n-b", 5, 6)),
        )
        self.assertEqual(
            _spans(tuple(item.token_range for item in plan.positive.segments)),
            (("p-b", 0, 1), ("p-global", 1, 3), ("p-a", 3, 8)),
        )
        self.assert_dense_permissions(
            plan,
            3,
            5,
            (
                ("negative", (("n-global", 0, 2, None), ("n-a", 2, 5, a), ("n-b", 5, 6, b))),
                ("positive", (("p-b", 0, 1, b), ("p-global", 1, 3, None), ("p-a", 3, 8, a))),
            ),
            8,
        )

    def test_positive_padding_is_never_permitted_by_everywhere(self) -> None:
        shape = Shape(2, 3)
        original = bytes((0, 128, 127, 255, 0, 128))
        plan = _plan(
            shape,
            (
                EncodedSegment("n-global", 3, Everywhere()),
                EncodedSegment("n-mask", 5, Alpha8(shape, original)),
            ),
            (
                EncodedSegment("p-global", 1, Everywhere()),
                EncodedSegment("p-mask", 2, Alpha8(shape, original)),
            ),
        )
        self.assert_dense_permissions(
            plan,
            2,
            3,
            (
                ("negative", (("n-global", 0, 3, None), ("n-mask", 3, 8, original))),
                ("positive", (("p-global", 0, 1, None), ("p-mask", 1, 3, original))),
            ),
            8,
        )

    def test_positive_only_keeps_negative_plan_and_negative_longer_key_length(self) -> None:
        shape = Shape(2, 3)
        original = bytes((0, 127, 128, 255, 0, 128))
        negative = (EncodedSegment("n", 7, Alpha8(shape, original)),)
        positive = (
            EncodedSegment("p-global", 1, Everywhere()),
            EncodedSegment("p", 2, Alpha8(shape, original)),
        )
        cfg = _plan(shape, negative, positive)
        plan = _plan(shape, negative, positive, "positive-only")
        self.assertEqual(plan.negative, cfg.negative)
        self.assertEqual(plan.positive, cfg.positive)
        self.assertEqual(plan.negative.length, 7)
        self.assert_dense_permissions(
            plan,
            2,
            3,
            (("positive", (("p-global", 0, 1, None), ("p", 1, 3, original))),),
            7,
        )

    def test_positive_only_when_positive_is_longer(self) -> None:
        shape = Shape(1, 3)
        original = bytes((0, 128, 255))
        plan = _plan(
            shape,
            (EncodedSegment("n", 1, Everywhere()),),
            (EncodedSegment("p", 5, Alpha8(shape, original)),),
            "positive-only",
        )
        self.assertEqual(plan.negative.length, 1)
        self.assert_dense_permissions(plan, 1, 3, (("positive", (("p", 0, 5, original),)),), 5)

    def test_equal_sign_lengths_never_bypass_different_spatial_support(self) -> None:
        shape = Shape(2, 3)
        negative = bytes((255, 0, 127, 128, 0, 0))
        positive = bytes((0, 128, 255, 0, 127, 255))
        plan = _plan(
            shape,
            (EncodedSegment("same-id", 3, Alpha8(shape, negative)),),
            (EncodedSegment("same-id", 3, Alpha8(shape, positive)),),
        )
        self.assert_dense_permissions(
            plan,
            2,
            3,
            (
                ("negative", (("same-id", 0, 3, negative),)),
                ("positive", (("same-id", 0, 3, positive),)),
            ),
            3,
        )

    def test_identical_overlapping_masks_retain_distinct_ranges_in_stream_order(self) -> None:
        shape = Shape(1, 3)
        original = bytes((255, 128, 0))
        same_coverage = Alpha8(shape, original)
        plan = _plan(
            shape,
            (EncodedSegment("z", 2, same_coverage), EncodedSegment("a", 3, same_coverage)),
            (EncodedSegment("z", 1, same_coverage), EncodedSegment("a", 1, same_coverage)),
        )
        self.assert_dense_permissions(
            plan,
            1,
            3,
            (
                ("negative", (("z", 0, 2, original), ("a", 2, 5, original))),
                ("positive", (("z", 0, 1, original), ("a", 1, 2, original))),
            ),
            5,
        )

    def test_all_masked_rows_are_empty_without_global_fabrication(self) -> None:
        shape = Shape(3, 5)
        original = bytes((0, 127, 1, 126, 2)) * 3
        for layout in ("cfg-negative-first", "positive-only"):
            with self.subTest(layout=layout):
                plan = _plan(
                    shape,
                    (EncodedSegment("n", 3, Alpha8(shape, original)),),
                    (EncodedSegment("p", 2, Alpha8(shape, original)),),
                    layout,
                )
                rows = (("positive", (("p", 0, 2, original),)),)
                if layout == "cfg-negative-first":
                    rows = (("negative", (("n", 0, 3, original),)),) + rows
                self.assert_dense_permissions(plan, 3, 5, rows, 3)
                for factor in FACTORS:
                    view = plan.query(
                        factor=factor,
                        shape=Shape((3 + factor - 1) // factor, (5 + factor - 1) // factor),
                        key_length=3,
                    )
                    for batch_index in range(len(view.batch_signs)):
                        for query_index in range(view.shape.height * view.shape.width):
                            self.assertEqual(
                                view.allowed_ranges(
                                    batch_index=batch_index, query_index=query_index
                                ),
                                (),
                            )

    def test_everywhere_only_exposes_its_actual_span(self) -> None:
        shape = Shape(1, 2)
        zeros = bytes((0, 0))
        plan = _plan(
            shape,
            (EncodedSegment("n", 8, Everywhere()),),
            (
                EncodedSegment("empty-a", 2, Alpha8(shape, zeros)),
                EncodedSegment("global", 1, Everywhere()),
                EncodedSegment("empty-b", 2, Alpha8(shape, zeros)),
            ),
        )
        self.assert_dense_permissions(
            plan,
            1,
            2,
            (
                ("negative", (("n", 0, 8, None),)),
                (
                    "positive",
                    (("empty-a", 0, 2, zeros), ("global", 2, 3, None), ("empty-b", 3, 5, zeros)),
                ),
            ),
            8,
        )

    def test_mutation_boundary_alpha128_is_allowed_without_releasing_127(self) -> None:
        # Explicit global support makes every row usable. >=128 -> >128 must
        # lose the boundary range while the neighboring 127 range stays denied.
        shape = Shape(1, 2)
        plan = _plan(
            shape,
            (EncodedSegment("n-global", 1, Everywhere()),),
            (
                EncodedSegment("p-global", 1, Everywhere()),
                EncodedSegment("threshold", 2, Alpha8(shape, bytes((127, 128)))),
            ),
        )
        view = plan.query(factor=1, shape=shape, key_length=3)
        self.assertEqual(
            _spans(view.allowed_ranges(batch_index=1, query_index=0)), (("p-global", 0, 1),)
        )
        self.assertEqual(
            _spans(view.allowed_ranges(batch_index=1, query_index=1)),
            (("p-global", 0, 1), ("threshold", 1, 3)),
        )

    def test_mutation_control_binary_zero_and_255_permissions(self) -> None:
        # The same >=128 -> >128 mutation leaves this binary control green.
        shape = Shape(1, 2)
        plan = _plan(
            shape,
            (EncodedSegment("n-global", 1, Everywhere()),),
            (
                EncodedSegment("p-global", 1, Everywhere()),
                EncodedSegment("binary", 2, Alpha8(shape, bytes((0, 255)))),
            ),
        )
        view = plan.query(factor=1, shape=shape, key_length=3)
        self.assertEqual(
            _spans(view.allowed_ranges(batch_index=1, query_index=0)), (("p-global", 0, 1),)
        )
        self.assertEqual(
            _spans(view.allowed_ranges(batch_index=1, query_index=1)),
            (("p-global", 0, 1), ("binary", 1, 3)),
        )

    def test_both_signs_must_be_nonempty_for_both_layouts(self) -> None:
        shape = Shape(1, 1)
        valid = (EncodedSegment("valid", 1, Everywhere()),)
        for layout in ("cfg-negative-first", "positive-only"):
            for negative, positive in (((), valid), (valid, ()), ((), ())):
                with self.subTest(
                    layout=layout, empty_negative=not negative, empty_positive=not positive
                ):
                    self.assert_error(
                        INPUT_INVALID,
                        lambda layout=layout, negative=negative, positive=positive: _plan(
                            shape, negative, positive, layout
                        ),
                    )

    def test_sign_containers_are_exact_tuples_without_coercion(self) -> None:
        shape = Shape(1, 1)
        item = EncodedSegment("valid", 1, Everywhere())
        valid = (item,)
        invalid: tuple[Any, ...] = (
            None,
            [item],
            {"valid": item},
            TupleSubclass(valid),
            iter(valid),
            ExplosiveInput(),
        )
        for case, value in enumerate(invalid):
            for sign in ("negative", "positive"):
                with self.subTest(case=case, sign=sign):
                    self.assert_error(
                        INPUT_INVALID,
                        lambda sign=sign, value=value: _plan(
                            shape,
                            value if sign == "negative" else valid,
                            value if sign == "positive" else valid,
                        ),
                    )

    def test_segment_records_and_coverages_reject_exotic_classes(self) -> None:
        shape = Shape(1, 1)
        segment_subclass = type("SegmentSubclass", (EncodedSegment,), {})
        alpha_subclass = type("AlphaSubclass", (Alpha8,), {})
        everywhere_subclass = type("EverywhereSubclass", (Everywhere,), {})
        valid = (EncodedSegment("valid", 1, Everywhere()),)
        invalid_segments = (
            None,
            {"binding_id": "x", "encoded_length": 1, "coverage": Everywhere()},
            ("x", 1, Everywhere()),
            ExplosiveInput(),
            segment_subclass("x", 1, Everywhere()),
        )
        for case, value in enumerate(invalid_segments):
            with self.subTest(kind="segment", case=case):
                self.assert_error(INPUT_INVALID, lambda value=value: _plan(shape, (value,), valid))
        invalid_coverage: tuple[Any, ...] = (
            None,
            False,
            True,
            "everywhere",
            b"\xff",
            [],
            {},
            ExplosiveInput(),
            everywhere_subclass(),
            alpha_subclass(shape, b"\xff"),
        )
        for case, value in enumerate(invalid_coverage):
            with self.subTest(kind="coverage", case=case):
                self.assert_error(
                    INPUT_INVALID,
                    lambda value=value: _plan(shape, valid, (EncodedSegment("p", 1, value),)),
                )

    def test_latent_and_alpha_shape_require_exact_shape_records(self) -> None:
        shape = Shape(1, 1)
        shape_subclass = type("ShapeSubclass", (Shape,), {})
        valid = (EncodedSegment("valid", 1, Everywhere()),)
        invalid: tuple[Any, ...] = (
            None,
            (1, 1),
            [1, 1],
            {"height": 1, "width": 1},
            shape_subclass(1, 1),
            ExplosiveInput(),
        )
        for case, value in enumerate(invalid):
            with self.subTest(role="latent", case=case):
                self.assert_error(INPUT_INVALID, lambda value=value: _plan(value, valid, valid))
            with self.subTest(role="alpha", case=case):
                self.assert_error(
                    INPUT_INVALID,
                    lambda value=value: _plan(
                        shape, valid, (EncodedSegment("p", 1, Alpha8(value, b"\xff")),)
                    ),
                )

    def test_shape_sides_require_positive_builtin_integers(self) -> None:
        valid = (EncodedSegment("valid", 1, Everywhere()),)
        invalid: tuple[Any, ...] = (
            True,
            False,
            0,
            -1,
            1.0,
            float("nan"),
            float("inf"),
            None,
            "1",
            IntSubclass(1),
            ExplosiveInput(),
        )
        for case, value in enumerate(invalid):
            for axis in ("height", "width"):
                with self.subTest(case=case, axis=axis):
                    shape = Shape(value, 1) if axis == "height" else Shape(1, value)
                    self.assert_error(INPUT_INVALID, lambda shape=shape: _plan(shape, valid, valid))
                    self.assert_error(
                        INPUT_INVALID,
                        lambda shape=shape: _plan(
                            Shape(1, 1), valid, (EncodedSegment("p", 1, Alpha8(shape, b"\xff")),)
                        ),
                    )

    def test_shape_side_257_is_refused_independently_of_area(self) -> None:
        valid = (EncodedSegment("valid", 1, Everywhere()),)
        for height, width in ((257, 1), (1, 257), (257, 257), (10**30, 1)):
            with self.subTest(height=height, width=width):
                self.assert_error(
                    LIMIT,
                    lambda height=height, width=width: _plan(Shape(height, width), valid, valid),
                )

    def test_alpha_shape_must_match_each_latent_side_even_at_equal_area(self) -> None:
        latent = Shape(3, 5)
        valid = (EncodedSegment("valid", 1, Everywhere()),)
        for height, width in ((5, 3), (1, 15), (15, 1), (3, 4), (4, 5)):
            with self.subTest(height=height, width=width):
                self.assert_error(
                    INPUT_INVALID,
                    lambda height=height, width=width: _plan(
                        latent,
                        valid,
                        (EncodedSegment("p", 1, Alpha8(Shape(height, width), bytes(15))),),
                    ),
                )

    def test_alpha_requires_exact_bytes_not_mutable_views_or_subclasses(self) -> None:
        shape = Shape(1, 2)
        valid = (EncodedSegment("valid", 1, Everywhere()),)
        invalid: tuple[Any, ...] = (
            bytearray((0, 255)),
            [0, 255],
            (0, 255),
            memoryview(b"\x00\xff"),
            BytesSubclass(b"\x00\xff"),
            "\x00\xff",
            None,
            ExplosiveInput(),
        )
        for case, value in enumerate(invalid):
            with self.subTest(case=case):
                self.assert_error(
                    INPUT_INVALID,
                    lambda value=value: _plan(
                        shape, valid, (EncodedSegment("p", 1, Alpha8(shape, value)),)
                    ),
                )

    def test_alpha_sample_count_must_be_exact(self) -> None:
        shape = Shape(3, 5)
        valid = (EncodedSegment("valid", 1, Everywhere()),)
        for count in (0, 1, 14, 16, 30):
            with self.subTest(count=count):
                self.assert_error(
                    INPUT_INVALID,
                    lambda count=count: _plan(
                        shape, valid, (EncodedSegment("p", 1, Alpha8(shape, bytes(count))),)
                    ),
                )

    def test_encoded_lengths_require_positive_builtin_integers(self) -> None:
        shape = Shape(1, 1)
        valid = (EncodedSegment("valid", 1, Everywhere()),)
        invalid: tuple[Any, ...] = (
            True,
            False,
            0,
            -1,
            1.0,
            77.0,
            float("nan"),
            float("inf"),
            "77",
            None,
            IntSubclass(1),
            ExplosiveInput(),
        )
        for case, value in enumerate(invalid):
            for sign in ("negative", "positive"):
                with self.subTest(case=case, sign=sign):
                    bad = (EncodedSegment("bad", value, Everywhere()),)
                    self.assert_error(
                        INPUT_INVALID,
                        lambda bad=bad, sign=sign: _plan(
                            shape,
                            bad if sign == "negative" else valid,
                            bad if sign == "positive" else valid,
                        ),
                    )

    def test_arbitrary_positive_lengths_and_308_aggregate_are_supported(self) -> None:
        shape = Shape(1, 1)
        plan = _plan(
            shape,
            (EncodedSegment("n-a", 1, Everywhere()), EncodedSegment("n-b", 307, Everywhere())),
            (EncodedSegment("p-a", 78, Everywhere()), EncodedSegment("p-b", 230, Everywhere())),
        )
        self.assertEqual(
            (plan.negative.length, plan.positive.length, plan.key_length), (308, 308, 308)
        )
        view = plan.query(factor=1, shape=shape, key_length=308)
        self.assertEqual(
            _spans(view.allowed_ranges(batch_index=0, query_index=0)),
            (("n-a", 0, 1), ("n-b", 1, 308)),
        )
        self.assertEqual(
            _spans(view.allowed_ranges(batch_index=1, query_index=0)),
            (("p-a", 0, 78), ("p-b", 78, 308)),
        )

    def test_309_total_or_single_length_refuses_in_either_sign_and_layout(self) -> None:
        shape = Shape(1, 1)
        valid = (EncodedSegment("valid", 1, Everywhere()),)
        invalid = (
            (EncodedSegment("a", 309, Everywhere()),),
            (EncodedSegment("a", 308, Everywhere()), EncodedSegment("b", 1, Everywhere())),
            (EncodedSegment("a", 10**100, Everywhere()),),
        )
        for layout in ("cfg-negative-first", "positive-only"):
            for sign in ("negative", "positive"):
                for case, bad in enumerate(invalid):
                    with self.subTest(layout=layout, sign=sign, case=case):
                        self.assert_error(
                            LIMIT,
                            lambda bad=bad, layout=layout, sign=sign: _plan(
                                shape,
                                bad if sign == "negative" else valid,
                                bad if sign == "positive" else valid,
                                layout,
                            ),
                        )

    def test_17_segments_refuse_in_either_sign_and_layout(self) -> None:
        shape = Shape(1, 1)
        valid = (EncodedSegment("valid", 1, Everywhere()),)
        too_many = tuple(EncodedSegment(f"stream-{index}", 1, Everywhere()) for index in range(17))
        for layout in ("cfg-negative-first", "positive-only"):
            for sign in ("negative", "positive"):
                with self.subTest(layout=layout, sign=sign):
                    self.assert_error(
                        LIMIT,
                        lambda layout=layout, sign=sign: _plan(
                            shape,
                            too_many if sign == "negative" else valid,
                            too_many if sign == "positive" else valid,
                            layout,
                        ),
                    )

    def test_max_shape_16_streams_and_308_tokens_everywhere_need_no_alpha_allocation(self) -> None:
        shape = Shape(256, 256)
        streams = tuple(
            EncodedSegment(f"stream-{index}", 19 if index < 15 else 23, Everywhere())
            for index in range(16)
        )
        # Narrow allocation sentinel; the rest of the suite uses real pyramids.
        with patch.object(
            regional, "_build_pyramid", side_effect=AssertionError("Unexpected alpha allocation.")
        ) as build:
            plan = _plan(shape, streams, streams)
        self.assertEqual(build.call_count, 0)
        self.assertEqual(
            (plan.negative.length, plan.positive.length, plan.key_length), (308, 308, 308)
        )
        self.assertEqual(len(plan.negative.segments), 16)
        self.assertEqual(len(plan.positive.segments), 16)
        for factor in FACTORS:
            view = plan.query(
                factor=factor, shape=Shape(256 // factor, 256 // factor), key_length=308
            )
            for batch_index in (0, 1):
                for query_index in (0, view.shape.height * view.shape.width - 1):
                    ranges = view.allowed_ranges(batch_index=batch_index, query_index=query_index)
                    self.assertEqual(len(ranges), 16)
                    self.assertEqual((ranges[0].start, ranges[-1].end), (0, 308))
        self.assert_immutable_tree(plan)

    def test_maximum_32_alpha_planes_meet_exact_representation_bound(self) -> None:
        # A finite valid bound case, no dense Q*K oracle and no RSS claim.
        shape = Shape(256, 256)
        original = b"\x7f" * 65_536
        streams = tuple(
            EncodedSegment(f"stream-{index}", 1, Alpha8(shape, original)) for index in range(16)
        )
        plan = _plan(shape, streams, streams)
        retained = 0
        visits = 0
        for signed in (plan.negative, plan.positive):
            for segment in signed.segments:
                levels = _levels(segment)
                self.assertEqual(tuple(level.factor for level in levels), FACTORS)
                self.assertEqual(
                    tuple(level.shape for level in levels),
                    (Shape(256, 256), Shape(128, 128), Shape(64, 64), Shape(32, 32)),
                )
                self.assertEqual(
                    tuple(len(level.samples) for level in levels), (65_536, 16_384, 4_096, 1_024)
                )
                for level in levels:
                    self.assertIs(type(level.samples), bytes)
                    self.assertTrue(
                        level.samples == b"\x7f" * len(level.samples), "Raw constant alpha changed."
                    )
                retained += sum(len(level.samples) for level in levels)
                visits += len(levels[0].samples) + 4 * sum(
                    len(level.samples) for level in levels[1:]
                )
        self.assertEqual(retained, 2_785_280)
        self.assertEqual(visits, 4_849_664)
        view = plan.query(factor=8, shape=Shape(32, 32), key_length=16)
        self.assertEqual(view.allowed_ranges(batch_index=0, query_index=1023), ())
        self.assertEqual(view.allowed_ranges(batch_index=1, query_index=1023), ())

    def test_binding_ids_have_sign_local_namespace_without_normalization(self) -> None:
        shape = Shape(1, 1)
        ids = ("é", "e\u0301", " ", "Case", "case")
        streams = tuple(EncodedSegment(binding, 1, Everywhere()) for binding in ids)
        plan = _plan(shape, streams, streams)
        for signed in (plan.negative, plan.positive):
            self.assertEqual(tuple(item.token_range.binding_id for item in signed.segments), ids)
        self.assertEqual(plan.key_length, 5)

    def test_duplicate_binding_ids_refuse_within_each_sign(self) -> None:
        shape = Shape(1, 1)
        valid = (EncodedSegment("valid", 1, Everywhere()),)
        duplicate = (
            EncodedSegment("same", 1, Everywhere()),
            EncodedSegment("same", 2, Alpha8(shape, b"\xff")),
        )
        for sign in ("negative", "positive"):
            with self.subTest(sign=sign):
                self.assert_error(
                    INPUT_INVALID,
                    lambda sign=sign: _plan(
                        shape,
                        duplicate if sign == "negative" else valid,
                        duplicate if sign == "positive" else valid,
                    ),
                )

    def test_binding_id_128_utf8_byte_boundary(self) -> None:
        shape = Shape(1, 1)
        valid = (EncodedSegment("valid", 1, Everywhere()),)
        for binding in ("a" * 128, "é" * 64, "🦊" * 32):
            with self.subTest(byte_count=128, character_count=len(binding)):
                plan = _plan(shape, valid, (EncodedSegment(binding, 1, Everywhere()),))
                self.assertEqual(plan.positive.segments[0].token_range.binding_id, binding)
        for case, binding in enumerate(("a" * 129, "é" * 65, "🦊" * 33)):
            with self.subTest(oversized_case=case):
                self.assert_error(
                    LIMIT,
                    lambda binding=binding: _plan(
                        shape, valid, (EncodedSegment(binding, 1, Everywhere()),)
                    ),
                )

    def test_binding_ids_reject_invalid_utf8_and_nonbuiltin_strings(self) -> None:
        shape = Shape(1, 1)
        valid = (EncodedSegment("valid", 1, Everywhere()),)
        invalid: tuple[Any, ...] = (
            "",
            "\ud800",
            "\udfff",
            "ok\ud800end",
            "\ud800\udc00",
            None,
            True,
            1,
            1.0,
            float("nan"),
            b"id",
            StrSubclass("id"),
            ExplosiveInput(),
        )
        for case, binding in enumerate(invalid):
            with self.subTest(case=case):
                self.assert_error(
                    INPUT_INVALID,
                    lambda binding=binding: _plan(
                        shape, valid, (EncodedSegment(binding, 1, Everywhere()),)
                    ),
                )

    def test_profile_and_layout_are_explicit_exact_supported_strings(self) -> None:
        shape = Shape(1, 1)
        valid = (EncodedSegment("valid", 1, Everywhere()),)
        invalid_profiles: tuple[Any, ...] = (
            None,
            "",
            "alpha8-ge129-ceil2x2-max-v1",
            True,
            1,
            StrSubclass(PROFILE),
            ExplosiveInput(),
        )
        invalid_layouts: tuple[Any, ...] = (
            None,
            "",
            "positive-first",
            "cfg-positive-first",
            True,
            2,
            StrSubclass("positive-only"),
            ExplosiveInput(),
        )
        for field, values in (("profile", invalid_profiles), ("layout", invalid_layouts)):
            for case, value in enumerate(values):
                with self.subTest(field=field, case=case):
                    self.assert_error(
                        INPUT_INVALID,
                        lambda field=field, value=value: plan_illustrious_attention(
                            latent_shape=shape,
                            negative=valid,
                            positive=valid,
                            profile=value if field == "profile" else PROFILE,
                            layout=value if field == "layout" else "cfg-negative-first",
                        ),
                    )

    def test_complete_inputs_are_validated_before_first_pyramid_materialization(self) -> None:
        shape = Shape(3, 5)
        first = EncodedSegment("first", 1, Alpha8(shape, bytes(15)))
        valid = (first,)
        # Stable private declaration: _build_pyramid(coverage: Alpha8,
        # shapes: tuple[Shape, ...]) -> AlphaPyramid. Spy only this allocation
        # boundary; all numerical oracle cases use the unmodified implementation.
        bad_last = (
            EncodedSegment("last", 0, Everywhere()),
            EncodedSegment("last", 1, Alpha8(shape, bytes(14))),
            EncodedSegment("last", 1, cast(Any, None)),
            EncodedSegment("first", 1, Everywhere()),
            ExplosiveInput(),
        )
        for layout in ("cfg-negative-first", "positive-only"):
            for sign in ("negative", "positive"):
                for case, last in enumerate(bad_last):
                    with self.subTest(layout=layout, sign=sign, case=case):
                        bad = (first, last)
                        with patch.object(
                            regional,
                            "_build_pyramid",
                            wraps=cast(
                                Callable[[Alpha8, tuple[Shape, ...]], AlphaPyramid],
                                vars(regional)["_build_pyramid"],
                            ),
                        ) as build:
                            self.assert_error(
                                INPUT_INVALID,
                                lambda bad=bad, layout=layout, sign=sign: _plan(
                                    shape,
                                    bad if sign == "negative" else valid,
                                    bad if sign == "positive" else valid,
                                    layout,
                                ),
                            )
                            self.assertEqual(
                                build.call_count,
                                0,
                                "A pyramid was built before complete validation.",
                            )
        # Positive control proves this spy observes actual materialization.
        with patch.object(
            regional,
            "_build_pyramid",
            wraps=cast(
                Callable[[Alpha8, tuple[Shape, ...]], AlphaPyramid],
                vars(regional)["_build_pyramid"],
            ),
        ) as build:
            plan = _plan(shape, valid, valid)
            self.assertEqual(build.call_count, 2)
            self.assertEqual(_levels(plan.positive.segments[0])[0].samples, bytes(15))

    def test_error_diagnostics_do_not_embed_input_ids_or_alpha_planes(self) -> None:
        shape = Shape(1, 1)
        valid = (EncodedSegment("valid", 1, Everywhere()),)
        marker = "PRIVATE_INPUT_MARKER_"
        cases = (
            EncodedSegment(marker * 100, 1, Everywhere()),
            EncodedSegment("id", 1, Alpha8(shape, (marker * 100).encode("ascii"))),
        )
        for case, bad in enumerate(cases):
            with self.subTest(case=case):
                with self.assertRaises(IllustriousRegionalAttentionError) as caught:
                    _plan(shape, valid, (bad,))
                self.assertLessEqual(len(str(caught.exception)), 512)
                self.assertNotIn(marker, str(caught.exception))

    def test_query_rejects_unsupported_or_nonbuiltin_integer_factors(self) -> None:
        shape = Shape(3, 5)
        valid = (EncodedSegment("valid", 1, Everywhere()),)
        plan = _plan(shape, valid, valid)
        invalid: tuple[Any, ...] = (
            0,
            -1,
            3,
            5,
            16,
            True,
            False,
            1.0,
            2.0,
            float("nan"),
            float("inf"),
            "2",
            None,
            IntSubclass(2),
            ExplosiveInput(),
        )
        for case, factor in enumerate(invalid):
            with self.subTest(case=case):
                self.assert_error(
                    QUERY_INVALID,
                    lambda factor=factor: plan.query(factor=factor, shape=shape, key_length=1),
                )

    def test_query_requires_exact_factor_shape_not_query_count_or_square_inference(self) -> None:
        shape = Shape(3, 5)
        valid = (EncodedSegment("valid", 1, Everywhere()),)
        plan = _plan(shape, valid, valid)
        mismatches = (
            (1, Shape(5, 3)),
            (1, Shape(1, 15)),
            (1, Shape(15, 1)),
            (2, Shape(3, 2)),
            (2, Shape(1, 6)),
            (2, Shape(2, 2)),
            (4, Shape(2, 1)),
            (4, Shape(1, 1)),
            (8, Shape(1, 2)),
        )
        for factor, grid in mismatches:
            with self.subTest(factor=factor, height=grid.height, width=grid.width):
                self.assert_error(
                    QUERY_INVALID,
                    lambda factor=factor, grid=grid: plan.query(
                        factor=factor, shape=grid, key_length=1
                    ),
                )

    def test_query_shape_requires_exact_record_and_integer_sides(self) -> None:
        shape = Shape(1, 1)
        valid = (EncodedSegment("valid", 1, Everywhere()),)
        plan = _plan(shape, valid, valid)
        shape_subclass = type("QueryShapeSubclass", (Shape,), {})
        invalid: tuple[Any, ...] = (
            None,
            (1, 1),
            [1, 1],
            {"height": 1, "width": 1},
            shape_subclass(1, 1),
            ExplosiveInput(),
        )
        for case, grid in enumerate(invalid):
            with self.subTest(record_case=case):
                self.assert_error(
                    QUERY_INVALID, lambda grid=grid: plan.query(factor=1, shape=grid, key_length=1)
                )
        invalid_sides: tuple[Any, ...] = (
            True,
            False,
            0,
            -1,
            1.0,
            float("nan"),
            float("inf"),
            None,
            "1",
            IntSubclass(1),
            ExplosiveInput(),
        )
        for case, side in enumerate(invalid_sides):
            for axis in ("height", "width"):
                with self.subTest(side_case=case, axis=axis):
                    grid = Shape(side, 1) if axis == "height" else Shape(1, side)
                    self.assert_error(
                        QUERY_INVALID,
                        lambda grid=grid: plan.query(factor=1, shape=grid, key_length=1),
                    )

    def test_query_actual_key_length_must_be_exact_positive_integer_and_equal_k(self) -> None:
        shape = Shape(1, 1)
        plan = _plan(
            shape, (EncodedSegment("n", 3, Everywhere()),), (EncodedSegment("p", 1, Everywhere()),)
        )
        invalid: tuple[Any, ...] = (
            0,
            -1,
            1,
            2,
            4,
            True,
            False,
            3.0,
            float("nan"),
            float("inf"),
            "3",
            None,
            IntSubclass(3),
            ExplosiveInput(),
        )
        for case, key_length in enumerate(invalid):
            with self.subTest(case=case):
                self.assert_error(
                    QUERY_INVALID,
                    lambda key_length=key_length: plan.query(
                        factor=1, shape=shape, key_length=key_length
                    ),
                )

    def test_range_indices_require_builtin_nonnegative_in_range_integers(self) -> None:
        shape = Shape(2, 3)
        valid = (EncodedSegment("valid", 1, Everywhere()),)
        nonintegers: tuple[Any, ...] = (
            True,
            False,
            0.0,
            1.0,
            float("nan"),
            float("inf"),
            "0",
            None,
            IntSubclass(0),
            ExplosiveInput(),
        )
        for layout, batch_size in (("cfg-negative-first", 2), ("positive-only", 1)):
            plan = _plan(shape, valid, valid, layout)
            for factor, grid, query_count in (
                (1, Shape(2, 3), 6),
                (2, Shape(1, 2), 2),
                (4, Shape(1, 1), 1),
                (8, Shape(1, 1), 1),
            ):
                view = plan.query(factor=factor, shape=grid, key_length=1)
                for case, batch_index in enumerate(nonintegers + (-1, batch_size, batch_size + 1)):
                    with self.subTest(layout=layout, factor=factor, axis="batch", case=case):
                        self.assert_error(
                            QUERY_INVALID,
                            lambda batch_index=batch_index, view=view: view.allowed_ranges(
                                batch_index=batch_index, query_index=0
                            ),
                        )
                for case, query_index in enumerate(
                    nonintegers + (-1, query_count, query_count + 1)
                ):
                    with self.subTest(layout=layout, factor=factor, axis="query", case=case):
                        self.assert_error(
                            QUERY_INVALID,
                            lambda query_index=query_index, view=view: view.allowed_ranges(
                                batch_index=0, query_index=query_index
                            ),
                        )
                for batch_index in range(batch_size):
                    for query_index in (0, query_count - 1):
                        self.assertEqual(
                            _spans(
                                view.allowed_ranges(
                                    batch_index=batch_index, query_index=query_index
                                )
                            ),
                            (("valid", 0, 1),),
                        )

    def test_input_and_output_records_are_frozen_and_slotted(self) -> None:
        expected_fields = (
            (Shape, ("height", "width")),
            (Everywhere, ()),
            (Alpha8, ("shape", "samples")),
            (EncodedSegment, ("binding_id", "encoded_length", "coverage")),
            (TokenRange, ("binding_id", "start", "end")),
            (AlphaLevel, ("factor", "shape", "samples")),
            (AlphaPyramid, ("levels",)),
            (PlannedSegment, ("token_range", "coverage")),
            (SignedPlan, ("sign", "length", "segments")),
            (
                AttentionPlan,
                ("latent_shape", "negative", "positive", "key_length", "batch_signs", "profile"),
            ),
        )
        for record_type, names in expected_fields:
            self.assertEqual(tuple(field.name for field in dataclasses.fields(record_type)), names)
        shape = Shape(1, 2)
        everywhere = Everywhere()
        alpha = Alpha8(shape, b"\x7f\x80")
        encoded = EncodedSegment("p", 2, alpha)
        plan = _plan(shape, (EncodedSegment("n", 1, everywhere),), (encoded,))
        view = plan.query(factor=1, shape=shape, key_length=2)
        planned = plan.positive.segments[0]
        records = (
            shape,
            everywhere,
            alpha,
            encoded,
            planned.token_range,
            _levels(planned)[0],
            planned.coverage,
            planned,
            plan.negative,
            plan.positive,
            plan,
            view,
        )
        self.assertEqual(
            tuple(type(record) for record in records),
            (
                Shape,
                Everywhere,
                Alpha8,
                EncodedSegment,
                TokenRange,
                AlphaLevel,
                AlphaPyramid,
                PlannedSegment,
                SignedPlan,
                SignedPlan,
                AttentionPlan,
                QueryView,
            ),
        )
        for record in records:
            with self.subTest(record_type=type(record).__name__):
                self.assertTrue(dataclasses.is_dataclass(record))
                self.assertTrue(cast(Any, type(record)).__dataclass_params__.frozen)
                self.assertFalse(hasattr(record, "__dict__"))
                for field in dataclasses.fields(record):
                    with self.assertRaises((AttributeError, TypeError)):
                        setattr(record, field.name, getattr(record, field.name))
                with self.assertRaises((AttributeError, TypeError)):
                    cast(Any, record).extra_attribute = 1
        for name in ("factor", "shape", "key_length", "batch_signs"):
            with self.assertRaises((AttributeError, TypeError)):
                setattr(view, name, getattr(view, name))
        self.assert_immutable_tree(plan)
        self.assert_immutable_tree(view)
        self.assert_immutable_tree(view.allowed_ranges(batch_index=1, query_index=1))

    def test_nested_tuples_bytes_and_ranges_reject_ordinary_mutation(self) -> None:
        shape = Shape(1, 2)
        plan = _plan(
            shape,
            (EncodedSegment("n", 1, Everywhere()),),
            (EncodedSegment("p", 2, Alpha8(shape, b"\x00\xff")),),
        )
        view = plan.query(factor=1, shape=shape, key_length=2)
        levels = _levels(plan.positive.segments[0])
        ranges = view.allowed_ranges(batch_index=1, query_index=1)
        with self.assertRaises(TypeError):
            cast(Any, plan.positive.segments)[0] = plan.positive.segments[0]
        with self.assertRaises(TypeError):
            cast(Any, levels)[0] = levels[0]
        with self.assertRaises(TypeError):
            cast(Any, levels[0].samples)[0] = 255
        with self.assertRaises(TypeError):
            cast(Any, plan.batch_signs)[0] = "positive"
        with self.assertRaises(TypeError):
            cast(Any, ranges)[0] = ranges[0]
        with self.assertRaises((AttributeError, TypeError)):
            cast(Any, ranges[0]).start = 99
        self.assertEqual(_spans(view.allowed_ranges(batch_index=1, query_index=1)), (("p", 0, 2),))

    def test_caller_rebinding_does_not_retarget_an_existing_plan(self) -> None:
        shape = Shape(1, 2)
        samples = b"\x00\xff"
        alpha = Alpha8(shape, samples)
        positive = (EncodedSegment("original", 2, alpha),)
        negative = (EncodedSegment("n", 1, Everywhere()),)
        plan = _plan(shape, negative, positive)
        samples = b"\xff\x00"
        alpha = Alpha8(shape, samples)
        positive = (EncodedSegment("replacement", 3, alpha),)
        replacement = _plan(shape, negative, positive)
        old_view = plan.query(factor=1, shape=shape, key_length=2)
        new_view = replacement.query(factor=1, shape=shape, key_length=3)
        self.assertEqual(old_view.allowed_ranges(batch_index=1, query_index=0), ())
        self.assertEqual(
            _spans(old_view.allowed_ranges(batch_index=1, query_index=1)), (("original", 0, 2),)
        )
        self.assertEqual(
            _spans(new_view.allowed_ranges(batch_index=1, query_index=0)), (("replacement", 0, 3),)
        )
        self.assertEqual(new_view.allowed_ranges(batch_index=1, query_index=1), ())
        self.assertEqual(_levels(plan.positive.segments[0])[0].samples, b"\x00\xff")

    def test_repeat_plans_and_queries_remain_independent_without_mutable_cache(self) -> None:
        shape = Shape(3, 5)
        original = bytes((0, 127, 128, 255, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 129))
        negative = (EncodedSegment("n", 1, Everywhere()),)
        positive = (EncodedSegment("p", 3, Alpha8(shape, original)),)
        first = _plan(shape, negative, positive)
        second = _plan(shape, negative, positive)
        self.assertEqual(first, second)
        self.assertIsNot(first, second)
        first_hash, second_hash = hash(first), hash(second)
        for factor in FACTORS:
            grid = Shape((3 + factor - 1) // factor, (5 + factor - 1) // factor)
            first_view = first.query(factor=factor, shape=grid, key_length=3)
            second_view = second.query(factor=factor, shape=grid, key_length=3)
            before = hash(first_view)
            for batch_index in (0, 1):
                for query_index in range(grid.height * grid.width):
                    self.assertEqual(
                        first_view.allowed_ranges(batch_index=batch_index, query_index=query_index),
                        second_view.allowed_ranges(
                            batch_index=batch_index, query_index=query_index
                        ),
                    )
            self.assertEqual(hash(first_view), before)
            self.assert_immutable_tree(first_view)
            self.assert_immutable_tree(second_view)
        self.assertEqual((hash(first), hash(second)), (first_hash, second_hash))
        self.assert_immutable_tree(first)
        self.assert_immutable_tree(second)

    def test_actual_module_factory_and_query_work_in_fresh_isolated_no_site_python(self) -> None:
        """No test recursion, optional package, skip, ML stub or alternate planner."""
        source_root = Path(__file__).resolve().parents[1] / "src"
        script = textwrap.dedent(
            """
            import builtins
            # Bootstrap trusted stdlib support before observing the target.
            # dataclasses -> copy can make an unrelated Jython platform probe.
            import dataclasses
            import importlib.util
            from pathlib import Path
            import sys

            assert sys.flags.isolated == 1 and sys.flags.no_site == 1
            assert sys.dont_write_bytecode
            assert "site" not in sys.modules
            assert not any(
                "site-packages" in entry or "dist-packages" in entry for entry in sys.path
            )
            trusted_source = Path(sys.argv[1]).resolve(strict=True)
            sys.path.insert(0, str(trusted_source))
            allowed_worker = {"imagegen_worker", "imagegen_worker.illustrious_regional_attention"}
            denied = []

            def check_name(name):
                root = name.partition(".")[0]
                permitted = (
                    name in allowed_worker if root == "imagegen_worker"
                    else root in sys.stdlib_module_names or root in sys.builtin_module_names
                )
                if not permitted:
                    denied.append(name)
                    raise ImportError("Dependency forbidden by the isolated numerical contract.")

            original_import = builtins.__import__

            def guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
                resolved = name
                if level:
                    package = (globals or {}).get("__package__", "")
                    resolved = importlib.util.resolve_name("." * level + name, package)
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
            # Verify refusal without loading any of these packages. Clear only
            # guard-control observations before observing the actual module.
            forbidden_controls = (
                "torch", "PIL", "numpy", "pytest", "imagegen_worker.inference",
                "imagegen_worker.protocol", "imagegen_worker.derivatives",
            )
            for name in forbidden_controls:
                try:
                    guarded_import(name)
                except ImportError:
                    pass
                else:
                    raise AssertionError("Import guard accepted a forbidden control.")
            assert tuple(denied) == forbidden_controls
            denied.clear()

            import imagegen_worker.illustrious_regional_attention as target

            assert Path(target.__file__).resolve() == (
                trusted_source / "imagegen_worker" / "illustrious_regional_attention.py"
            )
            shape = target.Shape(2, 2)
            plan = target.plan_illustrious_attention(
                latent_shape=shape,
                negative=(target.EncodedSegment("n", 1, target.Everywhere()),),
                positive=(
                    target.EncodedSegment(
                        "p", 3, target.Alpha8(shape, bytes((127, 128, 0, 255)))
                    ),
                ),
                profile="alpha8-ge128-ceil2x2-max-v1",
                layout="cfg-negative-first",
            )
            assert plan.batch_signs == ("negative", "positive")
            assert plan.key_length == 3
            view = plan.query(factor=1, shape=shape, key_length=3)
            spans = lambda row, query: tuple(
                (item.binding_id, item.start, item.end)
                for item in view.allowed_ranges(batch_index=row, query_index=query)
            )
            assert tuple(spans(0, q) for q in range(4)) == ((("n", 0, 1),),) * 4
            assert tuple(spans(1, q) for q in range(4)) == ((), (("p", 0, 3),), (), (("p", 0, 3),))
            levels = plan.positive.segments[0].coverage.levels
            assert tuple(level.factor for level in levels) == (1, 2, 4, 8)
            assert tuple(level.samples for level in levels) == (
                bytes((127, 128, 0, 255)), b"\\xff", b"\\xff", b"\\xff"
            )
            coarse = plan.query(factor=8, shape=target.Shape(1, 1), key_length=3)
            assert tuple(
                (r.start, r.end)
                for r in coarse.allowed_ranges(batch_index=1, query_index=0)
            ) == ((0, 3),)
            assert denied == [], "The actual module attempted a forbidden import."
            assert {
                name for name in sys.modules
                if name == "imagegen_worker" or name.startswith("imagegen_worker.")
            } == allowed_worker
            forbidden_roots = {"torch", "PIL", "numpy", "pytest", "diffusers", "transformers"}
            assert not any(name.partition(".")[0] in forbidden_roots for name in sys.modules)
            assert "site" not in sys.modules
            assert not any(
                "site-packages" in entry or "dist-packages" in entry for entry in sys.path
            )
            print("STDLIB_ONLY_OK")
            """
        )
        result = subprocess.run(
            [sys.executable, "-I", "-S", "-B", "-c", script, str(source_root)],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        self.assertEqual(result.returncode, 0, f"Isolated Python failed: {result.stderr[:2000]}")
        self.assertEqual(result.stdout, "STDLIB_ONLY_OK\n")
        self.assertEqual(result.stderr, "")
