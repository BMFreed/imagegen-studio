"""Private, CPU-only numerical planning for one concrete signed prompt pair.

Inputs are already encoded lengths and latent-grid alpha8 planes. This module
does not encode text, infer model grids, choose tensor biases or execute attention.
An empty eligible row is a valid diagnostic; a future execution adapter must
reject all-masked execution until its behavior is separately defined and qualified.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

__all__ = (
    "Alpha8",
    "AlphaLevel",
    "AlphaPyramid",
    "AttentionPlan",
    "EncodedSegment",
    "Everywhere",
    "IllustriousRegionalAttentionError",
    "PlannedSegment",
    "QueryView",
    "Shape",
    "SignedPlan",
    "TokenRange",
    "plan_illustrious_attention",
)

_Sign = Literal["negative", "positive"]
_Profile = Literal["alpha8-ge128-ceil2x2-max-v1"]
_Layout = Literal["cfg-negative-first", "positive-only"]
_ErrorCode = Literal[
    "REGIONAL_ATTENTION_INPUT_INVALID",
    "REGIONAL_ATTENTION_LIMIT",
    "REGIONAL_ATTENTION_QUERY_INVALID",
]

_PROFILE: _Profile = "alpha8-ge128-ceil2x2-max-v1"
_FACTORS = (1, 2, 4, 8)
_MAX_SIDE = 256
_MAX_SEGMENTS_PER_SIGN = 16  # Private engineering cap, not public model capacity.
_MAX_SIGN_LENGTH = 308  # Aggregate bound borrowed from the existing 77 x 4 ceiling.
_MAX_BINDING_ID_BYTES = 128
_MAX_RETAINED_ALPHA_SAMPLES = 2_785_280
_MAX_ALPHA_SAMPLE_VISITS = 4_849_664


class IllustriousRegionalAttentionError(ValueError):
    """A bounded diagnostic with a stable private numerical error code."""

    code: _ErrorCode

    def __init__(self, code: _ErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class Shape:
    height: int
    width: int


@dataclass(frozen=True, slots=True)
class Everywhere:
    """Explicit unrestricted spatial support for this segment's actual range."""


@dataclass(frozen=True, slots=True)
class Alpha8:
    shape: Shape
    samples: bytes


@dataclass(frozen=True, slots=True)
class EncodedSegment:
    binding_id: str
    encoded_length: int
    coverage: Everywhere | Alpha8


@dataclass(frozen=True, slots=True)
class TokenRange:
    binding_id: str
    start: int
    end: int


@dataclass(frozen=True, slots=True)
class AlphaLevel:
    factor: int
    shape: Shape
    samples: bytes


@dataclass(frozen=True, slots=True)
class AlphaPyramid:
    levels: tuple[AlphaLevel, ...]


@dataclass(frozen=True, slots=True)
class PlannedSegment:
    token_range: TokenRange
    coverage: Everywhere | AlphaPyramid


@dataclass(frozen=True, slots=True)
class SignedPlan:
    sign: _Sign
    length: int
    segments: tuple[PlannedSegment, ...]


@dataclass(frozen=True, slots=True)
class AttentionPlan:
    latent_shape: Shape
    negative: SignedPlan
    positive: SignedPlan
    key_length: int
    batch_signs: tuple[_Sign, ...]
    profile: _Profile

    def query(self, *, factor: int, shape: Shape, key_length: int) -> QueryView:
        """Bind an explicit rectangular query grid and actual padded key length."""
        if type(factor) is not int or factor not in _FACTORS:
            raise _query_invalid("Query factor must be one of 1, 2, 4 or 8.")
        if (
            type(shape) is not Shape
            or type(shape.height) is not int
            or type(shape.width) is not int
            or shape.height != (self.latent_shape.height + factor - 1) // factor
            or shape.width != (self.latent_shape.width + factor - 1) // factor
        ):
            raise _query_invalid("Query shape must match the explicit factor grid.")
        if type(key_length) is not int or key_length < 1 or key_length != self.key_length:
            raise _query_invalid("Query key length must match the plan's padded key length.")
        return QueryView(factor=factor, shape=shape, key_length=key_length, _plan=self)


@dataclass(frozen=True, slots=True)
class QueryView:
    factor: int
    shape: Shape
    key_length: int
    _plan: AttentionPlan

    @property
    def batch_signs(self) -> tuple[_Sign, ...]:
        return self._plan.batch_signs

    def allowed_ranges(self, *, batch_index: int, query_index: int) -> tuple[TokenRange, ...]:
        """Return eligible actual ranges in stream order, including an empty row."""
        if type(batch_index) is not int or batch_index < 0 or batch_index >= len(self.batch_signs):
            raise _query_invalid("Query batch index is outside the explicit batch layout.")
        if (
            type(query_index) is not int
            or query_index < 0
            or query_index >= self.shape.height * self.shape.width
        ):
            raise _query_invalid("Query index is outside the explicit query grid.")

        sign = self.batch_signs[batch_index]
        signed = self._plan.negative if sign == "negative" else self._plan.positive
        level_index = _FACTORS.index(self.factor)
        allowed: list[TokenRange] = []
        for segment in signed.segments:
            coverage = segment.coverage
            if (
                isinstance(coverage, Everywhere)
                or coverage.levels[level_index].samples[query_index] >= 128
            ):
                allowed.append(segment.token_range)
        return tuple(allowed)


def _input_invalid(message: str) -> IllustriousRegionalAttentionError:
    return IllustriousRegionalAttentionError("REGIONAL_ATTENTION_INPUT_INVALID", message)


def _limit(message: str) -> IllustriousRegionalAttentionError:
    return IllustriousRegionalAttentionError("REGIONAL_ATTENTION_LIMIT", message)


def _query_invalid(message: str) -> IllustriousRegionalAttentionError:
    return IllustriousRegionalAttentionError("REGIONAL_ATTENTION_QUERY_INVALID", message)


def _validate_shape(shape: Shape) -> None:
    if (
        type(shape) is not Shape
        or type(shape.height) is not int
        or type(shape.width) is not int
        or shape.height < 1
        or shape.width < 1
    ):
        raise _input_invalid("Input shape requires exact positive integer sides.")
    if shape.height > _MAX_SIDE or shape.width > _MAX_SIDE:
        raise _limit("Input shape exceeds the private per-side limit.")


def _validate_binding_id(binding_id: str) -> None:
    if type(binding_id) is not str or not binding_id:
        raise _input_invalid("Binding ID must be an exact nonempty string.")
    # A character precheck bounds the temporary UTF-8 encoding, even on refusal.
    if len(binding_id) > _MAX_BINDING_ID_BYTES:
        raise _limit("Binding ID exceeds the private UTF-8 byte limit.")
    try:
        encoded_id = binding_id.encode("utf-8", errors="strict")
    except UnicodeEncodeError:
        raise _input_invalid("Binding ID must contain valid UTF-8 text.") from None
    if len(encoded_id) > _MAX_BINDING_ID_BYTES:
        raise _limit("Binding ID exceeds the private UTF-8 byte limit.")


def _validate_sign(segments: tuple[EncodedSegment, ...], latent_shape: Shape) -> tuple[int, int]:
    if type(segments) is not tuple or not segments:
        raise _input_invalid("Each sign requires an exact nonempty segment tuple.")
    if len(segments) > _MAX_SEGMENTS_PER_SIGN:
        raise _limit("A sign exceeds the private segment count limit.")

    binding_ids: set[str] = set()
    length = 0
    alpha_planes = 0
    for segment in segments:
        if type(segment) is not EncodedSegment:
            raise _input_invalid("Each segment must be an exact EncodedSegment record.")
        _validate_binding_id(segment.binding_id)
        if segment.binding_id in binding_ids:
            raise _input_invalid("Binding IDs must be unique within each sign.")
        binding_ids.add(segment.binding_id)
        if type(segment.encoded_length) is not int or segment.encoded_length < 1:
            raise _input_invalid("Encoded segment length must be an exact positive integer.")
        if segment.encoded_length > _MAX_SIGN_LENGTH - length:
            raise _limit("A sign exceeds the private aggregate encoded length limit.")
        length += segment.encoded_length

        coverage = segment.coverage
        if type(coverage) is Everywhere:
            continue
        if type(coverage) is not Alpha8:
            raise _input_invalid("Coverage must be an exact Everywhere or Alpha8 record.")
        _validate_shape(coverage.shape)
        if coverage.shape != latent_shape:
            raise _input_invalid("Alpha8 shape must exactly match the latent grid.")
        if type(coverage.samples) is not bytes:
            raise _input_invalid("Alpha8 samples must be exact immutable bytes.")
        if len(coverage.samples) != latent_shape.height * latent_shape.width:
            raise _input_invalid("Alpha8 sample length must exactly match the latent grid.")
        alpha_planes += 1
    return length, alpha_planes


def _preflight(latent_shape: Shape, alpha_planes: int) -> tuple[Shape, ...]:
    """Compute representation/work bounds before any alpha materialization.

    Retention is planes * sum(Hf * Wf). The visit ceiling is planes *
    (H1 * W1 + 4 * sum(coarse Hf * Wf)); missing edge cells require no read.
    At 32 planes of 256 x 256 these are exactly the constants below. They are
    sample/work bounds, not RSS estimates or measured model capacity.
    """
    shapes = tuple(
        Shape(
            height=(latent_shape.height + factor - 1) // factor,
            width=(latent_shape.width + factor - 1) // factor,
        )
        for factor in _FACTORS
    )
    areas = tuple(shape.height * shape.width for shape in shapes)
    retained_samples = alpha_planes * sum(areas)
    sample_visits = alpha_planes * (areas[0] + 4 * sum(areas[1:]))
    if retained_samples > _MAX_RETAINED_ALPHA_SAMPLES or sample_visits > _MAX_ALPHA_SAMPLE_VISITS:
        raise _limit("Alpha pyramid representation or work exceeds the private limits.")
    return shapes


def _pool_max(source: AlphaLevel, target_shape: Shape) -> bytes:
    """Preserve raw alpha8 maxima over existing cells of each ceil 2 x 2 block."""
    height, width = source.shape.height, source.shape.width
    # Alpha8 is nonnegative, so omitting missing edge cells equals zero padding.
    return bytes(
        max(
            source.samples[row * width + column]
            for row in range(2 * y, min(2 * y + 2, height))
            for column in range(2 * x, min(2 * x + 2, width))
        )
        for y in range(target_shape.height)
        for x in range(target_shape.width)
    )


def _build_pyramid(coverage: Alpha8, shapes: tuple[Shape, ...]) -> AlphaPyramid:
    levels = [AlphaLevel(factor=1, shape=shapes[0], samples=coverage.samples)]
    for factor, shape in zip(_FACTORS[1:], shapes[1:], strict=True):
        samples = _pool_max(levels[-1], shape)
        levels.append(AlphaLevel(factor=factor, shape=shape, samples=samples))
    return AlphaPyramid(levels=tuple(levels))


def _plan_sign(
    sign: _Sign,
    encoded: tuple[EncodedSegment, ...],
    length: int,
    shapes: tuple[Shape, ...],
) -> SignedPlan:
    planned: list[PlannedSegment] = []
    start = 0
    for segment in encoded:
        end = start + segment.encoded_length
        coverage = segment.coverage
        planned_coverage = (
            _build_pyramid(coverage, shapes) if isinstance(coverage, Alpha8) else coverage
        )
        planned.append(
            PlannedSegment(
                token_range=TokenRange(binding_id=segment.binding_id, start=start, end=end),
                coverage=planned_coverage,
            )
        )
        start = end
    return SignedPlan(sign=sign, length=length, segments=tuple(planned))


def plan_illustrious_attention(
    *,
    latent_shape: Shape,
    negative: tuple[EncodedSegment, ...],
    positive: tuple[EncodedSegment, ...],
    profile: _Profile,
    layout: _Layout,
) -> AttentionPlan:
    """Plan one pair, retaining both signs even for a positive-only query batch.

    Both complete input streams are validated before the first alpha pyramid is
    materialized. Segment lengths are actual pre-padding encoded lengths, with
    no chunk-multiple rule. Padding is never represented by an eligible range.
    Immutable inputs need no detachment; mutable callers must create bytes first.
    """
    _validate_shape(latent_shape)
    if type(profile) is not str or profile != _PROFILE:
        raise _input_invalid("Attention profile is unsupported.")
    if type(layout) is not str or layout not in ("cfg-negative-first", "positive-only"):
        raise _input_invalid("Attention batch layout is unsupported.")

    negative_length, negative_planes = _validate_sign(negative, latent_shape)
    positive_length, positive_planes = _validate_sign(positive, latent_shape)
    shapes = _preflight(latent_shape, negative_planes + positive_planes)
    batch_signs: tuple[_Sign, ...] = (
        ("negative", "positive") if layout == "cfg-negative-first" else ("positive",)
    )
    return AttentionPlan(
        latent_shape=latent_shape,
        negative=_plan_sign("negative", negative, negative_length, shapes),
        positive=_plan_sign("positive", positive, positive_length, shapes),
        key_length=max(negative_length, positive_length),
        batch_signs=batch_signs,
        profile=profile,
    )
