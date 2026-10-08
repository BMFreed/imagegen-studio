"""Independent trained LoRA loader algebra; no conditioning or generated jobs.

Expected targets come from ordinary safetensors and the untouched native graph.
Only the subject uses worker conversion/loading. Importing this file does no ML work.
"""

from __future__ import annotations

import contextlib
import hashlib
import importlib
import importlib.metadata
import json
import math
import os
import re
import stat
import sys
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

COMPONENTS = ("unet", "text_encoder", "text_encoder_2")
KEY = re.compile(
    r"(lora_(?:unet|te|te1|te2)_[A-Za-z0-9_]+)\.(lora_down\.weight|lora_up\.weight|alpha)\Z"
)
MEMORY_CEILING = 12 * 1024**3


@dataclass(frozen=True)
class ReferenceTarget:
    component: str
    path: str
    down: Any
    up: Any
    alpha: float
    rank: int

    @property
    def identity(self) -> tuple[str, str]:
        return self.component, self.path


def target_module(pipeline: Any, identity: tuple[str, str]) -> Any:
    component, path = identity
    return getattr(pipeline, component).get_submodule(path)


def reference_aliases(pipeline: Any, torch: Any) -> dict[str, tuple[str, str]]:
    """Reverse graph-derived aliases, independent of native/worker key converters."""
    aliases: dict[str, tuple[str, str]] = {}

    def add(alias: str, component: str, path: str) -> None:
        identity = component, path
        assert alias not in aliases or aliases[alias] == identity, (
            "Ambiguous reference alias."
        )
        aliases[alias] = identity

    resnet_names = {
        "norm1": "in_layers_0",
        "conv1": "in_layers_2",
        "time_emb_proj": "emb_layers_1",
        "norm2": "out_layers_0",
        "conv2": "out_layers_3",
        "conv_shortcut": "skip_connection",
    }
    unet = pipeline.unet
    # SGM indexes count actual resnet blocks plus one sampler per down block.
    down_offsets, offset = [], 1
    for block in unet.down_blocks:
        down_offsets.append(offset)
        offset += len(block.resnets) + 1
    up_offsets, offset = [], 0
    for block in unet.up_blocks:
        up_offsets.append(offset)
        offset += len(block.resnets)
    for component, prefix in zip(COMPONENTS, ("unet", "te1", "te2"), strict=True):
        for path, module in getattr(pipeline, component).named_modules():
            if not isinstance(module, (torch.nn.Linear, torch.nn.Conv2d)):
                continue
            if isinstance(module, torch.nn.Conv2d) and module.groups != 1:
                continue
            add(f"lora_{prefix}_{path.replace('.', '_')}", component, path)
            if component == "text_encoder":
                add(f"lora_te_{path.replace('.', '_')}", component, path)
            if component != "unet":
                continue
            if path == "conv_in":
                add("lora_unet_input_blocks_0_0", component, path)
            elif path == "conv_out":
                add("lora_unet_out_2", component, path)
            parts = path.split(".")
            if parts[0] in ("down_blocks", "up_blocks") and len(parts) >= 5:
                direction, block, child, layer = (
                    parts[0],
                    int(parts[1]),
                    parts[2],
                    int(parts[3]),
                )
                suffix = "_".join(parts[4:])
                if child in ("attentions", "resnets"):
                    index = (
                        down_offsets if direction == "down_blocks" else up_offsets
                    )[block] + layer
                    family = (
                        "input_blocks"
                        if direction == "down_blocks"
                        else "output_blocks"
                    )
                    branch = 1 if child == "attentions" else 0
                    if child == "resnets":
                        suffix = resnet_names.get(suffix, suffix)
                    add(
                        f"lora_unet_{family}_{index}_{branch}_{suffix}", component, path
                    )
                elif child == "downsamplers" and suffix == "conv":
                    index = down_offsets[block] + len(unet.down_blocks[block].resnets)
                    add(f"lora_unet_input_blocks_{index}_0_op", component, path)
                elif child == "upsamplers" and suffix == "conv":
                    native_block = unet.up_blocks[block]
                    index = up_offsets[block] + len(native_block.resnets) - 1
                    branch = 2 if hasattr(native_block, "attentions") else 1
                    add(
                        f"lora_unet_output_blocks_{index}_{branch}_conv",
                        component,
                        path,
                    )
            elif parts[0] == "mid_block" and len(parts) >= 4:
                child, layer, suffix = parts[1], int(parts[2]), "_".join(parts[3:])
                if child in ("attentions", "resnets"):
                    index = 1 if child == "attentions" else layer * 2
                    if child == "resnets":
                        suffix = resnet_names.get(suffix, suffix)
                    add(f"lora_unet_middle_block_{index}_{suffix}", component, path)
    return aliases


def build_reference_targets(
    pipeline: Any, state: dict[str, Any], torch: Any
) -> tuple[ReferenceTarget, ...]:
    aliases = reference_aliases(pipeline, torch)
    groups: dict[str, dict[str, Any]] = {}
    assert state, "Reference source has no ordinary LoRA tensors."
    for key, tensor in state.items():
        match = KEY.fullmatch(key)
        assert match is not None, (
            "Reference source contains unsupported ordinary LoRA keys."
        )
        assert tensor.dtype in (torch.float16, torch.bfloat16, torch.float32)
        assert bool(torch.isfinite(tensor).all()), (
            "Reference source contains nonfinite tensors."
        )
        groups.setdefault(match[1], {})[match[2]] = tensor
    result = []
    for stem, group in sorted(groups.items()):
        assert {"lora_down.weight", "lora_up.weight"} <= set(group)
        assert stem in aliases, f"No unambiguous native graph alias for {stem}."
        component, path = aliases[stem]
        module = target_module(pipeline, (component, path))
        down, up = group["lora_down.weight"], group["lora_up.weight"]
        assert down.ndim in (2, 4) and up.ndim == down.ndim and min(down.shape) > 0
        rank = int(down.shape[0])
        alpha_tensor = group.get("alpha")
        assert alpha_tensor is None or alpha_tensor.ndim == 0
        alpha = float(rank if alpha_tensor is None else alpha_tensor.item())
        assert math.isfinite(alpha)
        if isinstance(module, torch.nn.Linear):
            shapes = (rank, module.in_features), (module.out_features, rank)
        else:
            assert isinstance(module, torch.nn.Conv2d) and module.groups == 1
            shapes = (
                (rank, module.in_channels, *module.kernel_size),
                (module.out_channels, rank, 1, 1),
            )
        assert (tuple(down.shape), tuple(up.shape)) == shapes
        result.append(ReferenceTarget(component, path, down, up, alpha, rank))
    assert len({target.identity for target in result}) == len(groups), (
        "Duplicate reference target aliases."
    )
    return tuple(result)


def graph_identity(pipeline: Any) -> tuple[Any, ...]:
    return tuple(
        (component, path, type(module), id(module))
        for component in COMPONENTS
        for path, module in getattr(pipeline, component).named_modules()
    )


def base_state_digest(pipeline: Any, torch: Any) -> str:
    """Streaming graph state fingerprint; never clone a whole pipeline/base state."""
    digest = hashlib.sha256()
    for component in (*COMPONENTS, "vae"):
        for name, tensor in getattr(pipeline, component).state_dict().items():
            digest.update(
                f"{component}.{name}:{tensor.dtype}:{tuple(tensor.shape)}\n".encode()
            )
            raw = (
                tensor.detach().cpu().contiguous().reshape(-1).view(torch.uint8).numpy()
            )
            digest.update(memoryview(raw).cast("B"))
    return digest.hexdigest()


@contextlib.contextmanager
def float_probe(module: Any) -> Any:
    """Preserve individual native adapter FP32/base FP16 dtypes, including buffers."""
    entries = [(tensor, tensor.dtype) for tensor in module.parameters()]
    owners = list(module.modules())
    buffers = [(owner, dict(owner._buffers)) for owner in owners]
    hooks = [
        (owner, dict(owner._forward_hooks), dict(owner._forward_pre_hooks))
        for owner in owners
    ]
    scales = [
        (owner, dict(owner.scaling)) for owner in owners if hasattr(owner, "scaling")
    ]
    try:
        module.float()
        yield
    finally:
        for tensor, dtype in entries:
            if tensor.dtype != dtype:
                tensor.data = tensor.data.to(dtype=dtype)
        # Module._apply replaces registered buffers when a cast allocates a new
        # tensor. Restore the registrations, including original object aliases.
        for owner, original in buffers:
            owner._buffers.clear()
            owner._buffers.update(original)
        assert all(tensor.dtype == dtype for tensor, dtype in entries)
        assert all(
            owner._forward_hooks == forward and owner._forward_pre_hooks == before
            for owner, forward, before in hooks
        )
        assert all(owner.scaling == original for owner, original in scales)


def probe_input(module: Any, identity: tuple[str, str], torch: Any) -> Any:
    base = module.get_base_layer() if hasattr(module, "get_base_layer") else module
    seed = int.from_bytes(
        hashlib.sha256(".".join(identity).encode()).digest()[:8], "little"
    )
    generator = torch.Generator(device="cpu").manual_seed(seed)
    if isinstance(base, torch.nn.Linear):
        shape = (1, 2, base.in_features)
    else:
        shape = (1, base.in_channels, 5, 5)
    return torch.randn(shape, generator=generator, dtype=torch.float32).to(
        base.weight.device
    )


def baseline_outputs(
    pipeline: Any, identities: list[tuple[str, str]], torch: Any
) -> dict[Any, Any]:
    result = {}
    with torch.no_grad():
        for identity in identities:
            module = target_module(pipeline, identity)
            value = probe_input(module, identity, torch)
            with float_probe(module):
                result[identity] = module(value).detach().cpu()
    return result


def low_rank_update(
    base: Any, value: Any, target: ReferenceTarget, dtype: Any, torch: Any
) -> Any:
    # First preserve native stored inference casts, then promote only this probe.
    down = target.down.to(device=value.device, dtype=dtype).float()
    up = target.up.to(device=value.device, dtype=dtype).float()
    functional = torch.nn.functional
    if isinstance(base, torch.nn.Linear):
        return functional.linear(functional.linear(value, down), up)
    return functional.conv2d(
        functional.conv2d(
            value,
            down,
            stride=base.stride,
            padding=base.padding,
            dilation=base.dilation,
        ),
        up,
    )


def assert_close(actual: Any, expected: Any, torch: Any, message: str) -> None:
    assert actual.shape == expected.shape and bool(torch.isfinite(actual).all())
    assert bool(torch.isfinite(expected).all())
    assert torch.allclose(actual, expected, rtol=1e-5, atol=1e-6), message


def inspect_loaded_stack(
    pipeline: Any,
    entries: tuple[Any, ...],
    references: dict[str, tuple[ReferenceTarget, ...]],
    baseline: dict[Any, Any],
    torch: Any,
) -> dict[Any, Any]:
    """Assert source ownership/ordered activation before evaluating independent algebra."""
    names = [f"igs_lora_{index}" for index in range(len(entries))]
    assert pipeline.get_active_adapters() == names, (
        "Installed LoRA activation order differs from requested stack."
    )
    expected: dict[Any, dict[str, tuple[Any, ReferenceTarget]]] = {}
    for name, entry in zip(names, entries, strict=True):
        for target in references[entry.sha256]:
            expected.setdefault(target.identity, {})[name] = entry, target
    actual_paths = {
        (component, path)
        for component in COMPONENTS
        for path, module in getattr(pipeline, component).named_modules()
        if hasattr(module, "lora_A")
    }
    assert actual_paths == set(expected), (
        "Installed LoRA target ownership omitted or added an adapter."
    )
    outputs = {}
    scale_checks = []
    with torch.no_grad():
        for identity in sorted(baseline):
            module = target_module(pipeline, identity)
            owned = expected.get(identity, {})
            casts = {}
            if owned:
                assert list(module.active_adapters) == names, (
                    "Installed LoRA target activation order differs."
                )
                assert set(module.lora_A) == set(module.lora_B) == set(owned), (
                    "Installed LoRA source ownership differs."
                )
                assert not module.disable_adapters and not module.merged
                for name, (entry, target) in owned.items():
                    assert (
                        module.r[name] == target.rank
                        and module.lora_alpha[name] == target.alpha
                    ), "Installed LoRA rank/alpha source ownership differs."
                    scale_checks.append(
                        module.scaling[name]
                        == entry.weight * target.alpha / target.rank
                    )
                    down, up = module.lora_A[name].weight, module.lora_B[name].weight
                    assert down.dtype == up.dtype
                    casts[name] = down.dtype
                    for actual, raw in ((down, target.down), (up, target.up)):
                        assert bool(torch.isfinite(actual).all())
                        assert torch.equal(
                            actual.detach().cpu(), raw.to(dtype=actual.dtype)
                        ), (
                            "Installed LoRA tensor source association differs from independent source."
                        )
                    dropout = module.lora_dropout[name]
                    assert (
                        isinstance(dropout, torch.nn.Identity)
                        or getattr(dropout, "p", None) == 0
                    )
            value = probe_input(module, identity, torch)
            base = module.get_base_layer() if owned else module
            wanted = baseline[identity].to(value.device).clone()
            with float_probe(module):
                for name in names:
                    if name in owned:
                        entry, target = owned[name]
                        wanted = wanted + low_rank_update(
                            base, value, target, casts[name], torch
                        ) * (entry.weight * target.alpha / target.rank)
                actual = module(value)
                assert_close(
                    actual,
                    wanted,
                    torch,
                    "Installed LoRA forward differs from independent low-rank algebra.",
                )
                outputs[identity] = actual.detach().cpu()
    # A post-validation installed weight swap must first fail actual arithmetic,
    # rather than use scale metadata as the sole numerical-effect oracle.
    assert all(scale_checks), (
        "Installed LoRA signed weight differs from independent source."
    )
    return outputs


def qualify_stack_variants(
    pipeline: Any, entries: tuple[Any, Any], torch: Any, loader: Any
) -> dict[str, Any]:
    assert len(entries) == 2 and entries[0].sha256 != entries[1].sha256
    safetensors = importlib.import_module("safetensors.torch")
    references = {
        entry.sha256: build_reference_targets(
            pipeline, safetensors.load(exact_snapshot(entry)), torch
        )
        for entry in entries
    }
    identities = sorted(
        {target.identity for targets in references.values() for target in targets}
    )
    before_graph, before_base = (
        graph_identity(pipeline),
        base_state_digest(pipeline, torch),
    )
    baseline = baseline_outputs(pipeline, identities, torch)
    assert base_state_digest(pipeline, torch) == before_base
    first, second = entries
    variants = (
        ("A-only", (first,)),
        ("B-only", (second,)),
        ("AB", (first, second)),
        ("BA", (second, first)),
        ("A-zero", (replace(first, weight=0), second)),
        ("B-zero", (first, replace(second, weight=0))),
    )
    observed, outputs = [], {}
    native_casts = {}
    devices = (
        list(range(torch.cuda.device_count())) if torch.cuda.is_initialized() else []
    )
    for label, stack in variants:
        before_rng = torch.get_rng_state().clone()
        before_cuda = torch.cuda.get_rng_state_all() if devices else []
        restored = False
        try:
            with torch.random.fork_rng(devices=devices), torch.no_grad():
                loader(pipeline, stack, torch)
                outputs[label] = inspect_loaded_stack(
                    pipeline, stack, references, baseline, torch
                )
                if label == "AB":
                    for index, entry in enumerate(stack):
                        for target in references[entry.sha256]:
                            module = target_module(pipeline, target.identity)
                            native_casts[entry.sha256, target.identity] = module.lora_A[
                                f"igs_lora_{index}"
                            ].weight.dtype
        except Exception as error:
            print(
                json.dumps(
                    {
                        "status": "failed",
                        "failedVariant": label,
                        "completedLoaderVariants": len(observed),
                        "errorType": type(error).__name__,
                        "message": str(error)[:512],
                    }
                ),
                file=sys.stderr,
            )
            raise
        finally:
            pipeline.unload_lora_weights()
            assert (
                pipeline.get_list_adapters() == {}
                and pipeline.get_active_adapters() == []
            )
            assert graph_identity(pipeline) == before_graph, (
                "LoRA unload did not restore original graph."
            )
            assert base_state_digest(pipeline, torch) == before_base, (
                "LoRA unload changed original base weights."
            )
            after = baseline_outputs(pipeline, identities, torch)
            assert all(torch.equal(after[key], baseline[key]) for key in identities), (
                "LoRA unload did not restore baseline probe outputs."
            )
            assert torch.equal(torch.get_rng_state(), before_rng)
            assert all(
                torch.equal(a, b)
                for a, b in zip(
                    torch.cuda.get_rng_state_all() if devices else [],
                    before_cuda,
                    strict=True,
                )
            )
            restored = True
        observed.append(
            {
                "variant": label,
                "orderedSources": [entry.sha256 for entry in stack],
                "weights": [entry.weight for entry in stack],
                "targetCount": len(identities),
                "activeTargetCount": len(
                    {
                        target.identity
                        for entry in stack
                        for target in references[entry.sha256]
                    }
                ),
                "finiteClosedFormMatches": True,
                "orderedOwnershipMatches": True,
                "unloadGraphBaseAndProbeRestored": restored,
                "globalRngRestored": True,
            }
        )
        print(
            json.dumps(
                {
                    "status": "variant-passed",
                    **observed[-1],
                    "completedLoaderVariants": len(observed),
                }
            ),
            file=sys.stderr,
        )
    for identity in identities:
        assert_close(
            outputs["AB"][identity],
            outputs["BA"][identity],
            torch,
            "Additive AB/BA differs beyond FP32 probe tolerance.",
        )
        assert_close(
            outputs["A-zero"][identity],
            outputs["B-only"][identity],
            torch,
            "Enabled zero A does not preserve B contribution.",
        )
        assert_close(
            outputs["B-zero"][identity],
            outputs["A-only"][identity],
            torch,
            "Enabled zero B does not preserve A contribution.",
        )
    # Numerical neighbors must discriminate omission and exchanged signed weights.
    for label in ("A-only", "B-only"):
        assert any(
            not torch.allclose(outputs[label][key], baseline[key], rtol=1e-5, atol=1e-6)
            for key in identities
        ), "A trained source has no observable native low-rank contribution."
        assert any(
            not torch.allclose(
                outputs["AB"][key], outputs[label][key], rtol=1e-5, atol=1e-6
            )
            for key in identities
        ), "Native two-source neighbor cannot discriminate an omitted adapter."
    assert first.weight != second.weight and first.weight != 0 and second.weight != 0
    exchanged_differs = False
    for identity in identities:
        module = target_module(pipeline, identity)
        value = probe_input(module, identity, torch)
        swapped = baseline[identity].to(value.device).clone()
        with torch.no_grad(), float_probe(module):
            for entry, weight in ((first, second.weight), (second, first.weight)):
                selected = next(
                    (
                        target
                        for target in references[entry.sha256]
                        if target.identity == identity
                    ),
                    None,
                )
                if selected is not None:
                    # Use the actual AB inference cast before promoting the probe;
                    # source F32 tensors can otherwise hide native F16 rounding.
                    swapped = swapped + low_rank_update(
                        module,
                        value,
                        selected,
                        native_casts[entry.sha256, identity],
                        torch,
                    ) * (weight * selected.alpha / selected.rank)
        exchanged_differs |= not torch.allclose(
            swapped.cpu(), outputs["AB"][identity], rtol=1e-5, atol=1e-6
        )
    assert exchanged_differs, (
        "Native neighbors cannot discriminate exchanged source weights."
    )
    return {
        "variants": observed,
        "loaderVariants": 6,
        "sources": [
            {
                "sha256": entry.sha256,
                "weight": entry.weight,
                "targetCount": len(references[entry.sha256]),
                "components": {
                    component: sum(
                        target.component == component
                        for target in references[entry.sha256]
                    )
                    for component in COMPONENTS
                },
            }
            for entry in entries
        ],
        "unionTargetCount": len(identities),
        "additiveOrderWithinFp32Tolerance": True,
        "omittedAdapterNeighborsDistinct": True,
        "exchangedWeightNeighborDistinct": True,
        "enabledZeroNeighborsMatch": True,
        "baseStateSha256": before_base,
        "deterministicProbe": {
            "seed": "first8LE(SHA256(component.path))",
            "linearShape": "1x2xin_features",
            "convShape": "1xchannelsx5x5",
            "dtype": "torch.float32",
            "rtol": 1e-5,
            "atol": 1e-6,
        },
    }


def file_identity(path: Path) -> tuple[int, ...]:
    assert path.is_absolute() and path == path.resolve()
    entry = path.lstat()
    assert stat.S_ISREG(entry.st_mode) and not path.is_symlink()
    return (
        entry.st_dev,
        entry.st_ino,
        entry.st_mode,
        entry.st_size,
        entry.st_mtime_ns,
        entry.st_ctime_ns,
    )


def verify_descriptor(value: dict[str, Any]) -> tuple[int, ...]:
    assert set(value) == {"path", "sha256", "byteSize"}
    assert type(value["byteSize"]) is int and value["byteSize"] > 0
    assert re.fullmatch(r"[a-f0-9]{64}", value["sha256"])
    path = Path(value["path"])
    before = file_identity(path)
    assert before[3] == value["byteSize"]
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    digest = hashlib.sha256()
    with os.fdopen(descriptor, "rb") as stream:
        assert os.fstat(stream.fileno()).st_ino == before[1]
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    assert digest.hexdigest() == value["sha256"] and file_identity(path) == before
    return before


def exact_snapshot(entry: Any) -> bytes:
    value = {
        "path": str(entry.path),
        "sha256": entry.sha256,
        "byteSize": entry.byte_size,
    }
    assert entry.byte_size <= 512 * 1024 * 1024, (
        "Bounded ordinary LoRA source exceeds 512MiB."
    )
    before = verify_descriptor(value)
    descriptor = os.open(entry.path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as stream:
        raw = stream.read(entry.byte_size + 1)
    assert (
        len(raw) == entry.byte_size and hashlib.sha256(raw).hexdigest() == entry.sha256
    )
    assert file_identity(entry.path) == before
    return raw


def verify_worker_sources(root: Path, expected: dict[str, Any]) -> None:
    assert (
        root.is_absolute()
        and root == root.resolve()
        and root.is_dir()
        and len(expected) == 43
    )
    actual = {}
    for path in root.rglob("*"):
        if "__pycache__" in path.parts or path.suffix == ".pyc":
            continue
        assert not path.is_symlink()
        if path.is_dir():
            continue
        name = path.relative_to(root).as_posix()
        assert name in expected
        verify_descriptor({"path": str(path), **expected[name]})
        actual[name] = expected[name]
    assert actual == expected


def bounded_cli_environment() -> dict[str, Any]:
    """Refuse unbounded launch before importing ML or opening checkpoint bytes."""
    assert sys.platform == "linux" and not sys.flags.optimize
    lines = Path("/proc/self/cgroup").read_text().splitlines()
    groups = [line[3:] for line in lines if line.startswith("0::")]
    assert len(groups) == 1 and groups[0].startswith("/") and groups[0] != "/"
    relative = Path(groups[0])
    assert ".." not in relative.parts
    root = Path("/sys/fs/cgroup") / str(relative).lstrip("/")
    memory, swap = (
        (root / "memory.max").read_text().strip(),
        (root / "memory.swap.max").read_text().strip(),
    )
    assert memory.isdigit() and 0 < int(memory) <= MEMORY_CEILING and swap == "0", (
        "LoRA native qualification requires finite <=12GiB RAM and zero-swap cgroup limits."
    )
    for key in (
        "HF_HUB_OFFLINE",
        "HF_DATASETS_OFFLINE",
        "TRANSFORMERS_OFFLINE",
        "DIFFUSERS_OFFLINE",
    ):
        os.environ[key] = "1"
    for key in (
        "OMP_NUM_THREADS",
        "MKL_NUM_THREADS",
        "OPENBLAS_NUM_THREADS",
        "NUMEXPR_NUM_THREADS",
    ):
        os.environ[key] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    sys.dont_write_bytecode = True
    return {
        "cgroup": groups[0],
        "memoryMax": int(memory),
        "swapMax": 0,
        "offline": True,
        "threads": 1,
    }


def main(value: dict[str, Any]) -> dict[str, Any]:
    assert set(value) == {
        "schemaVersion",
        "workerRootPath",
        "workerSourceFiles",
        "configDir",
        "checkpoint",
        "loras",
    }
    assert value["schemaVersion"] == 1
    worker_root = Path(value["workerRootPath"])
    verify_worker_sources(worker_root, value["workerSourceFiles"])
    assert len(value["loras"]) == 2
    sources = [
        value["checkpoint"],
        *[
            {key: entry[key] for key in ("path", "sha256", "byteSize")}
            for entry in value["loras"]
        ],
    ]
    for entry in value["loras"]:
        assert set(entry) == {"path", "sha256", "byteSize", "weight"}
        assert type(entry["weight"]) in (int, float) and math.isfinite(entry["weight"])
        assert (
            type(entry["byteSize"]) is int
            and 0 < entry["byteSize"] <= 512 * 1024 * 1024
        )
    assert value["loras"][0]["weight"] != value["loras"][1]["weight"]
    assert all(entry["weight"] != 0 for entry in value["loras"])
    assert (
        len({source["path"] for source in sources})
        == len({source["sha256"] for source in sources})
        == 3
    )
    before = [verify_descriptor(source) for source in sources]
    subject = importlib.import_module("imagegen_worker.inference")
    loader = importlib.import_module("imagegen_worker.inference_lora")
    protocol = importlib.import_module("imagegen_worker.protocol")
    config_module = importlib.import_module("imagegen_worker.inference_config")
    for module in (subject, loader, protocol, config_module):
        assert Path(module.__file__).resolve().parent == worker_root
    assert subject.INFERENCE_WORKER_VERSION == "0.14.0"
    config = config_module.verify_pinned_config(value["configDir"])
    assert config == Path(sys.prefix) / "resources/sdxl-config"
    runtime = subject.qualify_ml_runtime()
    torch = runtime.torch
    torch.set_num_threads(1)
    entries = tuple(
        protocol.GenerationLora(
            Path(entry["path"]), entry["sha256"], entry["byteSize"], entry["weight"]
        )
        for entry in value["loras"]
    )
    cpu_rng, cuda_rng = torch.get_rng_state().clone(), torch.cuda.get_rng_state_all()
    with torch.random.fork_rng(devices=list(range(torch.cuda.device_count()))):
        pipeline = runtime.diffusers.StableDiffusionXLPipeline.from_single_file(
            value["checkpoint"]["path"],
            config=str(config),
            local_files_only=True,
            torch_dtype=torch.float16,
        )
        for component in (*COMPONENTS, "vae"):
            getattr(pipeline, component).eval().requires_grad_(False)
        pipeline.set_progress_bar_config(disable=True)
        evidence = qualify_stack_variants(
            pipeline, entries, torch, loader.load_generation_loras
        )
    assert torch.equal(torch.get_rng_state(), cpu_rng)
    assert all(
        torch.equal(a, b)
        for a, b in zip(torch.cuda.get_rng_state_all(), cuda_rng, strict=True)
    )
    config_module.verify_pinned_config(value["configDir"])
    assert [verify_descriptor(source) for source in sources] == before
    verify_worker_sources(worker_root, value["workerSourceFiles"])
    return {
        "schemaVersion": 1,
        "status": "passed",
        "workerVersion": "0.14.0",
        "workerRootPath": str(worker_root),
        "workerSourceFiles": value["workerSourceFiles"],
        "configDir": str(config),
        "checkpoint": value["checkpoint"],
        "loras": value["loras"],
        **evidence,
        "filesAndConfigUnchanged": True,
        "globalRngRestored": True,
        "versions": {
            package: importlib.metadata.version(package)
            for package in subject.PINNED_ML_VERSIONS
        },
        "probeDevice": "cpu",
        "pipelineLoadDtype": "torch.float16",
        "generatedJobs": 0,
        "conditioningCalls": 0,
        "denoisingCalls": 0,
        "scope": "Two distinct ordinary trained LoRA sources: native loader ownership/order and temporary FP32 module algebra; no UI, images or semantic pixel-order claim.",
    }


if __name__ == "__main__":
    bounds = bounded_cli_environment()
    raw = sys.stdin.buffer.read(256 * 1024 + 1)
    assert len(raw) <= 256 * 1024
    with contextlib.redirect_stdout(sys.stderr):
        result = main(json.loads(raw))
    result["resourceBounds"] = bounds
    print(json.dumps(result, separators=(",", ":")))
