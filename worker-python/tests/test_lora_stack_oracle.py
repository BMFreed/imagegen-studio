"""Independent loader-oracle mechanics on small random native SDXL components.

These fixtures are not trained evidence. Expected targets and arithmetic use the
real imported oracle, and subjects call the actual production LoRA loader.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from dataclasses import replace
from functools import lru_cache
from pathlib import Path
from typing import Any

import pytest

from imagegen_worker.inference_lora import load_generation_loras
from test_sdxl_lora import (
    _save,  # pyright: ignore[reportPrivateUsage]
    _state,  # pyright: ignore[reportPrivateUsage]
)
from test_sdxl_lora import native as native


@lru_cache(maxsize=1)
def oracle() -> Any:
    source = Path(__file__).resolve().parents[2] / "scripts" / "noobai-lora-stack-oracle.py"
    spec = importlib.util.spec_from_file_location("igs_native_lora_stack_oracle", source)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def sources(root: Path, torch: Any, pipeline: Any) -> tuple[Any, Any]:
    first, _ = _state(torch, pipeline)
    # Distinct tensors/rank/alpha, overlapping UNet/CLIP1/CLIP2 targets and a
    # smaller B subset. Copying one source under another path cannot pass here.
    selected = (
        "lora_unet_conv_in",
        "lora_te1_text_model_encoder_layers_0_self_attn_q_proj",
        "lora_te2_text_model_encoder_layers_0_mlp_fc2",
    )
    second: dict[str, Any] = {}
    generator = torch.Generator(device="cpu").manual_seed(1803)
    for index, stem in enumerate(selected):
        down, up = first[stem + ".lora_down.weight"], first[stem + ".lora_up.weight"]
        rank = index + 3
        down_shape, up_shape = list(down.shape), list(up.shape)
        down_shape[0], up_shape[1] = rank, rank
        second[stem + ".lora_down.weight"] = torch.randn(down_shape, generator=generator) * 0.13
        second[stem + ".lora_up.weight"] = torch.randn(up_shape, generator=generator) * 0.09
        second[stem + ".alpha"] = torch.tensor(1.25 + index)
    return _save(root / "first.safetensors", first, -0.5), _save(
        root / "second.safetensors", second, 0.75
    )


def assert_plain_restored(pipeline: Any, graph: Any, base: str, torch: Any) -> None:
    assert pipeline.get_list_adapters() == {} and pipeline.get_active_adapters() == []
    assert oracle().graph_identity(pipeline) == graph
    assert oracle().base_state_digest(pipeline, torch) == base


@pytest.mark.parametrize("half_base", [False, True])
def test_distinct_native_sources_additive_order_signed_zero_and_restoration(
    tmp_path: Path, native: Any, half_base: bool, capsys: pytest.CaptureFixture[str]
) -> None:
    torch, pipeline = native
    if half_base:
        for component in (*oracle().COMPONENTS, "vae"):
            getattr(pipeline, component).half()
    entries = sources(tmp_path, torch, pipeline)
    graph, base = oracle().graph_identity(pipeline), oracle().base_state_digest(pipeline, torch)
    rng = torch.get_rng_state().clone()
    result = oracle().qualify_stack_variants(pipeline, entries, torch, load_generation_loras)
    assert result["loaderVariants"] == 6 and result["unionTargetCount"] == 7
    assert [item["variant"] for item in result["variants"]] == [
        "A-only",
        "B-only",
        "AB",
        "BA",
        "A-zero",
        "B-zero",
    ]
    assert result["sources"][0]["targetCount"] == 7
    assert result["sources"][1]["targetCount"] == 3
    assert result["sources"][1]["components"] == {
        "unet": 1,
        "text_encoder": 1,
        "text_encoder_2": 1,
    }
    assert result["sources"][0]["sha256"] != result["sources"][1]["sha256"]
    for flag in (
        "additiveOrderWithinFp32Tolerance",
        "omittedAdapterNeighborsDistinct",
        "exchangedWeightNeighborDistinct",
        "enabledZeroNeighborsMatch",
    ):
        assert result[flag] is True
    for item in result["variants"]:
        for flag in (
            "finiteClosedFormMatches",
            "orderedOwnershipMatches",
            "unloadGraphBaseAndProbeRestored",
            "globalRngRestored",
        ):
            assert item[flag] is True
    assert result["variants"][3]["orderedSources"] == [entries[1].sha256, entries[0].sha256]
    assert result["variants"][3]["weights"] == [0.75, -0.5]
    assert torch.equal(torch.get_rng_state(), rng)
    assert_plain_restored(pipeline, graph, base, torch)
    stages = [
        json.loads(line) for line in capsys.readouterr().err.splitlines() if line.startswith("{")
    ]
    assert [item["completedLoaderVariants"] for item in stages] == list(range(1, 7))


def test_post_validation_swapped_weights_fail_actual_forward_after_two_healthy_variants(
    tmp_path: Path, native: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    torch, pipeline = native
    entries = sources(tmp_path, torch, pipeline)
    graph, base = oracle().graph_identity(pipeline), oracle().base_state_digest(pipeline, torch)
    rng = torch.get_rng_state().clone()

    def swapped_weights(pipeline: Any, stack: tuple[Any, ...], torch: Any) -> None:
        load_generation_loras(pipeline, stack, torch)
        if len(stack) == 2:
            pipeline.set_adapters(
                ["igs_lora_0", "igs_lora_1"], adapter_weights=[stack[1].weight, stack[0].weight]
            )

    with pytest.raises(AssertionError, match="forward differs from independent low-rank algebra"):
        oracle().qualify_stack_variants(pipeline, entries, torch, swapped_weights)
    stages = [
        json.loads(line) for line in capsys.readouterr().err.splitlines() if line.startswith("{")
    ]
    assert [item["variant"] for item in stages if item["status"] == "variant-passed"] == [
        "A-only",
        "B-only",
    ]
    assert stages[-1]["failedVariant"] == "AB" and stages[-1]["completedLoaderVariants"] == 2
    assert "forward differs" in stages[-1]["message"]
    assert torch.equal(torch.get_rng_state(), rng)
    assert_plain_restored(pipeline, graph, base, torch)


@pytest.mark.parametrize("mutation", ["omitted", "wrong-source", "order"])
def test_neighbor_loader_mutations_refused_and_native_graph_restored(
    tmp_path: Path, native: Any, mutation: str
) -> None:
    torch, pipeline = native
    entries = sources(tmp_path, torch, pipeline)
    graph, base = oracle().graph_identity(pipeline), oracle().base_state_digest(pipeline, torch)

    def mutated(pipeline: Any, stack: tuple[Any, ...], torch: Any) -> None:
        if len(stack) != 2:
            load_generation_loras(pipeline, stack, torch)
        elif mutation == "omitted":
            load_generation_loras(pipeline, stack[:1], torch)
        elif mutation == "wrong-source":
            exchanged = tuple(
                replace(entry, path=other.path, sha256=other.sha256, byte_size=other.byte_size)
                for entry, other in zip(stack, reversed(stack), strict=True)
            )
            load_generation_loras(pipeline, exchanged, torch)
        else:
            load_generation_loras(pipeline, stack, torch)
            pipeline.set_adapters(
                ["igs_lora_1", "igs_lora_0"], adapter_weights=[stack[1].weight, stack[0].weight]
            )

    with pytest.raises(AssertionError, match="order|ownership|association"):
        oracle().qualify_stack_variants(pipeline, entries, torch, mutated)
    assert_plain_restored(pipeline, graph, base, torch)


def test_graph_alias_mapping_consumes_sgm_and_both_clip_targets_without_worker_conversion(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    torch, pipeline = native
    state, _ = _state(torch, pipeline)
    direct = "lora_unet_down_blocks_1_attentions_0_transformer_blocks_0_attn1_to_q"
    sgm = "lora_unet_input_blocks_3_1_transformer_blocks_0_attn1_to_q"
    changed = {key.replace(direct, sgm): value for key, value in state.items()}

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("Expected mapping must not call native conversion.")

    monkeypatch.setattr(pipeline, "lora_state_dict", forbidden)
    targets = oracle().build_reference_targets(pipeline, changed, torch)
    assert len(targets) == 7
    identities = {target.identity for target in targets}
    assert ("unet", "down_blocks.1.attentions.0.transformer_blocks.0.attn1.to_q") in identities
    assert ("text_encoder", "text_model.encoder.layers.0.mlp.fc1") in identities
    assert ("text_encoder_2", "text_model.encoder.layers.0.mlp.fc2") in identities
    incomplete = dict(changed)
    del incomplete[sgm + ".lora_up.weight"]
    with pytest.raises(AssertionError):
        oracle().build_reference_targets(pipeline, incomplete, torch)


def test_probe_restores_individual_half_base_and_float_adapter_dtypes_hooks_and_scales(
    tmp_path: Path, native: Any
) -> None:
    torch, pipeline = native
    for component in oracle().COMPONENTS:
        getattr(pipeline, component).half()
    entries = sources(tmp_path, torch, pipeline)
    load_generation_loras(pipeline, (entries[0],), torch)
    module = pipeline.unet.conv_in
    assert module.base_layer.weight.dtype == torch.float16
    # The pinned Conv loader retains F16 adapters. Deliberately create a mixed
    # native module to exercise per-parameter restoration without assuming the
    # loader chooses FP32 for every kind of adapter.
    module.lora_A["igs_lora_0"].float()
    module.lora_B["igs_lora_0"].float()
    assert module.lora_A["igs_lora_0"].weight.dtype == torch.float32
    module.register_buffer("probe_control", torch.tensor([0.25], dtype=torch.float16))
    buffer = module.probe_control
    original = [(tensor, tensor.dtype) for tensor in module.parameters()]
    scale = dict(module.scaling)

    def retained_hook(_module: Any, _args: Any, _output: Any) -> None:
        pass

    hook = module.register_forward_hook(retained_hook)
    before_hooks = dict(module._forward_hooks)
    try:
        with (
            pytest.raises(RuntimeError, match="controlled probe refusal"),
            oracle().float_probe(module),
        ):
            assert module.base_layer.weight.dtype == torch.float32
            raise RuntimeError("controlled probe refusal")
        assert all(tensor.dtype == dtype for tensor, dtype in original)
        assert module.probe_control is buffer
        assert module.probe_control.dtype == torch.float16
        assert module.scaling == scale and module._forward_hooks == before_hooks
    finally:
        hook.remove()
        pipeline.unload_lora_weights()


def test_identical_source_bytes_cannot_qualify_two_distinct_trained_adapters(
    tmp_path: Path, native: Any
) -> None:
    torch, pipeline = native
    entries = sources(tmp_path, torch, pipeline)
    clone = replace(entries[0], path=tmp_path / "another-name.safetensors", weight=0.75)
    with pytest.raises(AssertionError):
        oracle().qualify_stack_variants(pipeline, (entries[0], clone), torch, load_generation_loras)
