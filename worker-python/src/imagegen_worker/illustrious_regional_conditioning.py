"""Private one-shot bridge from declared encoded bindings to native attention.

The plan and consumed context derive from the same ordered, sign-local records.
Raw tensors cannot establish text provenance. Caller tensors remain borrowed
until snapshots; callers must not concurrently mutate them during validation or
copying. All consumed inputs own storage before any model hook can run.
Late prehooks reject different-valued replacements at the root and every attn2;
equal-valued clones are supported. This remains cooperative: hooks must not
mutate owned tensors in place or change hooks/processors during the call.

Only the pinned CPU float32 / cuda:0 float16 profiles are supported. No encoding,
denoising loop, production request, composition policy or reusable tensor bank is introduced.
"""

from __future__ import annotations

import inspect
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Literal, cast

from .illustrious_regional_attention import (
    Alpha8,
    EncodedSegment,
    Everywhere,
    IllustriousRegionalAttentionError,
    Shape,
    _preflight,  # pyright: ignore[reportPrivateUsage]
    _validate_shape,  # pyright: ignore[reportPrivateUsage]
    _validate_sign,  # pyright: ignore[reportPrivateUsage]
    plan_illustrious_attention,
)
from .illustrious_regional_attention_adapter import (
    TransformerBinding,
    _load_native,  # pyright: ignore[reportPrivateUsage]
    _tensor_policy,  # pyright: ignore[reportPrivateUsage]
    _TensorProfile,  # pyright: ignore[reportPrivateUsage]
    scoped_illustrious_regional_attention,
    validate_illustrious_regional_attention,
)

__all__ = (
    "EncodedTensorBinding",
    "IllustriousRegionalConditioningError",
    "SdxlTensorBindings",
    "encoded_bindings_from_sdxl_conditioning",
    "run_illustrious_regional_conditioning",
)

_Code = Literal["PROFILE_INVALID", "INPUT_INVALID", "LIMIT"]
_Layout = Literal["cfg-negative-first", "positive-only"]
_MAX_STREAMS = 16
_MAX_SIGN_LENGTH = 308
_CONTEXT_WIDTH = 2048
_POOLED_WIDTH = 1280
_MAX_SAMPLE_BYTES = 32 * 1024 * 1024
_MAX_FINITE_ELEMENTS = _MAX_SAMPLE_BYTES // 4


class IllustriousRegionalConditioningError(ValueError):
    """Finite bridge diagnostic; adapter and native exceptions pass through."""

    code: _Code

    def __init__(self, code: _Code, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class EncodedTensorBinding:
    binding_id: str
    context: Any
    coverage: Everywhere | Alpha8
    pooled: Any | None = None


@dataclass(frozen=True, slots=True)
class SdxlTensorBindings:
    negative: EncodedTensorBinding
    positive: EncodedTensorBinding


def _require(condition: bool, code: _Code, message: str) -> None:
    if not condition:
        raise IllustriousRegionalConditioningError(code, message)


def _numerical_error(
    error: IllustriousRegionalAttentionError,
) -> IllustriousRegionalConditioningError:
    code: _Code = "LIMIT" if error.code == "REGIONAL_ATTENTION_LIMIT" else "INPUT_INVALID"
    return IllustriousRegionalConditioningError(code, str(error))


def _grid(shape: Shape) -> None:
    try:
        _validate_shape(shape)
    except IllustriousRegionalAttentionError as error:
        raise _numerical_error(error) from error


def _native(tensor_profile: _TensorProfile = "cpu-float32-v1") -> tuple[Any, ...]:
    native = _load_native()
    torch = native[0]
    policy = _tensor_policy(torch, tensor_profile)
    _require(
        not torch.is_grad_enabled()
        and not torch.is_autocast_enabled("cpu")
        and (policy.device.type != "cuda" or not torch.is_autocast_enabled("cuda")),
        "PROFILE_INVALID",
        "Autograd and profile autocast must be disabled.",
    )
    return native


def _tensor(
    torch: Any,
    value: Any,
    rank: int,
    tensor_profile: _TensorProfile = "cpu-float32-v1",
    *,
    timestep: bool = False,
) -> None:
    policy = _tensor_policy(torch, tensor_profile)
    _require(
        type(value) is torch.Tensor
        and value.device == policy.device
        and value.dtype == (torch.float32 if timestep else policy.dtype)
        and value.layout == torch.strided
        and value.ndim == rank
        and value.requires_grad is False,
        "INPUT_INVALID",
        "Expected an exact selected-profile strided tensor with no gradient requirement; "
        "the timestep role remains float32.",
    )


def _pooled(torch: Any, value: Any, tensor_profile: _TensorProfile = "cpu-float32-v1") -> None:
    _tensor(torch, value, 2, tensor_profile)
    _require(tuple(value.shape) == (1, _POOLED_WIDTH), "INPUT_INVALID", "Invalid pooled shape.")


def _sign(
    torch: Any,
    records: tuple[EncodedTensorBinding, ...],
    shape: Shape,
    tensor_profile: _TensorProfile = "cpu-float32-v1",
) -> tuple[tuple[EncodedSegment, ...], int, int]:
    """Metadata-only validation, reusing the numerical ID/coverage/budget rules."""
    _require(
        type(records) is tuple and bool(records),
        "INPUT_INVALID",
        "Each sign requires an exact nonempty binding tuple.",
    )
    _require(len(records) <= _MAX_STREAMS, "LIMIT", "A sign exceeds 16 streams.")
    segments: list[EncodedSegment] = []
    for record in records:
        _require(
            type(record) is EncodedTensorBinding,
            "INPUT_INVALID",
            "Expected an exact EncodedTensorBinding record.",
        )
        context = record.context
        _tensor(torch, context, 3, tensor_profile)
        _require(
            context.shape[0] == 1 and context.shape[1] >= 1 and context.shape[2] == _CONTEXT_WIDTH,
            "INPUT_INVALID",
            "Context must have shape [1,L,2048] with positive L.",
        )
        if record.pooled is not None:
            _pooled(torch, record.pooled, tensor_profile)
        segments.append(EncodedSegment(record.binding_id, context.shape[1], record.coverage))
    encoded = tuple(segments)
    try:
        length, planes = _validate_sign(encoded, shape)
    except IllustriousRegionalAttentionError as error:
        raise _numerical_error(error) from error
    return encoded, length, planes


def _finite(torch: Any, value: Any) -> None:
    # Structural preflight bounds every input first. Sequential isfinite calls
    # have at most 8,388,608 Boolean result elements (sample), not an RSS bound.
    _require(
        value.numel() <= _MAX_FINITE_ELEMENTS,
        "LIMIT",
        "Finite-value validation exceeds its logical element bound.",
    )
    _require(torch.isfinite(value).all().item(), "INPUT_INVALID", "Tensor values must be finite.")


def _finite_sign(torch: Any, records: tuple[EncodedTensorBinding, ...]) -> None:
    for record in records:
        _finite(torch, record.context)
        if record.pooled is not None:
            _finite(torch, record.pooled)


def _pool_source(records: tuple[EncodedTensorBinding, ...], source_id: str | None) -> Any:
    _require(type(source_id) is str, "INPUT_INVALID", "Both signed pooled source IDs are required.")
    for record in records:
        if record.binding_id == source_id:
            _require(record.pooled is not None, "INPUT_INVALID", "Selected source has no pool.")
            return record.pooled
    raise IllustriousRegionalConditioningError("INPUT_INVALID", "Pooled source ID is absent.")


def _owned_value(torch: Any, actual: Any, expected: Any, name: str) -> None:
    if expected is None:
        _require(actual is None, "INPUT_INVALID", f"Consumed {name} must remain None.")
        return
    _require(
        type(actual) is torch.Tensor
        and actual.device == expected.device
        and actual.layout == torch.strided
        and actual.dtype == expected.dtype
        and tuple(actual.shape) == tuple(expected.shape)
        and actual.requires_grad is False,
        "INPUT_INVALID",
        f"Consumed {name} must retain its owned tensor profile and shape.",
    )
    # Identity is safe only under the cooperative no-owned-in-place-mutation rule.
    _require(
        actual is expected or torch.equal(actual, expected),
        "INPUT_INVALID",
        f"Consumed {name} differs from the owned conditioning input.",
    )


@contextmanager
def _scoped_value_guards(
    root: Any,
    *,
    torch: Any,
    bindings: tuple[TransformerBinding, ...],
    sample: Any,
    context: Any,
    mask: Any,
    timestep: Any,
    pools: Any,
    time_ids: Any,
) -> Generator[None]:
    """Observe final hook arguments without rewriting them or copying tensors.

    Enter inside the adapter scope so these hooks run after existing prehooks,
    within its call-entry failure latch. Journal setup as well as execution.
    """
    handles: list[Any] = []

    def install(module: Any, expected: dict[str, Any]) -> None:
        signature = inspect.signature(cast(Any, type(module)).forward)

        def before(current: Any, args: tuple[Any, ...], kwargs: dict[str, Any]) -> None:
            try:
                bound = signature.bind(current, *args, **kwargs)
            except TypeError as error:
                raise IllustriousRegionalConditioningError("INPUT_INVALID", str(error)) from error
            bound.apply_defaults()
            for name, value in expected.items():
                _owned_value(torch, bound.arguments.get(name), value, name)
            if current is root and pools is not None:
                added = bound.arguments.get("added_cond_kwargs")
                _require(
                    type(added) is dict and added.keys() == {"text_embeds", "time_ids"},
                    "INPUT_INVALID",
                    "Consumed SDXL added conditioning must retain exactly text_embeds/time_ids.",
                )
                conditions = cast(dict[str, Any], added)
                _owned_value(torch, conditions["text_embeds"], pools, "text_embeds")
                _owned_value(torch, conditions["time_ids"], time_ids, "time_ids")

        handles.append(module.register_forward_pre_hook(before, with_kwargs=True, prepend=False))

    try:
        expected = {
            "sample" if pools is not None else "hidden_states": sample,
            "encoder_hidden_states": context,
            "encoder_attention_mask": mask,
        }
        if pools is not None:
            expected["timestep"] = timestep
        install(root, expected)
        for binding in bindings:
            for block in binding.transformer.transformer_blocks:
                install(block.attn2, {"encoder_hidden_states": context})
        yield
    finally:
        for handle in reversed(handles):
            handle.remove()


def _root_inputs(
    native: tuple[Any, ...],
    root: Any,
    bindings: tuple[TransformerBinding, ...],
    shape: Shape,
    batch: int,
    keys: int,
    sample: Any,
    timestep: Any,
    time_ids: Any,
    negative: tuple[EncodedTensorBinding, ...],
    positive: tuple[EncodedTensorBinding, ...],
    negative_source: str | None,
    positive_source: str | None,
    mask: Any,
    tensor_profile: _TensorProfile = "cpu-float32-v1",
) -> tuple[Any, Any] | None:
    torch, transformer_type, unet_type = native[:3]
    policy = _tensor_policy(torch, tensor_profile)
    _require(
        type(root) in (transformer_type, unet_type),
        "PROFILE_INVALID",
        "Root must have an exact supported native model type.",
    )
    _require(
        type(bindings) is tuple and bool(bindings),
        "INPUT_INVALID",
        "Transformer bindings must be an exact nonempty tuple.",
    )
    for binding in bindings:
        _require(
            type(binding) is TransformerBinding
            and type(binding.transformer) is transformer_type
            and type(binding.factor) is int
            and binding.factor in (1, 2, 4, 8),
            "INPUT_INVALID",
            "Invalid native transformer binding or factor.",
        )
        width = binding.transformer.config.cross_attention_dim
        _require(
            type(width) is int and width == _CONTEXT_WIDTH,
            "PROFILE_INVALID",
            "Every bound transformer requires context width 2048.",
        )
    config = root.config
    selected = None
    if type(root) is transformer_type:
        _require(
            timestep is None
            and time_ids is None
            and negative_source is None
            and positive_source is None,
            "INPUT_INVALID",
            "Transformer calls require no timestep, time IDs or pooled source selections.",
        )
        _require(
            len(bindings) == 1 and bindings[0].transformer is root,
            "INPUT_INVALID",
            "A Transformer root requires its single explicit binding.",
        )
        factor = bindings[0].factor
        height, width = (shape.height + factor - 1) // factor, (shape.width + factor - 1) // factor
        channels = root.in_channels
        _require(
            type(channels) is int and channels > 0,
            "PROFILE_INVALID",
            "Transformer input channels must be positive.",
        )
    else:
        addition_dim = getattr(config, "addition_time_embed_dim", None)
        _require(
            type(config.in_channels) is int
            and config.in_channels == 4
            and type(config.out_channels) is int
            and config.out_channels == 4
            and type(config.cross_attention_dim) is int
            and config.cross_attention_dim == _CONTEXT_WIDTH
            and config.addition_embed_type == "text_time"
            and type(addition_dim) is int
            and addition_dim > 0
            and type(config.projection_class_embeddings_input_dim) is int
            and config.projection_class_embeddings_input_dim == _POOLED_WIDTH + 6 * addition_dim
            and root.add_embedding.linear_1.in_features
            == config.projection_class_embeddings_input_dim
            and root.class_embedding is None,
            "PROFILE_INVALID",
            "UNet requires the standard four-channel SDXL text_time conditioning profile.",
        )
        _tensor(torch, timestep, 0, tensor_profile, timestep=True)
        _tensor(torch, time_ids, 2, tensor_profile)
        _require(tuple(time_ids.shape) == (batch, 6), "INPUT_INVALID", "Invalid SDXL time IDs.")
        selected = (
            _pool_source(negative, negative_source),
            _pool_source(positive, positive_source),
        )
        height, width, channels = shape.height, shape.width, 4
    _tensor(torch, sample, 4, tensor_profile)
    _require(
        tuple(sample.shape) == (batch, channels, height, width),
        "INPUT_INVALID",
        "Sample batch/channels/grid must match the explicit root binding and layout.",
    )
    _require(
        sample.numel() * sample.element_size() <= _MAX_SAMPLE_BYTES,
        "LIMIT",
        "Sample snapshot exceeds the private 32 MiB logical byte limit.",
    )
    if mask is not None:
        _require(
            type(mask) is torch.Tensor
            and mask.device == policy.device
            and mask.layout == torch.strided
            and mask.dtype in (torch.bool, policy.dtype)
            and mask.requires_grad is False
            and tuple(mask.shape) == (batch, keys),
            "INPUT_INVALID",
            "Root encoder attention mask must be selected-device bool/float [B,K] key permissions.",
        )
    return selected


def encoded_bindings_from_sdxl_conditioning(
    binding_id: str,
    conditioning: Any,
    *,
    negative_coverage: Everywhere | Alpha8,
    positive_coverage: Everywhere | Alpha8,
    tensor_profile: _TensorProfile = "cpu-float32-v1",
) -> SdxlTensorBindings:
    """Own the producer's actual signed slices, removing only recorded tail padding.

    Paired fields and true lengths are encoder-provided metadata, not proof of
    textual provenance. Actual zero rows, including empty text's 77 rows, remain.
    """
    from .inference import SdxlConditioning

    torch = _native(tensor_profile)[0]
    _require(
        type(conditioning) is SdxlConditioning,
        "INPUT_INVALID",
        "Expected the exact existing SdxlConditioning record.",
    )
    _tensor(torch, conditioning.negative, 3, tensor_profile)
    _tensor(torch, conditioning.positive, 3, tensor_profile)
    common = conditioning.negative.shape[1]
    _require(
        tuple(conditioning.negative.shape) == (1, common, _CONTEXT_WIDTH)
        and tuple(conditioning.positive.shape) == (1, common, _CONTEXT_WIDTH),
        "INPUT_INVALID",
        "Paired contexts must share shape [1,K,2048].",
    )
    _require(common <= _MAX_SIGN_LENGTH, "LIMIT", "Paired conditioning K exceeds 308.")
    lengths = (conditioning.negative_length, conditioning.positive_length)
    _require(
        all(type(length) is int and 1 <= length <= common for length in lengths)
        and common == max(lengths),
        "INPUT_INVALID",
        "Producer true lengths must be positive exact integers with K equal to their maximum.",
    )
    sources = (
        EncodedTensorBinding(
            binding_id, conditioning.negative, negative_coverage, conditioning.negative_pooled
        ),
        EncodedTensorBinding(
            binding_id, conditioning.positive, positive_coverage, conditioning.positive_pooled
        ),
    )
    # Coverage is checked against its own explicit grid here; the one-shot call
    # subsequently requires both signs to match its explicit latent grid.
    for record in sources:
        shape = record.coverage.shape if type(record.coverage) is Alpha8 else Shape(1, 1)
        _grid(shape)
        _sign(torch, (record,), shape, tensor_profile)
        _pooled(torch, record.pooled, tensor_profile)
    for record, length in zip(sources, lengths, strict=True):
        _finite_sign(torch, (record,))
        _require(
            torch.count_nonzero(record.context[:, length:, :]).item() == 0,
            "INPUT_INVALID",
            "Producer-recorded cross-sign padding must be zero.",
        )
    owned = tuple(
        EncodedTensorBinding(
            record.binding_id,
            record.context[:, :length, :].clone(memory_format=torch.contiguous_format),
            record.coverage,
            cast(Any, record.pooled).clone(memory_format=torch.contiguous_format),
        )
        for record, length in zip(sources, lengths, strict=True)
    )
    return SdxlTensorBindings(negative=owned[0], positive=owned[1])


def _assemble_owned_conditioning(
    torch: Any,
    *,
    negative: tuple[EncodedTensorBinding, ...],
    positive: tuple[EncodedTensorBinding, ...],
    signs: tuple[str, ...],
    keys: int,
    selected: tuple[Any, Any] | None,
    tensor_profile: _TensorProfile = "cpu-float32-v1",
) -> tuple[Any, Any]:
    """Fill private owned rows from the same validated records as their plan.

    No reusable bank escapes a consumer. Two signed context rows use at most
    2*308*2048*4 = 5,046,272 bytes; selected pools add 2*1280*4 = 10,240.
    CUDA half payloads are 2,523,136 + 5,120 = 2,528,256 bytes. These are
    payload counts, not RSS/VRAM guarantees; finite scratch ceilings stay fixed.
    Views and native pipeline concatenation have separate lifetimes/workspaces.
    """
    policy = _tensor_policy(torch, tensor_profile)
    # Validate BOTH signs and both selected pools before allocation or copy_:
    # copy_ silently accepts a mismatched source device/dtype by converting it.
    for records in (negative, positive):
        for record in records:
            _tensor(torch, record.context, 3, tensor_profile)
            _require(
                record.context.shape[0] == 1
                and 1 <= record.context.shape[1] <= keys
                and record.context.shape[2] == _CONTEXT_WIDTH,
                "INPUT_INVALID",
                "Owned assembly requires validated signed context shapes.",
            )
    if selected is not None:
        for source in selected:
            _pooled(torch, source, tensor_profile)
    context = torch.zeros(
        (len(signs), keys, _CONTEXT_WIDTH), dtype=policy.dtype, device=policy.device
    )
    pools = (
        None
        if selected is None
        else torch.empty((len(signs), _POOLED_WIDTH), dtype=policy.dtype, device=policy.device)
    )
    for row, sign in enumerate(signs):
        records = negative if sign == "negative" else positive
        cursor = 0
        for record in records:
            length = record.context.shape[1]
            context[row : row + 1, cursor : cursor + length, :].copy_(record.context)
            cursor += length
        if selected is not None:
            source = selected[0] if sign == "negative" else selected[1]
            cast(Any, pools)[row : row + 1].copy_(source)
    return context, pools


def run_illustrious_regional_conditioning(
    root: Any,
    *,
    negative: tuple[EncodedTensorBinding, ...],
    positive: tuple[EncodedTensorBinding, ...],
    latent_shape: Shape,
    layout: _Layout,
    bindings: tuple[TransformerBinding, ...],
    sample: Any,
    timestep: Any = None,
    time_ids: Any = None,
    negative_pooled_source_id: str | None = None,
    positive_pooled_source_id: str | None = None,
    encoder_attention_mask: Any = None,
    tensor_profile: _TensorProfile = "cpu-float32-v1",
) -> Any:
    """Snapshot declared bindings and consume them in one normal native forward.

    Both signs are fully validated in either layout; whole-sign terminal padding
    uses their common K. No values are trimmed, reordered or automatically global.
    The returned object is the original native result after scope restoration.
    """
    native = _native(tensor_profile)
    torch = native[0]
    policy = _tensor_policy(torch, tensor_profile)
    _grid(latent_shape)
    _require(
        type(layout) is str and layout in ("cfg-negative-first", "positive-only"),
        "INPUT_INVALID",
        "Unsupported explicit batch layout.",
    )
    neg_segments, neg_length, neg_planes = _sign(torch, negative, latent_shape, tensor_profile)
    pos_segments, pos_length, pos_planes = _sign(torch, positive, latent_shape, tensor_profile)
    try:
        _preflight(latent_shape, neg_planes + pos_planes)
    except IllustriousRegionalAttentionError as error:
        raise _numerical_error(error) from error
    keys = max(neg_length, pos_length)
    batch = 2 if layout == "cfg-negative-first" else 1
    selected = _root_inputs(
        native,
        root,
        bindings,
        latent_shape,
        batch,
        keys,
        sample,
        timestep,
        time_ids,
        negative,
        positive,
        negative_pooled_source_id,
        positive_pooled_source_id,
        encoder_attention_mask,
        tensor_profile,
    )
    plan = plan_illustrious_attention(
        latent_shape=latent_shape,
        negative=neg_segments,
        positive=pos_segments,
        profile="alpha8-ge128-ceil2x2-max-v1",
        layout=layout,
    )
    # Read-only validation reserves nothing. Scope entry repeats the complete
    # native preflight before its existing, exclusively owned model mutations.
    validate_illustrious_regional_attention(
        root, bindings=bindings, plan=plan, tensor_profile=tensor_profile
    )
    for binding in bindings:
        _require(
            all(
                block.attn2.to_k.in_features == _CONTEXT_WIDTH
                for block in binding.transformer.transformer_blocks
            ),
            "PROFILE_INVALID",
            "Native cross-attention projections require context width 2048.",
        )

    # Complete native model/profile checks also precede bounded finite scratch.
    _finite_sign(torch, negative)
    _finite_sign(torch, positive)
    _finite(torch, sample)
    if selected is not None:
        _finite(torch, timestep)
        _finite(torch, time_ids)
    if encoder_attention_mask is not None and encoder_attention_mask.dtype == policy.dtype:
        _require(
            (encoder_attention_mask.eq(0) | encoder_attention_mask.eq(1)).all().item(),
            "INPUT_INVALID",
            "Root encoder attention mask must contain only binary 0/1 permissions.",
        )

    # One directly filled bank: contexts/pools <= 5,056,512 bytes for CPU CFG,
    # or 2,528,256 bytes for CUDA half. These are payload bounds, not RSS/VRAM estimates;
    # sample <= 32 MiB, tiny time/mask copies and alpha/adapter budgets are separate.
    context, owned_pools = _assemble_owned_conditioning(
        torch,
        negative=negative,
        positive=positive,
        signs=plan.batch_signs,
        keys=keys,
        selected=selected,
        tensor_profile=tensor_profile,
    )
    owned_sample = sample.clone(memory_format=torch.contiguous_format)
    owned_mask = (
        None
        if encoder_attention_mask is None
        else encoder_attention_mask.clone(memory_format=torch.contiguous_format)
    )
    owned_time_ids = owned_timestep = None
    if selected is not None:
        owned_time_ids = time_ids.clone(memory_format=torch.contiguous_format)
        owned_timestep = timestep.clone()
    # Enter the adapter first; remove value guards before its restoration.
    with (
        scoped_illustrious_regional_attention(
            root, bindings=bindings, plan=plan, tensor_profile=tensor_profile
        ),
        _scoped_value_guards(
            root,
            torch=torch,
            bindings=bindings,
            sample=owned_sample,
            context=context,
            mask=owned_mask,
            timestep=owned_timestep,
            pools=owned_pools,
            time_ids=owned_time_ids,
        ),
    ):
        if selected is None:
            result = root(
                owned_sample,
                encoder_hidden_states=context,
                encoder_attention_mask=owned_mask,
            )
        else:
            result = root(
                owned_sample,
                timestep=owned_timestep,
                encoder_hidden_states=context,
                encoder_attention_mask=owned_mask,
                added_cond_kwargs={"text_embeds": owned_pools, "time_ids": owned_time_ids},
            )
    return result
