"""Private tensor mechanics; no inference/worker integration or model claim.

Supported native profile: Torch 2.7.1 (including its local build suffix),
Diffusers 0.40.0, exact UNet2DConditionModel/continuous Transformer2DModel,
ordinary layer-norm BasicTransformerBlocks, exact Attention/AttnProcessor2_0.
All model modules must be in eval mode. The explicit profiles require CPU
float32 or exact cuda:0 float16 floating state/inputs, with autograd and CPU
autocast disabled; CUDA also requires CUDA autocast disabled. The CPU profile
never queries CUDA. Imports of ML packages are lazy.

At attn2, existing masks have the finite shapes [B, 1|Q, K],
[B*heads, 1|Q, K], or [B, 1|heads, 1|Q, K]. They are selected-device Boolean
permissions (True means allowed), or selected-float additive masks containing only 0, -10000,
and -inf. No other bias, broadcasting, rank or dtype is accepted. Native parent
APIs may first convert their own binary rank-two masks into this representation.
Every call intersects spatial support, sign padding and the existing mask by
head, including equal-length contexts, and rejects any empty effective row.

The 32*1024*1024 ceiling bounds *each expanded Boolean mask's logical elements*,
including heads. It is checked for every binding before model mutation and
again before per-call allocation. It is not a total-memory/workspace bound:
validating an additive mask can temporarily use three input-sized Boolean
buffers; combining masks retains one permission buffer plus the expanded mask
(and a possible Boolean reshape copy). Spatial segment scratch is at most Q
elements. Nothing is cached across calls/layers; the final native mask is a view.

The scope exclusively reserves all reachable root module identities. Nested or
concurrent scopes conflict only when their module identities overlap; fully
disjoint roots may nest or run on separate threads. Callers
must cooperate: do not modify topology, processors, hooks, tensor state, or
forward implementations, compile or serialize models during a scope, or share
its models with other forward callers. Forward calls belong to the entering
thread and cannot reenter an active module. Scoped per-instance _call_impl
wrappers own frames before native hooks and unwind them in finally; a failed
scope refuses further use and restores on context exit. Only instance call-entry
slots, owned prehooks and cross-attention processors are changed/restored. Self
processors, existing hooks, training flags and global Torch/SDPA functions are
untouched.

The caller supplies binding factors and already encoded tensor streams whose
ranges/signs correspond to the plan. This trusted semantic correspondence cannot
be established from tensor shapes. No tensor assembly or automatic global exists.
"""

from __future__ import annotations

import inspect
import threading
from collections.abc import Callable, Generator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Literal, cast

from .illustrious_regional_attention import (
    Alpha8,
    AlphaLevel,
    AlphaPyramid,
    AttentionPlan,
    EncodedSegment,
    Everywhere,
    IllustriousRegionalAttentionError,
    PlannedSegment,
    Shape,
    SignedPlan,
    TokenRange,
    plan_illustrious_attention,
)

__all__ = (
    "IllustriousRegionalAdapterError",
    "TransformerBinding",
    "scoped_illustrious_regional_attention",
    "validate_illustrious_regional_attention",
)

_Code = Literal["PROFILE_INVALID", "INPUT_INVALID", "ALL_MASKED", "LIMIT", "SCOPE_CONFLICT"]
_TensorProfile = Literal["cpu-float32-v1", "cuda-float16-v1"]
_FACTORS = (1, 2, 4, 8)
_MAX_MASK_ELEMENTS = 32 * 1024 * 1024
_OWNERS_LOCK = threading.RLock()
_OWNERS: dict[int, object] = {}


class IllustriousRegionalAdapterError(ValueError):
    """Stable, finite private adapter diagnostic; native forward errors propagate."""

    code: _Code

    def __init__(self, code: _Code, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class TransformerBinding:
    transformer: Any
    factor: Literal[1, 2, 4, 8]


def _require(condition: bool, code: _Code, message: str) -> None:
    if not condition:
        raise IllustriousRegionalAdapterError(code, message)


@dataclass(frozen=True, slots=True)
class _TensorPolicy:
    device: Any
    dtype: Any


def _tensor_policy(torch: Any, tensor_profile: _TensorProfile = "cpu-float32-v1") -> _TensorPolicy:
    """Two private mappings; cuda:0 is intentional, with no device discovery."""
    _require(
        type(tensor_profile) is str and tensor_profile in ("cpu-float32-v1", "cuda-float16-v1"),
        "PROFILE_INVALID",
        "Unsupported private tensor profile.",
    )
    if tensor_profile == "cpu-float32-v1":
        return _TensorPolicy(torch.device("cpu"), torch.float32)
    return _TensorPolicy(torch.device("cuda:0"), torch.float16)


def _shape_matches(value: Any, height: int, width: int) -> bool:
    return (
        type(value) is Shape
        and type(value.height) is int
        and type(value.width) is int
        and value.height == height
        and value.width == width
    )


def _validate_plan(plan: AttentionPlan) -> None:
    """Rebuild the bounded public records, including exact raw-alpha pooling.

    Frozen dataclasses are not proof of planner provenance. Structural bounds
    precede reconstruction, so fabricated records cannot bypass numerical caps.
    """
    _require(type(plan) is AttentionPlan, "INPUT_INVALID", "Expected an exact AttentionPlan.")
    shape = plan.latent_shape
    _require(
        type(shape) is Shape
        and type(shape.height) is int
        and type(shape.width) is int
        and shape.height > 0
        and shape.width > 0,
        "INPUT_INVALID",
        "Plan requires positive integer latent sides.",
    )
    _require(shape.height <= 256 and shape.width <= 256, "LIMIT", "Plan side exceeds 256.")
    _require(
        type(plan.profile) is str and plan.profile == "alpha8-ge128-ceil2x2-max-v1",
        "INPUT_INVALID",
        "Unsupported numerical plan profile.",
    )
    _require(
        type(plan.batch_signs) is tuple
        and all(type(sign) is str for sign in plan.batch_signs)
        and plan.batch_signs in (("positive",), ("negative", "positive")),
        "INPUT_INVALID",
        "Plan must describe one explicit positive-only or negative-first pair.",
    )
    _require(
        type(plan.key_length) is int and plan.key_length > 0,
        "INPUT_INVALID",
        "Plan K must be a positive integer.",
    )
    _require(plan.key_length <= 308, "LIMIT", "Plan K exceeds 308.")
    streams: list[tuple[EncodedSegment, ...]] = []
    for sign, signed in (("negative", plan.negative), ("positive", plan.positive)):
        _require(
            type(signed) is SignedPlan
            and type(signed.sign) is str
            and signed.sign == sign
            and type(signed.length) is int
            and signed.length > 0
            and type(signed.segments) is tuple
            and bool(signed.segments),
            "INPUT_INVALID",
            "Invalid signed plan record.",
        )
        _require(
            signed.length <= 308 and len(signed.segments) <= 16,
            "LIMIT",
            "Signed plan exceeds numerical limits.",
        )
        encoded: list[EncodedSegment] = []
        cursor = 0
        for segment in signed.segments:
            _require(
                type(segment) is PlannedSegment and type(segment.token_range) is TokenRange,
                "INPUT_INVALID",
                "Invalid planned segment/range record.",
            )
            token_range = segment.token_range
            _require(
                type(token_range.start) is int
                and type(token_range.end) is int
                and token_range.start == cursor
                and cursor < token_range.end <= signed.length,
                "INPUT_INVALID",
                "Plan ranges must partition the actual signed stream.",
            )
            coverage = segment.coverage
            encoded_coverage: Alpha8 | Everywhere
            if type(coverage) is AlphaPyramid:
                _require(
                    type(coverage.levels) is tuple and len(coverage.levels) == 4,
                    "INPUT_INVALID",
                    "Alpha pyramid requires exactly four levels.",
                )
                for factor, level in zip(_FACTORS, coverage.levels, strict=True):
                    height = (shape.height + factor - 1) // factor
                    width = (shape.width + factor - 1) // factor
                    _require(
                        type(level) is AlphaLevel
                        and type(level.factor) is int
                        and level.factor == factor
                        and _shape_matches(level.shape, height, width)
                        and type(level.samples) is bytes
                        and len(level.samples) == height * width,
                        "INPUT_INVALID",
                        "Malformed alpha level/factor/grid/samples.",
                    )
                encoded_coverage = Alpha8(shape=shape, samples=coverage.levels[0].samples)
            else:
                _require(type(coverage) is Everywhere, "INPUT_INVALID", "Unsupported coverage.")
                encoded_coverage = cast(Everywhere, coverage)
            encoded.append(
                EncodedSegment(token_range.binding_id, token_range.end - cursor, encoded_coverage)
            )
            cursor = token_range.end
        _require(cursor == signed.length, "INPUT_INVALID", "Signed range length mismatch.")
        streams.append(tuple(encoded))
    try:
        rebuilt = plan_illustrious_attention(
            latent_shape=shape,
            negative=streams[0],
            positive=streams[1],
            profile=plan.profile,
            layout="positive-only" if plan.batch_signs == ("positive",) else "cfg-negative-first",
        )
    except IllustriousRegionalAttentionError as error:
        code: _Code = "LIMIT" if error.code == "REGIONAL_ATTENTION_LIMIT" else "INPUT_INVALID"
        raise IllustriousRegionalAdapterError(code, str(error)) from error
    _require(plan == rebuilt, "INPUT_INVALID", "Plan differs from the canonical numerical plan.")


def _load_native() -> tuple[Any, Any, Any, Any, Any, Any]:
    try:
        import diffusers
        import torch
        from diffusers.models.attention import BasicTransformerBlock
        from diffusers.models.attention_processor import Attention, AttnProcessor2_0
        from diffusers.models.transformers.transformer_2d import Transformer2DModel
        from diffusers.models.unets.unet_2d_condition import UNet2DConditionModel
    except ImportError as error:
        raise IllustriousRegionalAdapterError(
            "PROFILE_INVALID", "The pinned optional Torch/Diffusers runtime is required."
        ) from error
    _require(
        torch.__version__.split("+", 1)[0] == "2.7.1" and diffusers.__version__ == "0.40.0",
        "PROFILE_INVALID",
        "Only Torch 2.7.1 / Diffusers 0.40.0 are supported.",
    )
    return (
        torch,
        Transformer2DModel,
        UNet2DConditionModel,
        BasicTransformerBlock,
        Attention,
        AttnProcessor2_0,
    )


def _module_tree(root: Any) -> tuple[Any, ...]:
    """Do not let named_modules' normal deduplication conceal aliases/cycles."""
    modules: list[Any] = []
    seen: set[int] = set()
    pending = [root]
    while pending:
        module = pending.pop()
        _require(
            id(module) not in seen, "PROFILE_INVALID", "Shared module aliases are unsupported."
        )
        seen.add(id(module))
        modules.append(module)
        pending.extend(child for child in module._modules.values() if child is not None)
    return tuple(modules)


def _budget(batch: int, heads: int, queries: int, keys: int) -> None:
    _require(
        batch * heads * queries * keys <= _MAX_MASK_ELEMENTS,
        "LIMIT",
        "Expanded Boolean attention mask exceeds 32*1024*1024 elements.",
    )


def _runtime(
    torch: Any, modules: tuple[Any, ...], tensor_profile: _TensorProfile = "cpu-float32-v1"
) -> None:
    policy = _tensor_policy(torch, tensor_profile)
    _require(
        not torch.is_grad_enabled()
        and not torch.is_autocast_enabled("cpu")
        and (policy.device.type != "cuda" or not torch.is_autocast_enabled("cuda")),
        "PROFILE_INVALID",
        "Autograd and profile autocast must be disabled.",
    )
    _require(
        all(module.training is False for module in modules),
        "PROFILE_INVALID",
        "Every model module must remain in evaluation mode.",
    )
    for module in modules:
        for tensor in (*module.parameters(recurse=False), *module.buffers(recurse=False)):
            _require(
                tensor.device == policy.device
                and tensor.layout == torch.strided
                and (
                    tensor.dtype == policy.dtype
                    or not (tensor.is_floating_point() or tensor.is_complex())
                ),
                "PROFILE_INVALID",
                "Model state must retain the selected device and floating dtype.",
            )


def _tensor(
    torch: Any,
    value: Any,
    rank: int | None = None,
    tensor_profile: _TensorProfile = "cpu-float32-v1",
) -> None:
    policy = _tensor_policy(torch, tensor_profile)
    _require(
        type(value) is torch.Tensor
        and value.device == policy.device
        and value.dtype == policy.dtype
        and value.layout == torch.strided
        and (rank is None or value.ndim == rank),
        "INPUT_INVALID",
        "Expected a selected-profile strided tensor of the required rank.",
    )


def _extra(torch: Any, value: Any, tensor_profile: _TensorProfile = "cpu-float32-v1") -> None:
    _require(
        value is None or (type(value) is dict and not (value.keys() - {"temb"})),
        "INPUT_INVALID",
        "Only the native temb cross-attention keyword is supported.",
    )
    if value is not None and value.get("temb") is not None:
        _tensor(torch, value["temb"], tensor_profile=tensor_profile)


def _validate_attention(torch: Any, attention: Any, native: tuple[Any, ...], cross: bool) -> None:
    attention_type, processor_type = native[4:]
    _require(
        type(attention) is attention_type and type(attention.processor) is processor_type,
        "PROFILE_INVALID",
        "Attention and its processor must have the exact native types.",
    )
    _require(
        attention.is_cross_attention is cross
        and attention.only_cross_attention is False
        and attention.added_kv_proj_dim is None
        and attention.fused_projections is False
        and attention.pre_only is False
        and attention.context_pre_only is None
        and attention.is_causal is False
        and attention.scale_qk is True
        and (attention.upcast_attention is False or attention.upcast_attention is None)
        and attention.upcast_softmax is False
        and attention.spatial_norm is None
        and attention.group_norm is None
        and attention.norm_cross is None
        and attention.norm_q is None
        and attention.norm_k is None,
        "PROFILE_INVALID",
        "Unsupported Attention configuration.",
    )
    _require(
        type(attention.heads) is int and attention.heads > 0,
        "PROFILE_INVALID",
        "Attention requires a positive native head count.",
    )
    projections = (attention.to_q, attention.to_k, attention.to_v)
    _require(
        all(type(projection) is torch.nn.Linear for projection in projections)
        and type(attention.to_out) is torch.nn.ModuleList
        and len(attention.to_out) == 2
        and type(attention.to_out[0]) is torch.nn.Linear
        and type(attention.to_out[1]) is torch.nn.Dropout,
        "PROFILE_INVALID",
        "Only ordinary native linear Attention projections are supported.",
    )
    _require(
        attention.to_q.out_features == attention.to_k.out_features == attention.to_v.out_features
        and attention.to_k.in_features == attention.to_v.in_features
        and attention.to_q.out_features % attention.heads == 0
        and attention.to_out[0].in_features == attention.to_q.out_features,
        "PROFILE_INVALID",
        "Attention projection/head dimensions are inconsistent.",
    )


def _preflight(
    root: Any,
    modules: tuple[Any, ...],
    bindings: tuple[TransformerBinding, ...],
    plan: AttentionPlan,
    native: tuple[Any, ...],
    tensor_profile: _TensorProfile = "cpu-float32-v1",
) -> tuple[tuple[Any, TransformerBinding], ...]:
    torch, transformer_type, _, block_type, attention_type, _ = native
    _runtime(torch, modules, tensor_profile)
    _validate_plan(plan)
    _require(
        type(bindings) is tuple and bool(bindings),
        "INPUT_INVALID",
        "Bindings must be a nonempty tuple.",
    )
    by_id: dict[int, TransformerBinding] = {}
    for binding in bindings:
        _require(
            type(binding) is TransformerBinding
            and type(binding.transformer) is transformer_type
            and type(binding.factor) is int
            and binding.factor in _FACTORS,
            "INPUT_INVALID",
            "Each binding needs an exact native Transformer2DModel and factor 1/2/4/8.",
        )
        identity = id(binding.transformer)
        _require(identity not in by_id, "INPUT_INVALID", "Duplicate transformer binding.")
        by_id[identity] = binding
    transformers = tuple(module for module in modules if isinstance(module, transformer_type))
    _require(
        set(by_id) == {id(module) for module in transformers},
        "INPUT_INVALID",
        "Bindings must cover every transformer under the root, with no outside binding.",
    )
    expected_blocks: set[int] = set()
    expected_attention: set[int] = set()
    cross: list[tuple[Any, TransformerBinding]] = []
    for module in modules:
        _require(
            type(module).__name__ != "DualTransformer2DModel"
            and "forward" not in module.__dict__
            and getattr(module, "_compiled_call_impl", None) is None
            and not hasattr(module, "_hf_hook"),
            "PROFILE_INVALID",
            "Dual/custom/compiled/offloaded module execution is unsupported.",
        )
        if module is root or type(module) in (transformer_type, block_type, attention_type):
            module_type = cast(Any, type(module))
            entry = module._call_impl
            _require(
                not any(
                    name in module.__dict__
                    for name in ("__call__", "_wrapped_call_impl", "_call_impl", "_slow_forward")
                )
                and module_type.__call__ is torch.nn.Module.__call__
                and module_type._wrapped_call_impl is torch.nn.Module._wrapped_call_impl
                and module_type._call_impl is torch.nn.Module._call_impl
                and module_type._slow_forward is torch.nn.Module._slow_forward
                and getattr(entry, "__func__", None) is torch.nn.Module._call_impl
                and getattr(entry, "__self__", None) is module,
                "PROFILE_INVALID",
                "Monitored modules require the exact native unshadowed call-entry implementation.",
            )
    for transformer in transformers:
        config = transformer.config
        _require(
            type(transformer) is transformer_type
            and transformer.is_input_continuous is True
            and transformer.is_input_vectorized is False
            and transformer.is_input_patches is False
            and transformer.gradient_checkpointing is False
            and config.norm_type == "layer_norm"
            and config.num_embeds_ada_norm is None
            and config.attention_type == "default"
            and config.only_cross_attention is False
            and config.double_self_attention is False
            and transformer.use_additional_conditions is False
            and transformer.caption_channels is None
            and type(transformer.transformer_blocks) is torch.nn.ModuleList
            and len(transformer.transformer_blocks) > 0,
            "PROFILE_INVALID",
            "Only ordinary continuous layer-norm Transformer2D models are supported.",
        )
        binding = by_id[id(transformer)]
        shape = Shape(
            (plan.latent_shape.height + binding.factor - 1) // binding.factor,
            (plan.latent_shape.width + binding.factor - 1) // binding.factor,
        )
        plan.query(factor=binding.factor, shape=shape, key_length=plan.key_length)
        for block in transformer.transformer_blocks:
            _require(
                type(block) is block_type
                and block.only_cross_attention is False
                and block.double_self_attention is False
                and block.norm_type == "layer_norm"
                and block.pos_embed is None
                and not hasattr(block, "fuser"),
                "PROFILE_INVALID",
                "Expected an ordinary native self-plus-cross BasicTransformerBlock.",
            )
            _validate_attention(torch, block.attn1, native, False)
            _validate_attention(torch, block.attn2, native, True)
            expected_blocks.add(id(block))
            expected_attention.update((id(block.attn1), id(block.attn2)))
            _budget(
                len(plan.batch_signs),
                block.attn2.heads,
                shape.height * shape.width,
                plan.key_length,
            )
            cross.append((block.attn2, binding))
    _require(
        {id(module) for module in modules if isinstance(module, block_type)} == expected_blocks
        and {id(module) for module in modules if isinstance(module, attention_type)}
        == expected_attention,
        "PROFILE_INVALID",
        "Root contains attention/block modules outside the supported transformer topology.",
    )
    _require(
        getattr(root, "encoder_hid_proj", None) is None
        and getattr(root, "position_net", None) is None,
        "PROFILE_INVALID",
        "Context projection and gated context configuration are unsupported.",
    )
    return tuple(cross)


def _existing_permissions(
    torch: Any,
    mask: Any,
    batch: int,
    heads: int,
    queries: int,
    keys: int,
    tensor_profile: _TensorProfile = "cpu-float32-v1",
) -> Any:
    policy = _tensor_policy(torch, tensor_profile)
    if mask is None:
        return None
    _require(
        type(mask) is torch.Tensor
        and mask.device == policy.device
        and mask.layout == torch.strided
        and mask.dtype in (torch.bool, policy.dtype),
        "INPUT_INVALID",
        "Existing masks must be selected-device Boolean or selected-float strided tensors.",
    )
    _require(
        (
            mask.ndim == 3
            and mask.shape[0] in (batch, batch * heads)
            and mask.shape[1] in (1, queries)
            and mask.shape[2] == keys
        )
        or (
            mask.ndim == 4
            and mask.shape[0] == batch
            and mask.shape[1] in (1, heads)
            and mask.shape[2] in (1, queries)
            and mask.shape[3] == keys
        ),
        "INPUT_INVALID",
        "Unsupported existing attention mask shape.",
    )
    if mask.dtype == policy.dtype:
        permission = mask.eq(0)
        invalid = mask.ne(0)
        invalid.logical_and_(mask.ne(-10000))
        invalid.logical_and_(mask.ne(float("-inf")))
        _require(
            not invalid.any().item(), "INPUT_INVALID", "Existing mask contains a soft/invalid bias."
        )
        del invalid
    else:
        permission = mask
    if permission.ndim == 3:
        if permission.shape[0] == batch:
            permission = permission.unsqueeze(1)
        else:
            permission = permission.reshape(batch, heads, permission.shape[1], keys)
    return permission


def _combined_mask(
    torch: Any,
    plan: AttentionPlan,
    factor: int,
    shape: Shape,
    heads: int,
    mask: Any,
    tensor_profile: _TensorProfile = "cpu-float32-v1",
) -> Any:
    policy = _tensor_policy(torch, tensor_profile)
    batch, queries, keys = len(plan.batch_signs), shape.height * shape.width, plan.key_length
    _budget(batch, heads, queries, keys)
    existing = _existing_permissions(torch, mask, batch, heads, queries, keys, tensor_profile)
    permission = torch.zeros((batch, heads, queries, keys), dtype=torch.bool, device=policy.device)
    for batch_index, sign in enumerate(plan.batch_signs):
        signed = plan.negative if sign == "negative" else plan.positive
        for segment in signed.segments:
            start, end = segment.token_range.start, segment.token_range.end
            if type(segment.coverage) is Everywhere:
                permission[batch_index, :, :, start:end] = True
            else:
                samples = (
                    cast(AlphaPyramid, segment.coverage).levels[_FACTORS.index(factor)].samples
                )
                support = torch.tensor(
                    tuple(value >= 128 for value in samples), dtype=torch.bool, device=policy.device
                )
                permission[batch_index, :, :, start:end] = support[None, :, None]
    if existing is not None:
        permission.logical_and_(existing)
    _require(
        permission.any(dim=-1).all().item(),
        "ALL_MASKED",
        "An effective batch/head/query row has no allowed key.",
    )
    return permission.view(batch * heads, queries, keys)


def _single_unrestricted_bank(plan: AttentionPlan) -> bool:
    """Preserve native no-mask execution for one full stream per emitted sign."""
    for sign in plan.batch_signs:
        signed = plan.negative if sign == "negative" else plan.positive
        if len(signed.segments) != 1:
            return False
        segment = signed.segments[0]
        if (
            type(segment.coverage) is not Everywhere
            or segment.token_range.start != 0
            or segment.token_range.end != plan.key_length
        ):
            return False
    return True


class _Scope:
    """One owner of the finite processor/hook lifecycle; no model math."""

    def __init__(
        self,
        root: Any,
        modules: tuple[Any, ...],
        cross: tuple[Any, ...],
        plan: AttentionPlan,
        native: tuple[Any, ...],
        tensor_profile: _TensorProfile = "cpu-float32-v1",
    ) -> None:
        self.root, self.modules, self.cross, self.plan, self.native = (
            root,
            modules,
            cross,
            plan,
            native,
        )
        self.tensor_profile: _TensorProfile = tensor_profile
        self.thread = threading.get_ident()
        self.hooks: list[Any] = []
        self.processors: list[tuple[Any, Any]] = []
        self.call_entries: list[tuple[Any, bool, Any]] = []
        self.frames: dict[int, list[Shape | None]] = {}
        self.failure: IllustriousRegionalAdapterError | None = None
        self.consumed = 0

    def guard(self) -> None:
        _require(
            threading.get_ident() == self.thread,
            "SCOPE_CONFLICT",
            "Forward belongs to another thread.",
        )
        if self.failure is not None:
            raise self.failure

    def failed(self, error: BaseException | None = None) -> None:
        if self.failure is None:
            self.failure = (
                error
                if isinstance(error, IllustriousRegionalAdapterError)
                else IllustriousRegionalAdapterError(
                    "INPUT_INVALID", "A forward failed inside this scope."
                )
            )

    def call_wrapper(self, module: Any, original: Any) -> Callable[..., Any]:
        def invoke(*args: Any, **kwargs: Any) -> Any:
            # A foreign-thread refusal must not change the owner's frame/latch.
            _require(
                threading.get_ident() == self.thread,
                "SCOPE_CONFLICT",
                "Forward belongs to another thread.",
            )
            frame: list[Shape | None] | None = None
            identity = id(module)
            try:
                self.guard()
                _require(
                    not self.frames[identity],
                    "SCOPE_CONFLICT",
                    "Reentrant module forward is unsupported.",
                )
                frame = [None]
                self.frames[identity] = frame
                result = original(*args, **kwargs)
                # An existing hook may catch a failed nested owned invocation.
                self.guard()
                return result
            except BaseException as error:
                self.failed(error)
                raise
            finally:
                if frame is not None and self.frames.get(identity) is frame:
                    self.frames[identity] = []

        return invoke

    def install(self) -> None:
        torch, transformer_type, _, block_type, attention_type, _ = self.native
        by_parent = {id(binding.transformer): binding for _, binding in self.cross}
        for module in self.modules:
            if module is not self.root and type(module) not in (
                transformer_type,
                block_type,
                attention_type,
            ):
                continue
            identity = id(module)
            signature = inspect.signature(cast(Any, type(module)).forward)
            self.frames[identity] = []
            original_call = module._call_impl
            self.call_entries.append(
                (module, "_call_impl" in module.__dict__, module.__dict__.get("_call_impl"))
            )
            module.__dict__["_call_impl"] = self.call_wrapper(module, original_call)

            def before(
                current: Any,
                args: tuple[Any, ...],
                kwargs: dict[str, Any],
                *,
                forward_signature: Any = signature,
            ) -> None:
                self.guard()
                stack = self.frames[id(current)]
                try:
                    _require(
                        len(stack) == 1,
                        "SCOPE_CONFLICT",
                        "Native prehook requires its owned invocation frame.",
                    )
                    if current is self.root or type(current) is transformer_type:
                        _runtime(torch, self.modules, self.tensor_profile)
                    try:
                        arguments = forward_signature.bind(current, *args, **kwargs).arguments
                    except TypeError as error:
                        raise IllustriousRegionalAdapterError(
                            "INPUT_INVALID", str(error)
                        ) from error
                    extras = arguments.get("cross_attention_kwargs")
                    _extra(torch, extras, self.tensor_profile)
                    if type(current) is transformer_type:
                        hidden = arguments.get("hidden_states")
                        _tensor(torch, hidden, 4, self.tensor_profile)
                        _require(
                            hidden.shape[0] == len(self.plan.batch_signs)
                            and hidden.shape[1] == current.in_channels,
                            "INPUT_INVALID",
                            "Parent batch/channel shape does not match the plan/model.",
                        )
                        shape = Shape(hidden.shape[2], hidden.shape[3])
                        binding = by_parent[id(current)]
                        try:
                            self.plan.query(
                                factor=binding.factor, shape=shape, key_length=self.plan.key_length
                            )
                        except IllustriousRegionalAttentionError as error:
                            raise IllustriousRegionalAdapterError(
                                "INPUT_INVALID", str(error)
                            ) from error
                        context = arguments.get("encoder_hidden_states")
                        _tensor(torch, context, 3, self.tensor_profile)
                        _require(
                            tuple(context.shape[:2])
                            == (len(self.plan.batch_signs), self.plan.key_length)
                            and context.shape[2] == current.config.cross_attention_dim,
                            "INPUT_INVALID",
                            "Parent context batch/K/features do not match the plan/model.",
                        )
                        stack[-1] = shape
                except BaseException as error:
                    self.failed(error)
                    raise

            # Observe the arguments after pre-existing hooks have transformed them.
            self.hooks.append(
                module.register_forward_pre_hook(before, with_kwargs=True, prepend=False)
            )
        for attention, binding in self.cross:
            original = attention.processor
            self.processors.append((attention, original))
            attention.set_processor(_Processor(self, attention, binding, original))

    def restore(self) -> None:
        # No whole hook dictionaries or global functions are replaced. Restore
        # instance slots exactly, including absence rather than a bound shadow.
        for attention, original in reversed(self.processors):
            # Both processors are non-Module objects. Direct restoration also
            # survives an instance set_processor callback failing during setup.
            attention.processor = original
        for handle in reversed(self.hooks):
            handle.remove()
        for module, present, original in reversed(self.call_entries):
            if present:
                module.__dict__["_call_impl"] = original
            else:
                module.__dict__.pop("_call_impl", None)
        self.frames.clear()


class _Processor:
    def __init__(
        self, scope: _Scope, attention: Any, binding: TransformerBinding, original: Any
    ) -> None:
        self.scope, self.attention, self.binding, self.original = (
            scope,
            attention,
            binding,
            original,
        )

    def __call__(
        self,
        attn: Any,
        hidden_states: Any,
        encoder_hidden_states: Any = None,
        attention_mask: Any = None,
        temb: Any = None,
        *args: Any,
        **kwargs: Any,
    ) -> Any:
        scope = self.scope
        torch = scope.native[0]
        try:
            scope.guard()
            _runtime(torch, scope.modules, scope.tensor_profile)
            _require(
                attn is self.attention,
                "SCOPE_CONFLICT",
                "Processor used by a different attention module.",
            )
            _require(
                not args and not kwargs,
                "INPUT_INVALID",
                "Unknown processor arguments are unsupported.",
            )
            if temb is not None:
                _tensor(torch, temb, tensor_profile=scope.tensor_profile)
            frames = scope.frames[id(self.binding.transformer)]
            _require(
                len(frames) == 1 and frames[0] is not None,
                "INPUT_INVALID",
                "Cross attention requires its active observed parent grid.",
            )
            shape = cast(Shape, frames[0])
            _tensor(torch, hidden_states, 3, scope.tensor_profile)
            _tensor(torch, encoder_hidden_states, 3, scope.tensor_profile)
            _require(
                tuple(hidden_states.shape)
                == (
                    len(scope.plan.batch_signs),
                    shape.height * shape.width,
                    attn.to_q.in_features,
                )
                and tuple(encoder_hidden_states.shape)
                == (
                    len(scope.plan.batch_signs),
                    scope.plan.key_length,
                    attn.to_k.in_features,
                ),
                "INPUT_INVALID",
                "Cross attention batch/grid/K/features do not match the plan/model.",
            )
            scope.plan.query(
                factor=self.binding.factor, shape=shape, key_length=encoder_hidden_states.shape[1]
            )
            combined = _combined_mask(
                torch,
                scope.plan,
                self.binding.factor,
                shape,
                attn.heads,
                attention_mask,
                scope.tensor_profile,
            )
            result = self.original(
                attn,
                hidden_states,
                encoder_hidden_states=encoder_hidden_states,
                attention_mask=(
                    None
                    if attention_mask is None and _single_unrestricted_bank(scope.plan)
                    else combined
                ),
                temb=temb,
            )
            scope.consumed += 1
            return result
        except BaseException as error:
            scope.failed(error)
            raise


def validate_illustrious_regional_attention(
    root: Any,
    *,
    bindings: tuple[TransformerBinding, ...],
    plan: AttentionPlan,
    tensor_profile: _TensorProfile = "cpu-float32-v1",
) -> None:
    """Read-only profile/binding/budget preflight, without reserving a root.

    This is no freshness lease: actual scope entry revalidates and reserves
    before installation. Existing overlapping owners refuse under the same lock.
    """
    native = _load_native()
    _require(
        type(root) in native[1:3],
        "PROFILE_INVALID",
        "Root must have an exact supported native model type.",
    )
    modules = _module_tree(root)
    with _OWNERS_LOCK:
        _require(
            all(id(module) not in _OWNERS for module in modules),
            "SCOPE_CONFLICT",
            "An overlapping root/module already belongs to another scope.",
        )
        _preflight(root, modules, bindings, plan, native, tensor_profile)


@contextmanager
def scoped_illustrious_regional_attention(
    root: Any,
    *,
    bindings: tuple[TransformerBinding, ...],
    plan: AttentionPlan,
    tensor_profile: _TensorProfile = "cpu-float32-v1",
) -> Generator[None]:
    """Temporarily mask every native cross-attention site of one complete root.

    All validation and mask-size preflight precede the first model mutation.
    A normal exit requires at least one successful original cross-attention call;
    catching a failed forward inside the body does not make the scope successful.
    """
    native = _load_native()
    _require(
        type(root) in native[1:3],
        "PROFILE_INVALID",
        "Root must have an exact supported native model type.",
    )
    modules = _module_tree(root)
    owner = object()
    with _OWNERS_LOCK:
        _require(
            all(id(module) not in _OWNERS for module in modules),
            "SCOPE_CONFLICT",
            "An overlapping root/module already belongs to another scope.",
        )
        cross = _preflight(root, modules, bindings, plan, native, tensor_profile)
        scope = _Scope(root, modules, cross, plan, native, tensor_profile)
        for module in modules:
            _OWNERS[id(module)] = owner
    try:
        scope.install()
        yield
        if scope.failure is not None:
            raise scope.failure
        _require(
            scope.consumed > 0, "INPUT_INVALID", "Scope exited without consuming cross attention."
        )
    finally:
        try:
            scope.restore()
        finally:
            with _OWNERS_LOCK:
                for module in modules:
                    if _OWNERS.get(id(module)) is owner:
                        del _OWNERS[id(module)]
