"""Opt-in, exact trained Illustrious qualification; ROOT alone executes it.

The author only read source and ran AST/Ruff. No native import, collection,
checkpoint inspection, execution, provisioning, mutation or cleanup is implied.

ROOT supplies IGS_TRAINED_ILLUSTRIOUS_RUN equal to RUN, a fresh ASCII LABEL,
and MODE=record or verify. Each selected test is a serial <=12 GiB host,
zero-swap, <=600-second external unit; CUDA allocator fraction is .75. The
module-scoped fixture calls the actual production loader exactly once. This
suite never repairs, offloads, replaces or clones a complete model/table.

record writes exclusive LABEL-CASE.json records, never an expected file.
verify requires EXPECTED (a filename, optionally containing {case}) and
EXPECTED_SHA256 (a digest or JSON case-to-digest map) under the same env prefix.
The expected record is immutable and ROOT pins it from an earlier GREEN run.
MUTATION, when set, is regional-alias or second-step-permission; only that
production owner's source hash may differ. Native PNG completion and bounded
raw observations precede semantic assertions, including alias-row assertions.
Reports are persisted in finally even on RED. No output substitute is used.

The seven matrix cases are base-cfg2, resource-cfg2, coverage-cfg2, base-pos1,
zero-cfg2, repeat-cfg2, changed-seed-cfg2. Repeat really uses the same Main
recipe; changed seed requires its own Main-captured recipe. Four additional
named mutation selectors reuse those cases and do not enlarge the matrix.
Three separate failure selectors run second-UNet/decode/publication failures
and fresh successful requests. Full value/storage/graph/tokenizer/RNG and
reservation restoration is checked with bounded streaming hashes.
test_trained_recorded_causal_controls checks pinned per-case records together,
including when ROOT executed each matrix case in a separate bounded unit.

This is a private Illustrious worker-PNG boundary. It establishes no generic
SDXL product, trained visual quality, public admission, Main candidate
durability, Add/Save or PP-001/007/008 readiness. The loading journal owns the
independent full checkpoint-key/value census; its report is a separate proof.
"""

from __future__ import annotations

import base64
import copy
import dataclasses
import gc
import hashlib
import importlib
import importlib.util
import inspect
import json
import os
import re
import resource
import sys
import time
from collections import Counter
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from functools import wraps
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest

RUN = Path(
    "/home/user/.codex/artifacts/imagegen-studio/runs/"
    "regional-guidance-trained-illustrious/20261026-epsilon"
)
OLD = Path(
    "/home/user/.codex/artifacts/imagegen-studio/runs/"
    "regional-guidance-shared-text/20261026-final-table"
)
SOURCE = Path(
    "/home/user/.codex/artifacts/imagegen-studio/shared/"
    "illustrious-epsilon-source-20261026/Illustrious-XL-v0.1.safetensors"
)
SOURCE_SHA = "3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9"
SOURCE_BYTES = 6_938_040_760
REPO = Path(__file__).resolve().parents[2]
PREFIX = "IGS_TRAINED_ILLUSTRIOUS_"
BBOX = {"x": -13, "y": 5, "width": 104, "height": 72}
BASE_ROWS = 49408
SCAN_ELEMENTS = 8 * 1024 * 1024
CFG = "cfg-negative-first"
POS = "positive-only"
TOPOLOGY = {
    "down_blocks.1.attentions.0": (2, 2),
    "down_blocks.1.attentions.1": (2, 2),
    "down_blocks.2.attentions.0": (4, 10),
    "down_blocks.2.attentions.1": (4, 10),
    "mid_block.attentions.0": (4, 10),
    "up_blocks.0.attentions.0": (4, 10),
    "up_blocks.0.attentions.1": (4, 10),
    "up_blocks.0.attentions.2": (4, 10),
    "up_blocks.1.attentions.0": (2, 2),
    "up_blocks.1.attentions.1": (2, 2),
    "up_blocks.1.attentions.2": (2, 2),
}
SAMPLED = {
    "down_blocks.1.attentions.0.transformer_blocks.0.attn2",
    "mid_block.attentions.0.transformer_blocks.9.attn2",
    "up_blocks.1.attentions.2.transformer_blocks.1.attn2",
}
CASES = {
    "base-cfg2": ("base", CFG, 2),
    "resource-cfg2": ("resource-neighbor", CFG, 2),
    "coverage-cfg2": ("coverage-neighbor", CFG, 2),
    "base-pos1": ("base", POS, 1),
    "zero-cfg2": ("zero", CFG, 2),
    "repeat-cfg2": ("base", CFG, 2),
    "changed-seed-cfg2": ("changed-seed", CFG, 2),
}
PALETTE = (255, 127, 128, 0, 254, 0, 1, 255, 128, 127, 128, 0, 255, 127, 255)


def _sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _transport(value: Any) -> Any:
    if type(value) is dict:
        if set(cast(dict[str, Any], value)) == {"__test_alpha8_b64__"}:
            return base64.b64decode(
                cast(dict[str, Any], value)["__test_alpha8_b64__"], validate=True
            )
        return {key: _transport(item) for key, item in cast(dict[str, Any], value).items()}
    if type(value) is list:
        return [_transport(item) for item in cast(list[Any], value)]
    return value


def _source_map() -> dict[str, str]:
    paths = sorted((REPO / "worker-python/src/imagegen_worker").rglob("*.py"))
    paths += sorted((REPO / "worker-python/tests").glob("test_illustrious_regional*.py"))
    return {str(path.relative_to(REPO)): _sha(path.read_bytes()) for path in paths}


def _literal_alpha() -> bytes:
    def value(x: int, y: int) -> int:
        anchor = PALETTE[((y // 8) * 13 + x // 8) % 15]
        if x % 8 == 0 and y % 8 == 0:
            return anchor
        if x % 8 == 4 and y % 8 == 4:
            return 255 - anchor
        return int(x in (0, 103) or y in (0, 71))

    return bytes(value(x, y) for y in range(72) for x in range(104))


def _tensor_hash(native: Any, value: Any) -> str:
    """Check contiguity BEFORE flattening; never reshape-copy a large tensor."""
    digest = hashlib.sha256()

    def visit(tensor: Any) -> None:
        tensor = tensor.detach()
        if not tensor.is_contiguous():
            assert tensor.ndim > 0
            for row in tensor.unbind(0):
                visit(row)
            return
        flat = tensor.view(-1)
        for start in range(0, flat.numel(), SCAN_ELEMENTS):
            chunk = flat[start : start + SCAN_ELEMENTS].to(device="cpu").contiguous()
            digest.update(chunk.view(native.torch.uint8).numpy().tobytes())

    visit(value)
    return digest.hexdigest()


@contextmanager
def _preserved(native: Any) -> Generator[None]:
    """No full state clone; shared graph helper retains identities, not values."""
    torch, shared, p = native.torch, native.shared, native.pipeline
    roots = (p.text_encoder, p.text_encoder_2, p.unet, p.vae)
    tensors = tuple(value for root in roots for *_, value in shared._registered(root))
    hashes = tuple(_tensor_hash(native, value) for value in tensors)
    graph_roots = (p.tokenizer, p.tokenizer_2, *roots, p, p.scheduler)
    graph = shared._graph_state(native, graph_roots)
    tokenizers = tuple(
        (t, t.backend_tokenizer.to_str(), shared.e._decoder_binding(t.backend_tokenizer))
        for t in (p.tokenizer, p.tokenizer_2)
    )
    cpu_rng, cuda_rng = torch.random.get_rng_state(), torch.cuda.get_rng_state(0)
    owners, reservations = dict(native.adapter._OWNERS), dict(native.recipe._RESERVATIONS)
    try:
        yield
    finally:
        assert shared._graph_state(native, graph_roots) == graph, "source graph/slots changed"
        for tensor, expected in zip(tensors, hashes, strict=True):
            assert _tensor_hash(native, tensor) == expected, "source parameter/buffer changed"
        for tokenizer, serialized, decoder in tokenizers:
            assert tokenizer.backend_tokenizer.to_str() == serialized
            now = shared.e._decoder_binding(tokenizer.backend_tokenizer)
            assert now[0] is decoder[0] and now[1] is decoder[1]
        assert torch.equal(torch.random.get_rng_state(), cpu_rng)
        assert torch.equal(torch.cuda.get_rng_state(0), cuda_rng)
        assert owners == native.adapter._OWNERS
        assert reservations == native.recipe._RESERVATIONS


def _main_input(native: Any) -> Any:
    """Normalize transport/envelope only. Never rebuild or modify a Main recipe."""
    path = RUN / "main-trained-recipes.json"
    raw = path.read_bytes()
    data = _transport(json.loads(raw))
    variants: Any = data["variants"]
    if type(variants) is list:
        variants = {cast(str, row["name"]): row for row in cast(list[Any], variants)}
    assert set(variants) == {
        "base",
        "resource-neighbor",
        "coverage-neighbor",
        "zero",
        "changed-seed",
    }
    checkpoint = data["checkpoint"]
    reference, resolved = checkpoint["reference"], checkpoint["resolved"]
    assert reference["fileSha256"] == SOURCE_SHA
    assert reference["predictionType"] == "epsilon"
    # Actual ModelService return: size is in the producer checkpoint envelope,
    # objective/hash are in the returned exact reference, never fabricated here.
    assert set(resolved) == {"managedPath", "noiseProfile", "reference"}
    assert Path(resolved["managedPath"]) == SOURCE and resolved["reference"] == reference
    assert checkpoint["byteSize"] == SOURCE_BYTES and checkpoint["sha256"] == SOURCE_SHA
    assert checkpoint["sourcePath"] == str(SOURCE)
    assert resolved["noiseProfile"] == {
        "baseSchedule": "sdxl-scaled-linear-v1",
        "rescaleBetasZeroSnr": False,
        "schemaVersion": 1,
        "timestepSpacing": "leading",
    }
    full = _literal_alpha()
    complement = bytes(0 if value >= 128 else 255 for value in full)
    assert data["expectedFirstLatent"] == [PALETTE[i % 15] for i in range(117)]
    assert data["expectedNegativeLatent"] == [
        0 if PALETTE[i % 15] >= 128 else 255 for i in range(117)
    ]
    states: dict[str, Any] = {}
    for name in ("A", "B", "C", "D"):
        record = data["exactResources"][name]
        binary = Path(record["managedPath"]).read_bytes()
        assert len(binary) == record["byteSize"]
        assert _sha(binary) == record["sha256"] == record["reference"]["fileSha256"]
        state = importlib.import_module("safetensors.torch").load(binary)
        assert set(state) == {"clip_l", "clip_g"}
        for key, width in (("clip_l", 768), ("clip_g", 1280)):
            assert tuple(state[key].shape) == (2, width)
            assert native.torch.isfinite(state[key]).all()
        states[name] = state
    for key in ("clip_l", "clip_g"):
        assert not native.torch.equal(states["A"][key], states["C"][key])
    a, c = (data["exactResources"][name]["reference"] for name in ("A", "C"))
    assert a["localModelId"] == c["localModelId"]
    assert a["localVersionId"] != c["localVersionId"]
    for name, row in variants.items():
        recipe, target = row["recipe"], row["targetMode"]
        assert row["durableUnchanged"] is True  # producer evidence, not rerun here
        assert row["checkpointResolution"] == resolved
        assert re.fullmatch(r"[0-9a-f]{64}", row["durableStateSha256"])
        assert recipe["family"] == "illustrious" and recipe["bbox"] == BBOX
        assert target["mode"] == "txt2img" and target["bbox"] == BBOX
        for field in ("documentId", "documentRevision"):
            assert recipe[field] == target[field]
        assert recipe["item"]["seed"] == (124 if name == "changed-seed" else 123)
        assert len(recipe["regions"]) == (0 if name == "zero" else 3)
        if name != "zero":
            gp, regions = recipe["globalPrompts"], recipe["regions"]
            assert gp["positive"]["text"] == regions[0]["positive"]["text"] == "portrait <shared>"
            assert gp["negative"]["text"] == "blur <shared>"
            assert recipe["item"]["prompts"] == {
                "positive": "portrait <shared>",
                "negative": "blur <shared>",
            }
            assert regions[0]["negative"] == {"prompt": gp["negative"], "source": "current-canvas"}
            assert regions[1]["positive"] == {"text": "", "embeddingRefs": []}
            assert regions[1]["negative"] == {
                "prompt": {"text": "", "embeddingRefs": []},
                "source": "regional",
            }
            assert not any(regions[1]["coverage"]["alpha"])
            assert regions[2]["positive"] is None
            assert regions[2]["negative"]["source"] == "regional"
            assert regions[2]["negative"]["prompt"]["text"] == "haze <shared>"
            assert [region["coverage"]["kind"] for region in regions] == [
                "covered",
                "outside",
                "covered",
            ]
            assert regions[0]["coverage"]["alpha"] == (
                complement if name == "coverage-neighbor" else full
            )
            assert regions[1]["coverage"]["alpha"] == bytes(104 * 72)
            assert regions[2]["coverage"]["alpha"] == complement
            signed = (
                (gp["positive"], recipe["globalEmbeddings"]["positive"], "A"),
                (gp["negative"], recipe["globalEmbeddings"]["negative"], "B"),
                (
                    regions[0]["positive"],
                    regions[0]["embeddings"]["positive"],
                    "A" if name == "resource-neighbor" else "C",
                ),
                (regions[0]["negative"]["prompt"], regions[0]["embeddings"]["negative"], "B"),
                (regions[2]["negative"]["prompt"], regions[2]["embeddings"]["negative"], "D"),
            )
            for prompt, descriptors, resource_name in signed:
                record = data["exactResources"][resource_name]
                assert prompt["embeddingRefs"] == [
                    {"token": "<shared>", "resource": record["reference"]}
                ]
                assert descriptors == [
                    {
                        "token": "<shared>",
                        "reference": record["reference"],
                        "managedPath": record["managedPath"],
                        "byteSize": record["byteSize"],
                    }
                ]
        else:
            assert recipe["globalEmbeddings"] == {"positive": [], "negative": []}
            assert all(not p["embeddingRefs"] for p in recipe["globalPrompts"].values())
    return SimpleNamespace(
        data=data,
        variants=variants,
        states=states,
        raw=raw,
        sha256=_sha(raw),
        resolved=resolved,
        reference=reference,
    )


@pytest.fixture(scope="module")
def trained() -> Iterator[Any]:
    requested = os.environ.get(PREFIX + "RUN")
    if requested is None:
        pytest.skip("opt in with IGS_TRAINED_ILLUSTRIOUS_RUN=<exact trained RUN>")
    assert Path(requested) == RUN
    mode = os.environ.get(PREFIX + "MODE")
    assert mode in ("record", "verify"), "explicit record/verify policy required"
    label = os.environ.get(PREFIX + "LABEL", "")
    assert re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", label), "fresh LABEL required"
    inference = importlib.import_module("imagegen_worker.inference")
    shared = importlib.import_module("test_illustrious_regional_shared_text")
    runtime = inference.qualify_ml_runtime()
    torch = runtime.torch
    assert torch.cuda.is_available(), "opted-in CUDA qualification cannot skip"
    torch.set_num_threads(1)
    torch.cuda.set_per_process_memory_fraction(0.75, 0)
    journal_path = RUN / "trained_loading_journal.py"
    spec = importlib.util.spec_from_file_location("_trained_loading_journal", journal_path)
    assert spec is not None and spec.loader is not None
    journal_module = importlib.util.module_from_spec(spec)
    # dataclasses and reader/converter aliases need their real module entry.
    assert spec.name not in sys.modules
    sys.modules[spec.name] = journal_module
    try:
        spec.loader.exec_module(journal_module)
        parameters = shared.e._parameters(
            "a quiet river valley, trees, soft daylight",
            "blur, low quality",
            checkpoint_path=SOURCE,
            checkpoint_sha256=SOURCE_SHA,
            prediction_type="epsilon",
            seed=123,
            steps=2,
            cfg_scale=5.0,
            scheduler="euler",
            vae_precision="FP16",
        )
        assert parameters.vae is None and parameters.loras == ()
        assert parameters.positive_embeddings == parameters.negative_embeddings == ()
        with torch.no_grad():
            with journal_module.loading_journal(
                torch, SOURCE, RUN / f"{label}-loading.json"
            ) as journal:
                pipeline, inputs = inference.load_illustrious_pipeline(
                    parameters, config_dir=OLD / "retained-config", runtime=runtime, mode="txt2img"
                )
                for component in (
                    pipeline.text_encoder,
                    pipeline.text_encoder_2,
                    pipeline.unet,
                    pipeline.vae,
                ):
                    component.eval()
                journal.verify(pipeline)
            for component in (
                pipeline.text_encoder,
                pipeline.text_encoder_2,
                pipeline.unet,
                pipeline.vae,
            ):
                component.eval()
                assert component.device == torch.device("cuda:0")
                assert component.dtype == torch.float16
            counts = [
                sum(p.numel() for p in model.parameters())
                for model in (
                    pipeline.text_encoder,
                    pipeline.text_encoder_2,
                    pipeline.unet,
                    pipeline.vae,
                )
            ]
            assert counts == [123060480, 694659840, 2567463684, 83653863]
            assert pipeline.vae.config.force_upcast is False
            warm = inference.prepare_illustrious_conditioning(parameters, pipeline, runtime, inputs)
            assert torch.isfinite(warm.positive).all() and torch.isfinite(warm.negative).all()
            del warm
            adapter = importlib.import_module(
                "imagegen_worker.illustrious_regional_attention_adapter"
            )
            parents = {
                name: module
                for name, module in pipeline.unet.named_modules()
                if type(module) is runtime.diffusers.Transformer2DModel
            }
            assert set(parents) == set(TOPOLOGY)
            sites: dict[int, Any] = {}
            bindings: list[Any] = []
            for name, (factor, depth) in TOPOLOGY.items():
                parent = parents[name]
                assert len(parent.transformer_blocks) == depth
                bindings.append(adapter.TransformerBinding(parent, factor))
                for index, block in enumerate(parent.transformer_blocks):
                    attention = block.attn2
                    assert attention.heads == (10 if factor == 2 else 20)
                    assert attention.to_q.out_features // attention.heads == 64
                    assert attention.upcast_attention is None  # preserve actual native metadata
                    sites[id(attention)] = SimpleNamespace(
                        name=f"{name}.transformer_blocks.{index}.attn2",
                        factor=factor,
                        attention=attention,
                        original=attention.processor,
                    )
            assert len(parents) == 11 and len(sites) == 70
            processor_type = cast(Any, type(next(iter(sites.values())).original))
            assert processor_type.__name__ == "AttnProcessor2_0"
            assert all(type(site.original) is processor_type for site in sites.values())
            native = SimpleNamespace(
                torch=torch,
                runtime=runtime,
                diffusers=runtime.diffusers,
                transformers=importlib.import_module("transformers"),
                pipeline=pipeline,
                inference=inference,
                shared=shared,
                device="cuda",
                dtype=torch.float16,
                recipe=importlib.import_module("imagegen_worker.illustrious_regional_recipe"),
                denoising=importlib.import_module("imagegen_worker.illustrious_regional_denoising"),
                output=importlib.import_module("imagegen_worker.illustrious_regional_output"),
                adapter=adapter,
                processor_type=processor_type,
                sites=sites,
                bindings=tuple(bindings),
                label=label,
                mode=mode,
                records={},
                source_sha256=_source_map(),
                journal_sha256=_sha(journal_path.read_bytes()),
                main_producer_sha256=_sha((RUN / "probe-main-trained-recipes.mts").read_bytes()),
            )
            native.main = _main_input(native)
            yield native
            assert _source_map() == native.source_sha256, "source changed during ROOT unit"
            assert (RUN / "main-trained-recipes.json").read_bytes() == native.main.raw
    finally:
        sys.modules.pop(spec.name, None)


def _case(native: Any, row: Any, name: str, layout: str, steps: int) -> Any:
    protocol = importlib.import_module("imagegen_worker.protocol")
    derivatives = importlib.import_module("imagegen_worker.derivatives")
    image_type = importlib.import_module("PIL.Image")
    recipe, target = row["recipe"], row["targetMode"]
    root = RUN / "payloads" / native.label / name
    root.mkdir(mode=0o700, parents=True, exist_ok=False)
    target_source = Path(target["retainedPng"])
    if not target_source.is_absolute():
        target_source = RUN / target_source
    binary = target_source.read_bytes()
    assert len(binary) == target["byteSize"] and _sha(binary) == target["sha256"]
    with image_type.open(target_source) as image:
        image.load()
        assert image.format == "PNG" and image.mode == "RGBA" and image.size == (104, 72)
        assert image.info["icc_profile"] == derivatives.SRGB_ICC_PROFILE
        assert image.getchannel("A").getextrema() == (0, 0)
    local_target = root / "target.png"
    local_target.write_bytes(binary)
    item = recipe["item"]
    parameters = native.shared.e._parameters(
        item["prompts"]["positive"],
        item["prompts"]["negative"],
        checkpoint_path=SOURCE,
        checkpoint_sha256=SOURCE_SHA,
        prediction_type="epsilon",
        seed=item["seed"],
        steps=steps,
        cfg_scale=5.0 if layout == CFG else 1.0,
        scheduler="euler",
        vae_precision="FP16",
    )
    assert parameters.noise_profile is None
    command = protocol.GenerateIllustriousTxt2ImgCommand(
        **{
            field.name: getattr(parameters, field.name)
            for field in dataclasses.fields(protocol.IllustriousInferenceParameters)
        },
        request_id=f"trained-{native.label}-{name}",
        target_path=local_target,
        target_sha256=_sha(binary),
        target_byte_size=len(binary),
        target_icc_sha256=derivatives.PINNED_SRGB_ICC_SHA256,
        width=104,
        height=72,
        bbox=copy.deepcopy(BBOX),
        staging_root=root,
        output_path=root / "candidate.png",
    )
    everywhere = importlib.import_module(
        "imagegen_worker.illustrious_regional_attention"
    ).Everywhere
    args = {
        "pipeline": native.pipeline,
        "runtime": native.runtime,
        # Genuine Main zero includes explicit empty globalEmbeddings. The
        # existing shared profile accepts it and returns prepare=None without
        # private tables/load; stripping that field would forge the recipe.
        "profile": native.shared.CUDA_ENCODING,
        "denoising_profile": "ordinary-canvas-euler-txt2img-cuda-fp16-v1",
        "global_negative_coverage": everywhere(),
        "global_positive_coverage": everywhere(),
        "negative_pooled_source_id": "current-canvas",
        "positive_pooled_source_id": "current-canvas",
        "bindings": native.bindings,
        "layout": layout,
    }
    return SimpleNamespace(
        recipe=recipe,
        command=command,
        parameters=parameters,
        args=args,
        root=root,
        target=local_target,
        row=row,
        layout=layout,
        steps=steps,
    )


@contextmanager
def _original_pt(native: Any, patcher: Any) -> Generator[Any]:
    """Snapshot only the small original native image, before RGB conversion."""
    entry = native.output.run_current_canvas_regional_denoising
    observed = SimpleNamespace(result=None, image=None)

    @wraps(entry)
    def consume(*args: Any, **kwargs: Any) -> Any:
        result = entry(*args, **kwargs)
        assert observed.result is None
        observed.result = result
        observed.image = result.images.detach().clone()
        return result

    with patcher.context() as patch:
        patch.setattr(native.output, "run_current_canvas_regional_denoising", consume)
        yield observed


def _latent(alpha: bytes) -> tuple[int, ...]:
    assert type(alpha) is bytes and len(alpha) == 104 * 72
    return tuple(alpha[8 * y * 104 + 8 * x] for y in range(9) for x in range(13))


def _pooled(samples: tuple[int, ...], factor: int) -> tuple[bool, ...]:
    """Independent CPU nearest8 -> threshold128 -> ceil 2x2 max pooling."""
    height, width = 9, 13
    level = tuple(value >= 128 for value in samples)
    for _ in range({2: 1, 4: 2}[factor]):
        next_height, next_width = (height + 1) // 2, (width + 1) // 2
        level = tuple(
            any(
                level[yy * width + xx]
                for yy in range(2 * y, min(2 * y + 2, height))
                for xx in range(2 * x, min(2 * x + 2, width))
            )
            for y in range(next_height)
            for x in range(next_width)
        )
        height, width = next_height, next_width
    assert (height, width) == ({2: (5, 7), 4: (3, 4)}[factor])
    return level


def _expected_mask(native: Any, recipe: Any, layout: str, factor: int) -> Any:
    torch = native.torch
    heads, queries = (10, 35) if factor == 2 else (20, 12)
    batch, keys = (2 if layout == CFG else 1), (308 if recipe["regions"] else 77)
    allowed = torch.zeros(batch, heads, queries, keys, dtype=torch.bool)
    allowed[:, :, :, :77] = True
    for index, region in enumerate(recipe["regions"]):
        assert region["coverage"]["bounds"] == BBOX
        support = torch.tensor(_pooled(_latent(region["coverage"]["alpha"]), factor))
        start = (index + 1) * 77
        if region["positive"] is not None:
            allowed[-1, :, :, start : start + 77] = support[None, :, None]
        if layout == CFG:
            allowed[0, :, :, start : start + 77] = support[None, :, None]
    return allowed.to(device="cuda:0")


def _mask(native: Any, value: Any, batch: int, heads: int, queries: int, keys: int) -> Any:
    torch = native.torch
    if value is None:
        return torch.ones(batch, heads, queries, keys, dtype=torch.bool, device="cuda:0")
    if value.ndim == 3:
        value = value.reshape(batch, heads, value.shape[-2], keys)
    assert value.ndim == 4 and value.shape[0] == batch and value.shape[-1] == keys
    allowed = value if value.dtype == torch.bool else value == 0
    return allowed.expand(batch, heads, queries, keys)


@contextmanager
def _all_sites(native: Any, patcher: Any) -> Generator[Any]:
    """Class/function spies call originals; no instance hooks or model attributes."""
    torch = native.torch
    processor = native.processor_type.__call__
    forward = cast(Any, type(native.pipeline.unet)).forward
    sdpa = torch.nn.functional.scaled_dot_product_attention
    state = SimpleNamespace(step=0, roots=[], sites=[], samples=[], active=[])

    @wraps(forward)
    def unet(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is not native.pipeline.unet:
            return forward(current, *args, **kwargs)
        bound = inspect.signature(forward).bind(current, *args, **kwargs).arguments
        state.step += 1
        added = bound["added_cond_kwargs"]
        record = {
            "step": state.step,
            "sample": _tensor_hash(native, bound["sample"]),
            "context": _tensor_hash(native, bound["encoder_hidden_states"]),
            "pools": _tensor_hash(native, added["text_embeds"]),
            "timeIds": _tensor_hash(native, added["time_ids"]),
        }
        state.roots.append(record)
        result: Any = forward(current, *args, **kwargs)
        prediction = (
            cast(tuple[Any, ...], result)[0] if isinstance(result, tuple) else result.sample
        )
        record["prediction"] = _tensor_hash(native, prediction)
        return cast(Any, result)

    @wraps(processor)
    def original_processor(current: Any, attention: Any, *args: Any, **kwargs: Any) -> Any:
        site = native.sites.get(id(attention))
        if site is None:
            return processor(current, attention, *args, **kwargs)
        assert current is site.original
        bound = inspect.signature(processor).bind(current, attention, *args, **kwargs)
        bound.apply_defaults()
        hidden, context = bound.arguments["hidden_states"], bound.arguments["encoder_hidden_states"]
        assert hidden.ndim == context.ndim == 3
        batch, queries, _ = hidden.shape
        keys, heads = context.shape[1], attention.heads
        assert queries == (35 if site.factor == 2 else 12)
        assert (
            attention.norm_q
            is attention.norm_k
            is attention.group_norm
            is attention.spatial_norm
            is None
        )
        assert not attention.norm_cross and not attention.residual_connection
        assert attention.rescale_output_factor == 1.0
        allowed = _mask(native, bound.arguments.get("attention_mask"), batch, heads, queries, keys)
        linear = torch.nn.functional.linear

        def project(value: Any, layer: Any) -> Any:
            return (
                linear(value, layer.weight, layer.bias).view(batch, -1, heads, 64).transpose(1, 2)
            )

        frame = SimpleNamespace(
            record={
                "step": state.step,
                "site": site.name,
                "factor": site.factor,
                "heads": heads,
                "queries": queries,
                "keys": keys,
                "context": _tensor_hash(native, context),
                "mask": _tensor_hash(native, allowed),
                "sdpaCalls": 0,
            },
            q=project(hidden, attention.to_q),
            k=project(context, attention.to_k),
            v=project(context, attention.to_v),
            allowed=allowed,
        )
        state.sites.append(frame.record)
        state.active.append(frame)
        indices = (0, queries // 2, queries - 1)
        query_sample = hidden[:, indices].detach().clone() if site.name in SAMPLED else None
        try:
            result = processor(current, attention, *args, **kwargs)
        finally:
            assert state.active.pop() is frame
        assert frame.record["sdpaCalls"] == 1, "original processor did not call native SDPA"
        frame.record["output"] = _tensor_hash(native, result)
        if query_sample is not None:
            state.samples.append(
                SimpleNamespace(
                    name=site.name,
                    step=state.step,
                    indices=indices,
                    query=query_sample,
                    output=result[:, indices].detach().clone(),
                    mask=allowed[:, :, indices].detach().clone(),
                    attention=attention,
                )
            )
        return result

    @wraps(sdpa)
    def native_sdpa(*args: Any, **kwargs: Any) -> Any:
        if state.active:
            frame = state.active[-1]
            q, k, v = args[:3]
            mask = args[3] if len(args) > 3 else kwargs.get("attn_mask")
            drop = args[4] if len(args) > 4 else kwargs.get("dropout_p", 0.0)
            causal = args[5] if len(args) > 5 else kwargs.get("is_causal", False)
            assert drop == 0.0 and causal is False and kwargs.get("scale") is None
            assert q.dtype == k.dtype == v.dtype == torch.float16
            assert q.device == k.device == v.device == torch.device("cuda:0")
            assert torch.equal(q, frame.q) and torch.equal(k, frame.k) and torch.equal(v, frame.v)
            actual = _mask(native, mask, q.shape[0], q.shape[1], q.shape[2], k.shape[2])
            assert torch.equal(actual, frame.allowed), "native SDPA lost processor permissions"
            frame.record["sdpaCalls"] += 1
        return sdpa(*args, **kwargs)

    with patcher.context() as patch:
        patch.setattr(type(native.pipeline.unet), "forward", unet)
        patch.setattr(native.processor_type, "__call__", original_processor)
        patch.setattr(torch.nn.functional, "scaled_dot_product_attention", native_sdpa)
        yield state


def _oracle(native: Any, execution: Any, states: Any, resource_neighbor: bool) -> dict[str, Any]:
    """Fresh independent tokenizers; only ten PRIVATE suffix rows are borrowed."""
    torch, compel = native.torch, native.runtime.compel
    aliases = ("oracle_a", "oracle_b", "oracle_c", "oracle_inherited_b", "oracle_d")
    names = [name for alias in aliases for name in (alias, alias + "_1")]
    order = ("A", "B", "A" if resource_neighbor else "C", "B", "D")
    texts = {
        "a": "portrait oracle_a oracle_a_1",
        "b": "blur oracle_b oracle_b_1",
        "c": "portrait oracle_c oracle_c_1",
        "d": "haze oracle_d oracle_d_1",
    }
    chunks: dict[str, list[Any]] = {name: [] for name in texts}
    pools: dict[str, Any] = {}
    for index, (key, width) in enumerate((("clip_l", 768), ("clip_g", 1280))):
        encoder = (execution.text_encoder, execution.text_encoder_2)[index]
        source = (native.pipeline.text_encoder, native.pipeline.text_encoder_2)[index]
        table = encoder.get_input_embeddings().weight
        assert table is not source.get_input_embeddings().weight
        assert native.shared._storage(table) != native.shared._storage(
            source.get_input_embeddings().weight
        )
        assert tuple(table.shape) == (BASE_ROWS + 10, width)
        suffix = table[BASE_ROWS:].detach().clone()
        tokenizer = native.transformers.CLIPTokenizer.from_pretrained(
            OLD / "retained-config" / ("tokenizer" if index == 0 else "tokenizer_2"),
            local_files_only=True,
        )
        assert len(tokenizer) == BASE_ROWS and tokenizer.add_tokens(names) == 10
        assert [tokenizer.convert_tokens_to_ids(name) for name in names] == list(
            range(BASE_ROWS, BASE_ROWS + 10)
        )
        rows = torch.cat(
            [states[name][key].to(device=encoder.device, dtype=encoder.dtype) for name in order]
        )
        try:
            table[BASE_ROWS:].copy_(rows)
            builder = compel.Compel(
                tokenizer=tokenizer,
                text_encoder=encoder,
                returned_embeddings_type=compel.ReturnedEmbeddingsType.PENULTIMATE_HIDDEN_STATES_NON_NORMALIZED,
                truncate_long_prompts=False,
                split_long_text_mode=compel.SplitLongTextMode.SENTENCES,
                requires_pooled=index == 1,
                textual_inversion_manager=None,
            )
            for name, text in texts.items():
                result = builder(text)
                hidden, pool = result if index == 1 else (result, None)
                assert tuple(hidden.shape) == (1, 77, width)
                chunks[name].append(hidden.detach())
                if index == 1:
                    pools[name] = cast(Any, pool).detach()
        finally:
            table[BASE_ROWS:].copy_(suffix)
            assert torch.equal(table[BASE_ROWS:], suffix)
        del builder, tokenizer, rows, suffix
    return {
        name: SimpleNamespace(hidden=torch.cat(chunks[name], dim=-1), pooled=pools[name])
        for name in texts
    }


def _plain_oracle(native: Any, recipe: Any) -> tuple[Any, ...]:
    """Direct Compel on source CLIPs, independent of the worker pair builder."""
    torch, compel, p = native.torch, native.runtime.compel, native.pipeline
    chunks: list[list[Any]] = [[], []]
    pools: list[Any] = []
    for index, (tokenizer, encoder) in enumerate(
        ((p.tokenizer, p.text_encoder), (p.tokenizer_2, p.text_encoder_2))
    ):
        builder = compel.Compel(
            tokenizer=tokenizer,
            text_encoder=encoder,
            returned_embeddings_type=compel.ReturnedEmbeddingsType.PENULTIMATE_HIDDEN_STATES_NON_NORMALIZED,
            truncate_long_prompts=False,
            split_long_text_mode=compel.SplitLongTextMode.SENTENCES,
            requires_pooled=index == 1,
            textual_inversion_manager=None,
        )
        for sign, name in enumerate(("positive", "negative")):
            text = recipe["item"]["prompts"][name]
            if text:
                result = builder(text)
                hidden, pool = result if index == 1 else (result, None)
            else:
                hidden = torch.zeros(
                    1, 77, encoder.config.hidden_size, device=encoder.device, dtype=encoder.dtype
                )
                pool = torch.zeros(
                    1, encoder.config.hidden_size, device=encoder.device, dtype=encoder.dtype
                )
            chunks[sign].append(hidden)
            if index == 1:
                pools.append(pool)
    return torch.cat(chunks[0], dim=-1), torch.cat(chunks[1], dim=-1), pools[0], pools[1]


def _conditioning(native: Any, seen: Any, recipe: Any, resource_neighbor: bool) -> Any:
    torch = native.torch
    if not recipe["regions"]:
        expected = _plain_oracle(native, recipe)
        pairs = [expected]
    else:
        oracle = _oracle(native, seen.pairs[0].pipeline, native.main.states, resource_neighbor)
        assert torch.equal(oracle["a"].hidden, oracle["c"].hidden) == resource_neighbor
        zero, zero_pool = torch.zeros_like(oracle["a"].hidden), torch.zeros_like(oracle["a"].pooled)
        pairs = [
            (oracle["a"].hidden, oracle["b"].hidden, oracle["a"].pooled, oracle["b"].pooled),
            (oracle["c"].hidden, oracle["b"].hidden, oracle["c"].pooled, oracle["b"].pooled),
            (zero, zero, zero_pool, zero_pool),
            (zero, oracle["d"].hidden, zero_pool, oracle["d"].pooled),
        ]
    assert len(seen.pairs) == len(pairs)
    for actual, expected_pair in zip(seen.pairs, pairs, strict=True):
        for name, value in zip(
            ("positive", "negative", "positive_pooled", "negative_pooled"),
            expected_pair,
            strict=True,
        ):
            assert torch.equal(getattr(actual.result, name), value), (
                f"independent Compel {name} mismatch"
            )
        assert actual.result.positive_length == actual.result.negative_length == 77
    positive = torch.cat([pair[0] for pair in pairs], dim=1)
    negative = torch.cat([pair[1] for pair in pairs], dim=1)
    return SimpleNamespace(
        positive=positive,
        negative=negative,
        positive_pooled=pairs[0][2],
        negative_pooled=pairs[0][3],
        positive_length=77 if len(pairs) == 1 else 231,
        negative_length=77 if len(pairs) == 1 else 308,
    )


def _rows(native: Any, seen: Any, resource_neighbor: bool) -> None:
    shared = native.shared
    assert len(seen.plans) == 1 and len(seen.pairs) == 4
    assert len(seen.loads) == len(seen.resizes) == len(seen.allocations) == 2
    assert len(seen.encoder_calls) == 15
    assert seen.plans[0].prepared.aliases == tuple(f"igs_ti_private_{i}" for i in range(5))
    assert seen.plans[0].prepared.counts == (2,) * 5
    aliases = {
        f"igs_ti_private_{i}" + ("_1" if row else ""): BASE_ROWS + 2 * i + row
        for i in range(5)
        for row in range(2)
    }
    for loaded in seen.loads:
        assert loaded.aliases == aliases and loaded.ids == list(range(BASE_ROWS, BASE_ROWS + 10))
    expected_text = (
        ("portrait igs_ti_private_0", "blur igs_ti_private_1"),
        ("portrait igs_ti_private_2", "blur igs_ti_private_3"),
        ("", ""),
        ("", "haze igs_ti_private_4"),
    )
    for pair, texts in zip(seen.pairs, expected_text, strict=True):
        assert pair.inputs.prompts == texts
    for alias_index, pair_index, sign, name in (
        (0, 0, 0, "A"),
        (1, 0, 1, "B"),
        (2, 1, 0, "A" if resource_neighbor else "C"),
        (3, 1, 1, "B"),
        (4, 3, 1, "D"),
    ):
        pair = seen.pairs[pair_index]
        alias = f"igs_ti_private_{alias_index}"
        assert alias in pair.inputs.prompts[sign]
        view = SimpleNamespace(
            pairs=[
                SimpleNamespace(
                    pipeline=pair.pipeline,
                    inputs=SimpleNamespace(prompts=(alias,), managers=pair.inputs.managers),
                )
            ],
            loads=seen.loads,
            encoder_calls=seen.encoder_calls,
        )
        shared._alias_rows(native, view, 0, native.main.states[name])
    shared._budget(native, seen)


def _dense(native: Any, sample: Any, context: Any, allowed: Any) -> dict[str, Any]:
    """Dynamic trained heads=10/20, width=64; FP32 independent dense softmax."""
    torch, a = native.torch, sample.attention
    linear = torch.nn.functional.linear
    batch, queries, _ = sample.query.shape
    heads = a.heads
    q = (
        linear(sample.query, a.to_q.weight, a.to_q.bias)
        .view(batch, queries, heads, 64)
        .transpose(1, 2)
        .float()
    )
    k = (
        linear(context, a.to_k.weight, a.to_k.bias)
        .view(batch, -1, heads, 64)
        .transpose(1, 2)
        .float()
    )
    v = (
        linear(context, a.to_v.weight, a.to_v.bias)
        .view(batch, -1, heads, 64)
        .transpose(1, 2)
        .float()
    )
    probabilities = ((q @ k.transpose(-1, -2)) / 8.0).masked_fill(~allowed, -torch.inf).softmax(-1)
    attended = (
        (probabilities @ v)
        .transpose(1, 2)
        .reshape(batch, queries, heads * 64)
        .to(dtype=torch.float16)
    )
    expected = linear(attended, a.to_out[0].weight, a.to_out[0].bias)
    error = sample.output.float() - expected.float()
    rms = float(expected.float().square().mean().sqrt())
    relative_rms = float(error.square().mean().sqrt()) / max(rms, 1e-8)
    # Eight half-precision epsilons allow fused-vs-dense accumulation and final
    # projection rounding. Exact context/mask/projection associations are checked
    # separately; this tolerance cannot excuse the wrong resource or support.
    epsilon = torch.finfo(torch.float16).eps
    atol, rtol = 8 * epsilon * max(1.0, rms), 8 * epsilon
    record = {
        "step": sample.step,
        "site": sample.name,
        "heads": heads,
        "headWidth": 64,
        "querySha256": _tensor_hash(native, sample.query),
        "outputSha256": _tensor_hash(native, sample.output),
        "oracleSha256": _tensor_hash(native, expected),
        "maxAbsError": float(error.abs().max()),
        "relativeRmsError": relative_rms,
        "atol": atol,
        "rtol": rtol,
        "toleranceBasis": "8 FP16 eps, unit/RMS absolute floor; 16 eps relative RMS",
        "passed": bool(torch.allclose(sample.output, expected, atol=atol, rtol=rtol))
        and relative_rms <= 16 * epsilon,
    }
    return record


def _assert_native(native: Any, case: Any, seen: Any, all_sites: Any, report: Any) -> None:
    torch = native.torch
    conditioning = _conditioning(
        native, seen, case.recipe, report["variant"] == "resource-neighbor"
    )
    context = (
        torch.cat((conditioning.negative, conditioning.positive))
        if case.layout == CFG
        else conditioning.positive
    )
    pools = (
        torch.cat((conditioning.negative_pooled, conditioning.positive_pooled))
        if case.layout == CFG
        else conditioning.positive_pooled
    )
    times = torch.tensor(
        [[1024, 1024, 0, 0, 1024, 1024]], device="cuda:0", dtype=torch.float16
    ).repeat(len(context), 1)
    expected_masks = {
        factor: _expected_mask(native, case.recipe, case.layout, factor) for factor in (2, 4)
    }
    report["expected"] = {
        "context": _tensor_hash(native, context),
        "pools": _tensor_hash(native, pools),
        "timeIds": _tensor_hash(native, times),
        "masks": {str(f): _tensor_hash(native, mask) for f, mask in expected_masks.items()},
        "streams": [
            {
                name: _tensor_hash(native, getattr(pair.result, name))
                for name in ("positive", "negative", "positive_pooled", "negative_pooled")
            }
            for pair in seen.pairs
        ],
    }
    assert len(all_sites.roots) == len(seen.unet_results) == len(seen.steps) == case.steps
    assert len(seen.decodes) == len(seen.decode_results) == len(seen.pipeline_results) == 1
    assert seen.events == [event for _ in range(case.steps) for event in ("unet", "step")] + [
        "decode"
    ]
    expected_names = {site.name for site in native.sites.values()}
    for step in range(1, case.steps + 1):
        rows = [record for record in all_sites.sites if record["step"] == step]
        assert Counter(row["site"] for row in rows) == Counter({name: 1 for name in expected_names})
        for row in rows:
            assert row["context"] == report["expected"]["context"], (
                f"wrong context at {row['site']} step {step}"
            )
            assert row["mask"] == report["expected"]["masks"][str(row["factor"])], (
                f"wrong permissions at {row['site']} step {step}"
            )
            assert row["sdpaCalls"] == 1
    for root in all_sites.roots:
        for key in ("context", "pools", "timeIds"):
            assert root[key] == report["expected"][key]
    report["dense"] = [
        _dense(
            native,
            sample,
            context,
            expected_masks[native.sites[id(sample.attention)].factor][:, :, sample.indices],
        )
        for sample in all_sites.samples
    ]
    assert len(report["dense"]) == 3 * case.steps
    assert all(record["passed"] for record in report["dense"]), (
        "trained dense oracle exceeded measured tolerance"
    )
    if case.recipe["regions"]:
        _rows(native, seen, report["variant"] == "resource-neighbor")
        plan = seen.scopes[0].plan
        identities = ("current-canvas", *(region["regionId"] for region in case.recipe["regions"]))
        for sign, count in (("negative", 4), ("positive", 3)):
            native.shared.e._assert_ranges(
                plan,
                sign,
                tuple(
                    (identity, i * 77, (i + 1) * 77)
                    for i, identity in enumerate(identities[:count])
                ),
            )
    else:
        assert not seen.loads and not seen.allocations and not seen.resizes
        assert seen.plans == [None]
        assert seen.pairs[0].pipeline is native.pipeline
    assert len(seen.pairs) == (4 if case.recipe["regions"] else 1), "encoding repeated per step"
    scheduler = seen.schedulers[0]
    assert type(scheduler) is native.diffusers.EulerDiscreteScheduler
    assert scheduler is not native.pipeline.scheduler
    for key, value in {
        "num_train_timesteps": 1000,
        "beta_start": 0.00085,
        "beta_end": 0.012,
        "beta_schedule": "scaled_linear",
        "steps_offset": 1,
        "timestep_spacing": "linspace",
        "prediction_type": "epsilon",
        "rescale_betas_zero_snr": False,
    }.items():
        assert scheduler.config[key] == value
    assert seen.generators[0].device.type == "cpu"
    assert seen.generators[0].initial_seed() == case.command.seed
    assert all(seen.decode_reserved)
    assert (
        seen.pipelines[0].unet is native.pipeline.unet
        and seen.pipelines[0].vae is native.pipeline.vae
    )
    assert seen.pipelines[0] is not native.pipeline
    for root in seen.root_inputs:
        assert root["timestep"].dtype == torch.float32 and root["timestep"].device == torch.device(
            "cuda:0"
        )
        assert tuple(root["sample"].shape) == (len(context), 4, 9, 13)
    for decode in seen.decodes:
        assert tuple(decode.shape) == (1, 4, 9, 13) and decode.dtype == torch.float16


def _png(native: Any, case: Any, result: Any, original_image: Any, receipt: Any) -> bytes:
    image_type = importlib.import_module("PIL.Image")
    derivatives = importlib.import_module("imagegen_worker.derivatives")
    torch = native.torch
    assert torch.equal(result.images, original_image), "output owner modified original native PT"
    tensor = original_image
    assert tuple(tensor.shape) == (1, 3, 72, 104)
    assert tensor.dtype == torch.float16 and tensor.device == torch.device("cuda:0")
    assert not tensor.requires_grad and torch.isfinite(tensor).all()
    assert (tensor >= 0).all() and (tensor <= 1).all()
    # Match the documented float32 -> HWC -> nearest-even byte quantization,
    # independently of both worker RGB conversion and Diffusers image helpers.
    array = tensor.detach().cpu().float()[0].permute(1, 2, 0).numpy()
    expected = (array * 255).round().astype("uint8").tobytes()
    with image_type.open(case.command.output_path) as image:
        image.load()
        assert image.format == "PNG" and image.mode == "RGB" and image.size == (104, 72)
        assert image.info["icc_profile"] == derivatives.SRGB_ICC_PROFILE
        assert image.tobytes() == expected, "published RGB differs from original native PT"
    assert receipt["type"] == "generation-done" and receipt["protocolVersion"] == "1"
    assert receipt["requestId"] == case.command.request_id
    assert receipt["seed"] == case.recipe["item"]["seed"]
    assert receipt["outputPath"] == str(case.command.output_path)
    assert not list(case.root.glob(".*.tmp"))
    return expected


def _ordinary(native: Any, case: Any, regional: Any, report: Any) -> None:
    """Original native pipeline/processors, literal scheduler and direct Compel."""
    torch, p = native.torch, native.pipeline
    assert not case.recipe["regions"]
    assert all(site.attention.processor is site.original for site in native.sites.values())
    positive, negative, positive_pool, negative_pool = _plain_oracle(native, case.recipe)
    scheduler = native.diffusers.EulerDiscreteScheduler(
        num_train_timesteps=1000,
        beta_start=0.00085,
        beta_end=0.012,
        beta_schedule="scaled_linear",
        trained_betas=None,
        prediction_type="epsilon",
        steps_offset=1,
        timestep_spacing="linspace",
        rescale_betas_zero_snr=False,
    )
    ordinary = native.diffusers.StableDiffusionXLPipeline(
        vae=p.vae,
        text_encoder=p.text_encoder,
        text_encoder_2=p.text_encoder_2,
        tokenizer=p.tokenizer,
        tokenizer_2=p.tokenizer_2,
        unet=p.unet,
        scheduler=scheduler,
        image_encoder=None,
        feature_extractor=None,
        add_watermarker=False,
        force_zeros_for_empty_prompt=True,
    )
    ordinary.set_progress_bar_config(disable=True)
    unet_finite = importlib.import_module("imagegen_worker.inference_lora").finite_unet_outputs
    vae_finite = importlib.import_module("imagegen_worker.inference_vae").finite_vae_outputs
    with unet_finite(ordinary, torch), vae_finite(ordinary, torch):
        result = ordinary(
            prompt_embeds=positive,
            negative_prompt_embeds=negative,
            pooled_prompt_embeds=positive_pool,
            negative_pooled_prompt_embeds=negative_pool,
            width=104,
            height=72,
            original_size=(1024, 1024),
            target_size=(1024, 1024),
            negative_original_size=(1024, 1024),
            negative_target_size=(1024, 1024),
            crops_coords_top_left=(0, 0),
            negative_crops_coords_top_left=(0, 0),
            num_inference_steps=2,
            num_images_per_prompt=1,
            guidance_scale=5.0,
            guidance_rescale=0.0,
            generator=torch.Generator(device="cpu").manual_seed(case.command.seed),
            output_type="pt",
        )
    error = (regional.images.float() - result.images.float()).abs()
    # The single unrestricted bank preserves the native no-mask path. The
    # qualified same-device control must now retain exact original execution,
    # including RGB; no tolerance can hide the reproduced R1 amplification.
    tolerance = 0.0
    array = result.images.detach().cpu().float()[0].permute(1, 2, 0).numpy()
    rgb = (array * 255).round().astype("uint8").tobytes()
    regional_array = regional.images.detach().cpu().float()[0].permute(1, 2, 0).numpy()
    regional_rgb = (regional_array * 255).round().astype("uint8").tobytes()
    byte_errors = [abs(a - b) for a, b in zip(rgb, regional_rgb, strict=True)]
    report["ordinary"] = {
        "nativeSha256": _tensor_hash(native, result.images),
        "maxAbsError": float(error.max()),
        "meanAbsError": float(error.mean()),
        "atol": tolerance,
        "rtol": 0.0,
        "publishedRgbSha256": _sha(rgb),
        "sameRgb": _sha(rgb) == report["rgb"],
        "differentRgbChannels": sum(error > 0 for error in byte_errors),
        "maxRgbChannelError": max(byte_errors),
        "originalProcessors": True,
        "adapter": False,
    }
    assert torch.equal(regional.images, result.images)
    assert regional_rgb == rgb
    assert max(byte_errors) <= 2, "ordinary equivalence exceeded 8 FP16 eps at quantization"


def _expected(native: Any, name: str) -> Any:
    template = os.environ.get(PREFIX + "EXPECTED")
    pinned = os.environ.get(PREFIX + "EXPECTED_SHA256")
    assert template and pinned, "verify requires an immutable pinned GREEN baseline"
    path = Path(template.format(case=name))
    raw = path.read_bytes()
    digest = json.loads(pinned)[name] if pinned.startswith("{") else pinned
    assert _sha(raw) == digest
    record = json.loads(raw)
    if "cases" in record:
        record = record["cases"][name]
    assert record["status"] == "passed" and record["case"] == name
    assert record["recipeFileSha256"] == native.main.sha256
    assert record["checkpointSha256"] == SOURCE_SHA
    mutation = os.environ.get(PREFIX + "MUTATION")
    allowed: dict[str | None, set[str]] = {
        None: set(),
        "regional-alias": {"worker-python/src/imagegen_worker/illustrious_regional_embeddings.py"},
        "second-step-permission": {
            "worker-python/src/imagegen_worker/illustrious_regional_attention_adapter.py"
        },
    }
    assert mutation in allowed
    prior = record["sourceSha256"]
    assert prior.keys() == native.source_sha256.keys()
    for path, current in native.source_sha256.items():
        if path not in allowed[mutation]:
            assert prior[path] == current, f"baseline source differs: {path}"
    assert record["loadingJournalSourceSha256"] == native.journal_sha256
    assert record["mainProducerSourceSha256"] == native.main_producer_sha256
    return record


def _compare(native: Any, name: str, report: Any) -> None:
    if native.mode == "record":
        assert os.environ.get(PREFIX + "MUTATION") is None, "mutated source cannot record GREEN"
        return
    baseline = _expected(native, name)
    # Persist comparison evidence before throwing, including the first-step
    # control under a later-step mutation. Input/seed/state alone are not enough.
    report["baselineComparison"] = {
        "firstStepSame": report["roots"][0] == baseline["roots"][0],
        "predictionsSame": report["predictions"] == baseline["predictions"],
        "rgbSame": report["rgb"] == baseline["rgb"],
    }
    if os.environ.get(PREFIX + "MUTATION") == "second-step-permission":
        assert report["baselineComparison"]["firstStepSame"], (
            "mutation leaked into first native step"
        )
    assert report["predictions"] == baseline["predictions"], (
        "native noise prediction changed from pinned GREEN"
    )
    assert report["rgb"] == baseline["rgb"], "published RGB changed from pinned GREEN"
    assert report["sites"] == baseline["sites"], "original attention/SDPA observations changed"


def _contrasts(records: Any) -> None:
    if "base-cfg2" not in records:
        return
    base = records["base-cfg2"]
    for name in ("resource-cfg2", "coverage-cfg2", "repeat-cfg2", "changed-seed-cfg2"):
        if name not in records:
            continue
        other = records[name]
        if name == "repeat-cfg2":
            assert base["predictions"] == other["predictions"] and base["rgb"] == other["rgb"]
            assert base["sites"] == other["sites"]
            continue
        assert base["predictions"] != other["predictions"] and base["rgb"] != other["rgb"]
        if name == "resource-cfg2":
            left, right = base["expected"], other["expected"]
            assert left["masks"] == right["masks"] and left["pools"] == right["pools"]
            for index, (a, b) in enumerate(zip(left["streams"], right["streams"], strict=True)):
                for key in a:
                    if index == 1 and key == "positive":
                        assert a[key] != b[key]
                    elif index == 1 and key == "positive_pooled":
                        pass  # This unselected regional pool never reaches the UNet.
                    else:
                        assert a[key] == b[key]
            assert any(
                a["output"] != b["output"]
                for a, b in zip(base["sites"], other["sites"], strict=True)
            )
        elif name == "coverage-cfg2":
            assert base["expected"]["context"] == other["expected"]["context"]
            assert base["expected"]["pools"] == other["expected"]["pools"]
            assert base["expected"]["streams"] == other["expected"]["streams"]
            assert base["expected"]["masks"] != other["expected"]["masks"]
        elif name == "changed-seed-cfg2":
            assert base["expected"] == other["expected"]
            assert base["roots"][0]["sample"] != other["roots"][0]["sample"]


def _raw(native: Any, seen: Any, sites: Any, report: Any) -> None:
    report["roots"], report["sites"] = sites.roots, sites.sites
    report["predictions"] = [
        _tensor_hash(native, transition["model_output"]) for transition in seen.steps
    ]
    report["nativeCounts"] = {
        "encoderForwards": len(seen.encoder_calls),
        "encodedPairs": len(seen.pairs),
        "nativeTiLoads": len(seen.loads),
        "unet": len(seen.unet_results),
        "euler": len(seen.steps),
        "vae": len(seen.decode_results),
        "crossProcessors": len(sites.sites),
        "nativeSdpa": sum(row["sdpaCalls"] for row in sites.sites),
    }
    report["aliasRows"] = [
        {"ids": load.ids, "aliases": load.aliases, "sha256": _tensor_hash(native, load.rows)}
        for load in seen.loads
    ]
    report["actualClipAliases"] = [
        {
            "ids": call.ids.tolist(),
            "aliasIds": call.alias_ids,
            "rowsSha256": _tensor_hash(native, call.rows),
        }
        for call in seen.encoder_calls
    ]


def _run_case(native: Any, name: str, monkeypatch: Any, *, selector: str | None = None) -> Any:
    started = time.monotonic()
    variant, layout, steps = CASES[name]
    case = _case(native, native.main.variants[variant], selector or name, layout, steps)
    report: dict[str, Any] = {
        "status": "incomplete",
        "case": name,
        "selector": selector or name,
        "variant": variant,
        "layout": layout,
        "steps": steps,
        "seed": case.command.seed,
        "baseline": "dirty master@10115df581d9e07049478dee3866a280886794fd",
        "checkpointSha256": SOURCE_SHA,
        "checkpoint": str(SOURCE),
        "mainCheckpointResolution": native.main.resolved,
        "recipeFileSha256": native.main.sha256,
        "sourceSha256": native.source_sha256,
        "loadingJournalSourceSha256": native.journal_sha256,
        "mainProducerSourceSha256": native.main_producer_sha256,
        "noisePolicy": {
            "mainResolved": native.main.resolved["noiseProfile"],
            "privateExecution": "linspace, scaled-linear, epsilon",
            "callerNoiseProfile": None,
            "productionDefaultNoiseQualified": False,
        },
        "mode": native.mode,
        "mutation": os.environ.get(PREFIX + "MUTATION"),
        "limits": [
            "private trained Illustrious mechanics",
            "no quality or public readiness",
            "Main durability is producer evidence",
        ],
    }
    seen = sites = None
    recipe_before = copy.deepcopy(case.recipe)
    command_before = copy.deepcopy(case.command)
    target_before = case.target.read_bytes()
    native.torch.cuda.reset_peak_memory_stats(0)
    try:
        with _preserved(native):
            with (
                native.shared._observe(native, monkeypatch) as seen,
                _all_sites(native, monkeypatch) as sites,
                _original_pt(native, monkeypatch) as pt,
            ):
                receipt = native.output.generate_current_canvas_regional_txt2img(
                    case.recipe, command=case.command, **case.args
                )
            # No row/context/mask assertion may run before real completion.
            _raw(native, seen, sites, report)
            original = seen.pipeline_results[0]
            assert original is pt.result
            report["nativeImage"] = _tensor_hash(native, original.images)
            report["completion"] = receipt
            report["rgb"] = _sha(_png(native, case, original, pt.image, receipt))
            report["png"] = _sha(case.command.output_path.read_bytes())
            # Baseline comparisons are recorded before independent assertions
            # can deliberately fail on a ROOT-installed semantic mutation.
            _compare(native, name, report)
            _assert_native(native, case, seen, sites, report)
            if variant == "zero":
                _ordinary(native, case, original, report)
        assert case.recipe == recipe_before and case.target.read_bytes() == target_before
        assert case.command == command_before
        assert _source_map() == native.source_sha256
        assert time.monotonic() - started < 600
        report["status"] = "passed"
        report["sourceStateStorageMetadataRngReservationsPreserved"] = True
        native.records[name] = report
        _contrasts(native.records)
        return report
    except BaseException as error:
        report["status"] = "failed"
        report["failure"] = {"type": type(error).__name__, "message": str(error)[:1200]}
        raise
    finally:
        if seen is not None and sites is not None:
            _raw(native, seen, sites, report)
        native.torch.cuda.synchronize(0)
        report["elapsedSeconds"] = time.monotonic() - started
        report["processPeakRssBytes"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024
        report["cudaPeakAllocatedBytes"] = native.torch.cuda.max_memory_allocated(0)
        report["cudaPeakReservedBytes"] = native.torch.cuda.max_memory_reserved(0)
        report["externalEnvelopeOwner"] = (
            "ROOT aggregate cgroup/watchdog; supplemental RSS cannot enforce it"
        )
        with (RUN / f"{native.label}-{selector or name}.json").open("x") as stream:
            json.dump(report, stream, indent=2)
            stream.write("\n")
        # Drop private TI execution graphs even if pytest retains this frame for
        # a RED traceback. Reports contain only bounded scalar/hash records.
        if seen is not None:
            cast(dict[str, Any], vars(seen)).clear()
        if sites is not None:
            cast(dict[str, Any], vars(sites)).clear()
        del seen, sites, case
        gc.collect()


@pytest.mark.parametrize("name", tuple(CASES))
def test_trained_main_matrix(trained: Any, monkeypatch: Any, name: str) -> None:
    _run_case(trained, name, monkeypatch)


def test_trained_recorded_causal_controls(trained: Any) -> None:
    """No extra native request; require all seven independently pinned GREEN cases."""
    records = (
        {name: _expected(trained, name) for name in CASES}
        if trained.mode == "verify"
        else trained.records
    )
    assert set(CASES).issubset(records), "all seven actual matrix records are required"
    _contrasts(records)
    with (RUN / f"{trained.label}-causal-controls.json").open("x") as stream:
        json.dump(
            {
                "status": "passed",
                "matrixCases": 7,
                "newNativeRequests": 0,
                "checkpointSha256": SOURCE_SHA,
                "recipeFileSha256": trained.main.sha256,
            },
            stream,
        )
        stream.write("\n")


def test_trained_regional_alias_base_red(trained: Any, monkeypatch: Any) -> None:
    _run_case(trained, "base-cfg2", monkeypatch, selector="regional-alias-base")


def test_trained_regional_alias_resource_neighbor_green(trained: Any, monkeypatch: Any) -> None:
    _run_case(trained, "resource-cfg2", monkeypatch, selector="regional-alias-resource-control")


def test_trained_second_step_permission_base_red(trained: Any, monkeypatch: Any) -> None:
    _run_case(trained, "base-cfg2", monkeypatch, selector="second-step-base")


def test_trained_second_step_permission_zero_green(trained: Any, monkeypatch: Any) -> None:
    _run_case(trained, "zero-cfg2", monkeypatch, selector="second-step-zero-control")


@pytest.mark.parametrize("failure", ("second-unet", "decode", "publication"))
def test_trained_recoverable_failure(trained: Any, monkeypatch: Any, failure: str) -> None:
    native = trained
    case = _case(native, native.main.variants["base"], f"fault-{failure}", CFG, 2)
    report: dict[str, Any] = {
        "status": "incomplete",
        "failureCase": failure,
        "failedRequestSuccessReceipts": 0,
        "recoverySuccessReceipts": 0,
    }
    calls: list[str] = []
    sentinel = OSError(f"trained recoverable injected {failure}")
    if failure == "second-unet":
        owner, method, threshold = cast(Any, type(native.pipeline.unet)), "forward", 2
    elif failure == "decode":
        owner, method, threshold = cast(Any, type(native.pipeline.vae)), "decode", 1
    else:
        owner = importlib.import_module("imagegen_worker.generation_artifacts").os
        method, threshold = "link", 1
    original = getattr(owner, method)
    recipe_before = copy.deepcopy(case.recipe)
    command_before = copy.deepcopy(case.command)
    target_before = case.target.read_bytes()
    seen = sites = None

    @wraps(original)
    def fail(*args: Any, **kwargs: Any) -> Any:
        if failure == "publication":
            if Path(args[1]) == case.command.output_path:
                calls.append("real-publisher-link")
                raise sentinel
            return original(*args, **kwargs)
        result = original(*args, **kwargs)
        calls.append("original-native-result")
        if len(calls) == threshold:
            raise sentinel
        return result

    started = time.monotonic()
    try:
        with _preserved(native):
            with (
                native.shared._observe(native, monkeypatch) as seen,
                _all_sites(native, monkeypatch) as sites,
                monkeypatch.context() as patch,
            ):
                # Capture the already installed transparent spy chain, keeping
                # both original native computation and complete observations.
                original = getattr(owner, method)
                patch.setattr(owner, method, fail)
                with pytest.raises(Exception) as caught:
                    native.output.generate_current_canvas_regional_txt2img(
                        case.recipe, command=case.command, **case.args
                    )
                report["exception"] = {
                    "type": type(caught.value).__name__,
                    "message": str(caught.value),
                }
            _raw(native, seen, sites, report)
            error = caught.value
            chain: list[int] = []
            while error is not None and id(error) not in chain:
                chain.append(id(error))
                if error is sentinel:
                    break
                error = error.__cause__
            assert error is sentinel
            assert len(calls) == threshold
            assert not case.command.output_path.exists()
            assert not list(case.root.glob(".*.tmp"))
            assert case.recipe == recipe_before and case.command == command_before
            assert case.target.read_bytes() == target_before
        report["failedRequestRestored"] = True
        cast(dict[str, Any], vars(seen)).clear()
        cast(dict[str, Any], vars(sites)).clear()
        seen = sites = None
        gc.collect()
        # A fresh real successful request, with every native boundary observed.
        recovery = _run_case(native, "base-cfg2", monkeypatch, selector=f"recovery-{failure}")
        assert recovery["status"] == "passed"
        report["freshRecovery"] = recovery["rgb"]
        report["recoverySuccessReceipts"] = 1
        assert time.monotonic() - started < 600
        report["status"] = "passed"
    except BaseException as error:
        report["status"] = "failed"
        report["error"] = {"type": type(error).__name__, "message": str(error)[:1200]}
        raise
    finally:
        if seen is not None and sites is not None:
            _raw(native, seen, sites, report)
        report["calls"] = calls
        report["elapsedSeconds"] = time.monotonic() - started
        with (RUN / f"{native.label}-fault-{failure}.json").open("x") as stream:
            json.dump(report, stream, indent=2)
            stream.write("\n")
        if seen is not None:
            cast(dict[str, Any], vars(seen)).clear()
        if sites is not None:
            cast(dict[str, Any], vars(sites)).clear()
        gc.collect()
