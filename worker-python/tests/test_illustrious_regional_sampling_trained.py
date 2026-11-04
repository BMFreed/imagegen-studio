"""ROOT-executed trained V2 sampling, using complete, actual Main recipes.

Author validation is AST/Ruff only: no imports, collection, native execution,
provisioning, process inspection, mutations or cleanup. ROOT owns each serial
12 GiB host / zero swap / 600 s / CUDA allocator .75 execution envelope.

Opt in with IGS_REGIONAL_SAMPLING_RUN=<RUN>, MODE=record|verify and fresh LABEL.
MAIN defaults to RUN/main-broad-r4/main-trained-recipes.json; relative retained
targets resolve against MAIN.parent. Geometry comes from that producer. The
historical palette-r3 fixture has inadequate pooled coverage sensitivity and
is deliberately excluded. No prepared recipe is edited, including zero.

record creates exclusive LABEL-selector.json witnesses, never expected files.
verify requires EXPECTED (optional {case}) and EXPECTED_SHA256 (digest or JSON
case:digest map). MUTATION=policy permits only the denoising owner to differ;
MUTATION=permission permits only the attention-adapter owner. ROOT installs
and restores mutations. All literal policy/association/permission assertions
follow genuine PNG publication; finally retains compact raw observations on RED.

Seven matrix requests: base20/base30/resource20/coverage20/zero20/repeat20/
changedseed20. legacyzero2 is the named V1/None-policy control. Three additional
recoverable faults each require a fresh successful base20 request. The causal
aggregate reads pinned records without loading models or requesting more ML.

One production loader per module, one verified original checkpoint, existing
loading journal, real CLIP/Compel and original native processors/SDPA/Euler/VAE.
No replacement denoising loop, complete model/table preservation clone, or
all-site/all-step masks/projections are retained. Only compact observations and
the small exact TI suffix/conditioning are kept. Full-geometry matrix capacity
and visual quality remain unqualified until ROOT executes; even a passing
mechanical matrix establishes no quality/public admission/Save/readiness claim.
"""

from __future__ import annotations

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

import test_illustrious_regional_trained as _trained_helpers
from test_illustrious_regional_trained import (
    _plain_oracle,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
    _tensor_hash,  # pyright: ignore[reportPrivateUsage]
)

prior: Any = cast(Any, _trained_helpers)

RUN = (
    Path.home()
    / ".codex/artifacts/imagegen-studio/runs/regional-guidance-sampling/20261027-leading"
)
PREFIX = "IGS_REGIONAL_SAMPLING_"
JOURNAL = prior.RUN / "trained_loading_journal.py"
JOURNAL_SHA = "b998141902d577d1cf1d81bc70cc71b7d73f3c26742d2ef1f16a82d00bfbff31"
CASES = {
    "base20": ("base", 20),
    "base30": ("base", 30),
    "resource20": ("resource-neighbor", 20),
    "coverage20": ("coverage-neighbor", 20),
    "zero20": ("zero", 20),
    "repeat20": ("base", 20),
    "changedseed20": ("changed-seed", 20),
}
POLICY = {
    "schemaVersion": 1,
    "baseSchedule": "sdxl-scaled-linear-v1",
    "rescaleBetasZeroSnr": False,
    "timestepSpacing": "leading",
}
MUTABLE = {
    "policy": "worker-python/src/imagegen_worker/illustrious_regional_denoising.py",
    "permission": "worker-python/src/imagegen_worker/illustrious_regional_attention_adapter.py",
}


def _sha(binary: bytes) -> str:
    return hashlib.sha256(binary).hexdigest()


def _equal(actual: Any, expected: Any, message: str) -> None:
    """Exact bounded diagnostics: never let pytest format whole alpha/RGB/records."""
    if actual != expected:
        raise AssertionError(message)


def _alpha(bbox: Any) -> bytes:
    """Independent whole-source broad halves, including hostile off-grid pixels."""
    width, height = bbox["width"], bbox["height"]
    split = width // 16 - 1

    def pixel(x: int, y: int) -> int:
        lx = x // 8
        anchor = 255 if lx < split else 128 if lx == split else 127 if lx == split + 1 else 0
        if x % 8 == y % 8 == 0:
            return anchor
        if x % 8 == y % 8 == 4:
            return 255 - anchor
        return int(x in (0, width - 1) or y in (0, height - 1))

    return bytes(pixel(x, y) for y in range(height) for x in range(width))


@pytest.fixture(scope="module")
def settings() -> Any:
    requested = os.environ.get(PREFIX + "RUN")
    if requested is None:
        pytest.skip("ROOT opt-in: IGS_REGIONAL_SAMPLING_RUN=<exact RUN>")
    assert Path(requested) == RUN
    mode, label = os.environ.get(PREFIX + "MODE"), os.environ.get(PREFIX + "LABEL", "")
    assert mode in ("record", "verify")
    assert re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", label)
    mutation = os.environ.get(PREFIX + "MUTATION")
    assert mutation is None or mutation in MUTABLE
    assert mode == "verify" or mutation is None, "mutations cannot record a GREEN baseline"
    path = Path(
        os.environ.get(PREFIX + "MAIN", str(RUN / "main-broad-r4/main-trained-recipes.json"))
    )
    raw = path.read_bytes()
    data: dict[str, Any] = prior._transport(json.loads(raw))
    variants: Any = data["variants"]
    if type(variants) is list:
        variants = {cast(str, row["name"]): row for row in cast(list[dict[str, Any]], variants)}
    assert set(variants) == {
        "base",
        "resource-neighbor",
        "coverage-neighbor",
        "zero",
        "changed-seed",
    }
    bbox: dict[str, int] = data["bbox"]
    assert bbox["x"] == -13 and bbox["y"] == 5
    assert bbox["width"] == bbox["height"] == 1024, "primary broad-r4 producer required"
    latent = (bbox["height"] // 8, bbox["width"] // 8)
    assert data["latent"] == {"height": latent[0], "width": latent[1]}
    checkpoint, full = data["checkpoint"], _alpha(bbox)
    reference, resolved = checkpoint["reference"], checkpoint["resolved"]
    assert checkpoint["sha256"] == reference["fileSha256"] == prior.SOURCE_SHA
    assert checkpoint["byteSize"] == prior.SOURCE_BYTES
    assert checkpoint["sourcePath"] == resolved["managedPath"] == str(prior.SOURCE)
    assert reference["predictionType"] == "epsilon"
    assert set(resolved) == {"reference", "managedPath", "noiseProfile"}
    assert resolved["reference"] == reference and resolved["noiseProfile"] == POLICY
    complement = bytes(0 if byte >= 128 else 255 for byte in full)
    sampled = [
        full[8 * y * bbox["width"] + 8 * x] for y in range(latent[0]) for x in range(latent[1])
    ]
    _equal(data["expectedFirstLatent"], sampled, "Main nearest8 witness differs from broad alpha")
    _equal(
        data["expectedNegativeLatent"],
        [0 if byte >= 128 else 255 for byte in sampled],
        "Main negative nearest8 witness differs from threshold complement",
    )
    for name, row in cast(dict[str, Any], variants).items():
        recipe, target = row["recipe"], row["targetMode"]
        assert row["checkpointResolution"] == resolved and row["durableUnchanged"] is True
        assert re.fullmatch(r"[0-9a-f]{64}", row["durableStateSha256"])
        assert recipe["family"] == "illustrious" and recipe["bbox"] == target["bbox"] == bbox
        assert target["mode"] == "txt2img"
        assert all(recipe[key] == target[key] for key in ("documentId", "documentRevision"))
        assert recipe["item"]["seed"] == (124 if name == "changed-seed" else 123)
        regions, gp = recipe["regions"], recipe["globalPrompts"]
        assert len(regions) == (0 if name == "zero" else 3)
        if not regions:
            assert recipe["globalEmbeddings"] == {"positive": [], "negative": []}
            assert all(not prompt["embeddingRefs"] for prompt in gp.values())
            continue
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
        assert regions[2]["positive"] is None and regions[2]["negative"]["source"] == "regional"
        assert regions[2]["negative"]["prompt"]["text"] == "haze <shared>"
        assert [region["coverage"]["kind"] for region in regions] == [
            "covered",
            "outside",
            "covered",
        ]
        assert all(region["coverage"]["bounds"] == bbox for region in regions)
        _equal(
            regions[0]["coverage"]["alpha"],
            complement if name == "coverage-neighbor" else full,
            "Main first-region whole alpha differs from independent broad source",
        )
        _equal(
            regions[1]["coverage"]["alpha"],
            bytes(bbox["width"] * bbox["height"]),
            "Main second region must have literal zero coverage",
        )
        _equal(
            regions[2]["coverage"]["alpha"],
            complement,
            "Main third-region whole complement differs",
        )
        for prompt, bindings, resource_name in (
            (gp["positive"], recipe["globalEmbeddings"]["positive"], "A"),
            (gp["negative"], recipe["globalEmbeddings"]["negative"], "B"),
            (
                regions[0]["positive"],
                regions[0]["embeddings"]["positive"],
                "A" if name == "resource-neighbor" else "C",
            ),
            (regions[0]["negative"]["prompt"], regions[0]["embeddings"]["negative"], "B"),
            (regions[2]["negative"]["prompt"], regions[2]["embeddings"]["negative"], "D"),
        ):
            record = data["exactResources"][resource_name]
            assert prompt["embeddingRefs"] == [
                {"token": "<shared>", "resource": record["reference"]}
            ]
            assert bindings == [
                {
                    "token": "<shared>",
                    "reference": record["reference"],
                    "managedPath": record["managedPath"],
                    "byteSize": record["byteSize"],
                }
            ]
    return SimpleNamespace(
        path=path,
        raw=raw,
        data=data,
        variants=variants,
        bbox=bbox,
        latent=latent,
        sha256=_sha(raw),
        resolved=resolved,
        reference=reference,
        label=label,
        mode=mode,
        mutation=mutation,
        sources=prior._source_map(),
        records={},
    )


@pytest.fixture(scope="module")
def sampling(settings: Any) -> Iterator[Any]:
    """Exactly one original production load; journal verification precedes private work."""
    inference = importlib.import_module("imagegen_worker.inference")
    shared = importlib.import_module("test_illustrious_regional_shared_text")
    runtime = inference.qualify_ml_runtime()
    torch = runtime.torch
    assert torch.cuda.is_available(), "opted-in native CUDA lane must not skip"
    torch.set_num_threads(1)
    torch.cuda.set_per_process_memory_fraction(0.75, 0)
    assert _sha(JOURNAL.read_bytes()) == JOURNAL_SHA
    spec = importlib.util.spec_from_file_location("_sampling_trained_loading_journal", JOURNAL)
    assert spec is not None and spec.loader is not None and spec.name not in sys.modules
    journal_module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = journal_module
    try:
        spec.loader.exec_module(journal_module)
        parameters = shared.e._parameters(
            "a quiet river valley, trees, soft daylight",
            "blur, low quality",
            checkpoint_path=prior.SOURCE,
            checkpoint_sha256=prior.SOURCE_SHA,
            prediction_type="epsilon",
            seed=123,
            steps=20,
            cfg_scale=5.0,
            scheduler="euler",
            vae_precision="FP16",
            noise_profile=_noise(settings),
        )
        with torch.no_grad():
            with journal_module.loading_journal(
                torch, prior.SOURCE, RUN / f"{settings.label}-loading.json"
            ) as journal:
                pipeline, inputs = inference.load_illustrious_pipeline(
                    parameters,
                    config_dir=prior.OLD / "retained-config",
                    runtime=runtime,
                    mode="txt2img",
                )
                for component in (
                    pipeline.text_encoder,
                    pipeline.text_encoder_2,
                    pipeline.unet,
                    pipeline.vae,
                ):
                    component.eval()
                journal.verify(pipeline)
            components = (
                pipeline.text_encoder,
                pipeline.text_encoder_2,
                pipeline.unet,
                pipeline.vae,
            )
            assert [sum(p.numel() for p in model.parameters()) for model in components] == [
                123060480,
                694659840,
                2567463684,
                83653863,
            ]
            assert all(
                model.device == torch.device("cuda:0") and model.dtype == torch.float16
                for model in components
            )
            assert pipeline.vae.config.force_upcast is False
            warm = inference.prepare_illustrious_conditioning(parameters, pipeline, runtime, inputs)
            assert torch.isfinite(warm.positive).all() and torch.isfinite(warm.negative).all()
            del warm
            adapter = importlib.import_module(
                "imagegen_worker.illustrious_regional_attention_adapter"
            )
            parents = {
                name: model
                for name, model in pipeline.unet.named_modules()
                if type(model) is runtime.diffusers.Transformer2DModel
            }
            assert set(parents) == set(prior.TOPOLOGY)
            sites: dict[int, Any]
            bindings: list[Any]
            sites, bindings = {}, []
            for name, (factor, depth) in prior.TOPOLOGY.items():
                parent = parents[name]
                assert len(parent.transformer_blocks) == depth
                bindings.append(adapter.TransformerBinding(parent, factor))
                for index, block in enumerate(parent.transformer_blocks):
                    attention = block.attn2
                    assert attention.heads == (10 if factor == 2 else 20)
                    assert attention.to_q.out_features // attention.heads == 64
                    assert attention.upcast_attention is None
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
            states: dict[str, Any] = {}
            for name in ("A", "B", "C", "D"):
                record = settings.data["exactResources"][name]
                binary = Path(record["managedPath"]).read_bytes()
                assert len(binary) == record["byteSize"]
                assert _sha(binary) == record["sha256"] == record["reference"]["fileSha256"]
                state = importlib.import_module("safetensors.torch").load(binary)
                assert set(state) == {"clip_l", "clip_g"}
                assert all(
                    tuple(state[key].shape) == (2, width) and torch.isfinite(state[key]).all()
                    for key, width in (("clip_l", 768), ("clip_g", 1280))
                )
                states[name] = state
            settings.states = states
            a, c = (settings.data["exactResources"][name]["reference"] for name in ("A", "C"))
            assert a["localModelId"] == c["localModelId"]
            assert a["localVersionId"] != c["localVersionId"]
            assert all(not torch.equal(states["A"][key], states["C"][key]) for key in states["A"])
            native = SimpleNamespace(
                torch=torch,
                runtime=runtime,
                diffusers=runtime.diffusers,
                pipeline=pipeline,
                transformers=importlib.import_module("transformers"),
                inference=inference,
                shared=shared,
                device="cuda",
                dtype=torch.float16,
                main=settings,
                recipe=importlib.import_module("imagegen_worker.illustrious_regional_recipe"),
                denoising=importlib.import_module("imagegen_worker.illustrious_regional_denoising"),
                output=importlib.import_module("imagegen_worker.illustrious_regional_output"),
                adapter=adapter,
                processor_type=processor_type,
                sites=sites,
                bindings=tuple(bindings),
            )
            yield native
    finally:
        sys.modules.pop(spec.name, None)
        assert prior._source_map() == settings.sources
        _equal(settings.path.read_bytes(), settings.raw, "Main JSON changed during ROOT module")


def _noise(settings: Any) -> Any:
    """Transfer every actual ModelService field; never select an invented policy."""
    policy = settings.resolved["noiseProfile"]
    protocol = importlib.import_module("imagegen_worker.protocol")
    return protocol.IllustriousNoiseProfile(
        schema_version=policy["schemaVersion"],
        base_schedule=policy["baseSchedule"],
        rescale_betas_zero_snr=policy["rescaleBetasZeroSnr"],
        timestep_spacing=policy["timestepSpacing"],
    )


def _case(native: Any, name: str, selector: str) -> Any:
    settings = native.main
    variant, steps = ("zero", 2) if name == "legacyzero2" else CASES[name]
    row = settings.variants[variant]
    recipe, target, bbox = row["recipe"], row["targetMode"], settings.bbox
    root = RUN / "payloads" / settings.label / selector
    root.mkdir(mode=0o700, parents=True, exist_ok=False)
    source = Path(target.get("retainedPng") or target["targetPath"])
    if not source.is_absolute():
        source = settings.path.parent / source
    binary = source.read_bytes()
    assert len(binary) == target["byteSize"] and _sha(binary) == target["sha256"]
    image_type = importlib.import_module("PIL.Image")
    derivatives = importlib.import_module("imagegen_worker.derivatives")
    with image_type.open(source) as image:
        image.load()
        assert image.format == "PNG" and image.mode == "RGBA"
        assert image.size == (bbox["width"], bbox["height"])
        assert image.getchannel("A").getextrema() == (0, 0)
        assert image.info["icc_profile"] == derivatives.SRGB_ICC_PROFILE
    local_target = root / "target.png"
    local_target.write_bytes(binary)
    item = recipe["item"]
    parameters = native.shared.e._parameters(
        item["prompts"]["positive"],
        item["prompts"]["negative"],
        checkpoint_path=prior.SOURCE,
        checkpoint_sha256=prior.SOURCE_SHA,
        prediction_type="epsilon",
        seed=item["seed"],
        steps=steps,
        cfg_scale=5.0,
        scheduler="euler",
        vae_precision="FP16",
        noise_profile=None if name == "legacyzero2" else _noise(settings),
    )
    protocol = importlib.import_module("imagegen_worker.protocol")
    command = protocol.GenerateIllustriousTxt2ImgCommand(
        **{
            field.name: getattr(parameters, field.name)
            for field in dataclasses.fields(protocol.IllustriousInferenceParameters)
        },
        request_id=f"sampling-{settings.label}-{selector}",
        target_path=local_target,
        target_sha256=_sha(binary),
        target_byte_size=len(binary),
        target_icc_sha256=derivatives.PINNED_SRGB_ICC_SHA256,
        width=bbox["width"],
        height=bbox["height"],
        bbox=copy.deepcopy(bbox),
        staging_root=root,
        output_path=root / "candidate.png",
    )
    everywhere = importlib.import_module(
        "imagegen_worker.illustrious_regional_attention"
    ).Everywhere
    return SimpleNamespace(
        recipe=recipe,
        command=command,
        root=root,
        target=local_target,
        steps=steps,
        variant=variant,
        legacy=name == "legacyzero2",
        parameters=parameters,
        args={
            "pipeline": native.pipeline,
            "runtime": native.runtime,
            "profile": native.shared.CUDA_ENCODING,
            "denoising_profile": (
                "ordinary-canvas-euler-txt2img-cuda-fp16-v1"
                if name == "legacyzero2"
                else "ordinary-canvas-euler-txt2img-cuda-fp16-v2"
            ),
            "global_negative_coverage": everywhere(),
            "global_positive_coverage": everywhere(),
            "negative_pooled_source_id": "current-canvas",
            "positive_pooled_source_id": "current-canvas",
            "bindings": native.bindings,
            "layout": prior.CFG,
        },
    )


def _permissions(native: Any, case: Any, factor: int) -> Any:
    """Whole Main alpha -> nearest8 -> threshold128 -> independent ceil/max."""
    torch = native.torch
    height, width = cast(tuple[int, int], native.main.latent)
    keys = 308 if case.recipe["regions"] else 77
    allowed = torch.zeros(2, (height // factor) * (width // factor), keys, dtype=torch.bool)
    allowed[:, :, :77] = True
    for index, region in enumerate(case.recipe["regions"]):
        alpha: bytes = region["coverage"]["alpha"]
        h, w = height, width
        level: tuple[bool, ...] = tuple(
            alpha[cast(int, 8 * y * case.command.width + 8 * x)] >= 128
            for y in range(h)
            for x in range(w)
        )
        for _ in range({2: 1, 4: 2}[factor]):
            nh, nw = (h + 1) // 2, (w + 1) // 2
            level = tuple(
                any(
                    level[yy * w + xx]
                    for yy in range(2 * y, min(2 * y + 2, h))
                    for xx in range(2 * x, min(2 * x + 2, w))
                )
                for y in range(nh)
                for x in range(nw)
            )
            h, w = nh, nw
        support = torch.tensor(level, dtype=torch.bool)
        start = (index + 1) * 77
        allowed[0, :, start : start + 77] = support[:, None]
        if region["positive"] is not None:
            allowed[1, :, start : start + 77] = support[:, None]
    return allowed.to(device="cuda:0")


def _mask_observation(native: Any, value: Any, expected: Any, heads: int) -> Any:
    """Compare every head on GPU in bounded query chunks; hash only one head."""
    torch = native.torch
    batch, queries, keys = expected.shape
    if value is None:
        return {
            "none": True,
            "matches": bool(expected.all()),
            "firstHead": _tensor_hash(native, torch.ones_like(expected)),
            "headsIdentical": True,
        }
    if value.ndim == 3:
        value = value.reshape(batch, heads, value.shape[-2], keys)
    value = value.expand(batch, heads, queries, keys)
    matches, identical = True, True
    for start in range(0, queries, 64):
        actual = value[:, :, start : start + 64]
        actual = actual if actual.dtype == torch.bool else actual == 0
        matches &= torch.equal(actual, expected[:, None, start : start + 64].expand_as(actual))
        identical &= torch.equal(actual, actual[:, :1].expand_as(actual))
    first = value[:, 0]
    first = first if first.dtype == torch.bool else first == 0
    return {
        "none": False,
        "matches": matches,
        "firstHead": _tensor_hash(native, first),
        "headsIdentical": identical,
    }


@contextmanager
def _text_observer(native: Any, monkeypatch: Any) -> Generator[Any]:
    """Reuse the existing alias seams; retain only suffix rows and encoded pairs."""
    shared = native.shared
    seen = SimpleNamespace(plans=[], pairs=[], loads=[], encoder_calls=[], resizes=0)
    owner = shared._owner()
    prepare = owner.prepare_regional_embeddings
    loader_type = shared.e._loader_mixin()
    loader = loader_type.load_textual_inversion
    pretrained = importlib.import_module("transformers.modeling_utils").PreTrainedModel
    resize = pretrained._get_resized_embeddings

    @wraps(prepare)
    def prepared(*args: Any, **kwargs: Any) -> Any:
        result = prepare(*args, **kwargs)
        seen.plans.append(result)
        return result

    @wraps(loader)
    def loaded(current: Any, *args: Any, **kwargs: Any) -> Any:
        result = loader(current, *args, **kwargs)
        tokenizer, encoder = kwargs["tokenizer"], kwargs["text_encoder"]
        aliases = {
            name: token for name, token in tokenizer.get_vocab().items() if token >= prior.BASE_ROWS
        }
        ids = sorted(aliases.values())
        seen.loads.append(
            SimpleNamespace(
                encoder=encoder,
                aliases=aliases,
                ids=ids,
                rows=encoder.get_input_embeddings().weight[ids].detach().clone(),
            )
        )
        return result

    @wraps(resize)
    def resized(*args: Any, **kwargs: Any) -> Any:
        result = resize(*args, **kwargs)
        seen.resizes += 1
        return result

    def encoder_observer(original: Any) -> Any:
        @wraps(original)
        def forward(current: Any, *args: Any, **kwargs: Any) -> Any:
            bound = inspect.signature(original).bind(current, *args, **kwargs).arguments
            ids = bound["input_ids"]
            used = sorted(
                token for token in set(ids.flatten().tolist()) if token >= prior.BASE_ROWS
            )
            seen.encoder_calls.append(
                SimpleNamespace(
                    encoder=current,
                    ids=ids.detach().clone(),
                    alias_ids=used,
                    rows=current.get_input_embeddings().weight[used].detach().clone(),
                )
            )
            return original(current, *args, **kwargs)

        return forward

    build = shared.build_sdxl_conditioning

    @wraps(build)
    def built(parameters: Any, pipeline: Any, runtime: Any, **kwargs: Any) -> Any:
        result = build(parameters, pipeline, runtime, **kwargs)
        seen.pairs.append(
            SimpleNamespace(
                parameters=parameters,
                pipeline=pipeline,
                inputs=kwargs["embedding_inputs"],
                result=result,
            )
        )
        return result

    with monkeypatch.context() as patch:
        patch.setattr(loader_type, "load_textual_inversion", loaded)
        patch.setattr(pretrained, "_get_resized_embeddings", resized)
        for cls in {
            cast(Any, type(native.pipeline.text_encoder)),
            cast(Any, type(native.pipeline.text_encoder_2)),
        }:
            patch.setattr(cls, "forward", encoder_observer(cls.forward))
        with shared.o._aliases(patch, prepare, prepared), shared._build_aliases(patch, built):
            yield seen


@contextmanager
def _native_observer(native: Any, case: Any, monkeypatch: Any) -> Generator[Any]:
    """Streaming transparent originals; every retained observation is compact."""
    torch, p = native.torch, native.pipeline
    scheduler_cls = native.diffusers.EulerDiscreteScheduler
    call, forward, decode = (
        cast(Any, type(p)).__call__,
        cast(Any, type(p.unet)).forward,
        cast(Any, type(p.vae)).decode,
    )
    scale, step = scheduler_cls.scale_model_input, scheduler_cls.step
    processor, sdpa = (
        native.processor_type.__call__,
        torch.nn.functional.scaled_dot_product_attention,
    )
    output_entry = native.output.run_current_canvas_regional_denoising
    masks = {factor: _permissions(native, case, factor) for factor in (2, 4)}
    seen = SimpleNamespace(
        roots=[],
        scales=[],
        steps=[],
        sites=[],
        decodes=[],
        calls=[],
        active=[],
        events=[],
        result=None,
        image_hash=None,
        prediction=None,
        previous=None,
        decode_input=None,
    )

    @wraps(call)
    def pipeline_call(current: Any, *args: Any, **kwargs: Any) -> Any:
        generator = kwargs["generator"]
        record = {
            "borrowed": current is p,
            "unetSame": current.unet is p.unet,
            "vaeSame": current.vae is p.vae,
            "schedulerBorrowed": current.scheduler is p.scheduler,
            "generatorDevice": generator.device.type,
            "seed": generator.initial_seed(),
            "options": {
                key: value
                for key, value in kwargs.items()
                if key
                not in (
                    "prompt_embeds",
                    "negative_prompt_embeds",
                    "pooled_prompt_embeds",
                    "negative_pooled_prompt_embeds",
                    "generator",
                )
            },
        }
        seen.calls.append(record)
        result = call(current, *args, **kwargs)
        seen.result = result
        scheduler = current.scheduler
        record.update(
            config=dict(scheduler.config),
            timesteps=scheduler.timesteps.tolist(),
            sigmas=scheduler.sigmas.tolist(),
            betaHash=_tensor_hash(native, scheduler.betas),
            alphaHash=_tensor_hash(native, scheduler.alphas_cumprod),
        )
        return result

    @wraps(scale)
    def scaled(current: Any, sample: Any, timestep: Any) -> Any:
        result = scale(current, sample, timestep)
        sigma = current.sigmas[current.step_index]
        seen.events.append("scale")
        seen.scales.append(
            {
                "timestep": timestep.item(),
                "input": _tensor_hash(native, sample),
                "output": _tensor_hash(native, result),
                "sigma": sigma.item(),
                "literalScale": torch.equal(result, sample / (sigma**2 + 1) ** 0.5),
            }
        )
        return result

    @wraps(forward)
    def unet(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is not p.unet:
            return forward(current, *args, **kwargs)
        bound = inspect.signature(forward).bind(current, *args, **kwargs).arguments
        sample, timestep, added = bound["sample"], bound["timestep"], bound["added_cond_kwargs"]
        record = {
            "step": len(seen.roots) + 1,
            "sample": _tensor_hash(native, sample),
            "timestep": timestep.item(),
            "sampleShape": list(sample.shape),
            "sampleDtype": str(sample.dtype),
            "sampleDevice": str(sample.device),
            "timeDtype": str(timestep.dtype),
            "timeDevice": str(timestep.device),
            "timeShape": list(timestep.shape),
            "context": _tensor_hash(native, bound["encoder_hidden_states"]),
            "pools": _tensor_hash(native, added["text_embeds"]),
            "timeIds": _tensor_hash(native, added["time_ids"]),
        }
        seen.roots.append(record)
        seen.events.append("unet")
        result: Any = forward(current, *args, **kwargs)
        prediction = (
            cast(tuple[Any, ...], result)[0] if isinstance(result, tuple) else result.sample
        )
        record["prediction"] = _tensor_hash(native, prediction)
        negative, positive = prediction.chunk(2)
        seen.prediction = _tensor_hash(native, negative + 5.0 * (positive - negative))
        return cast(Any, result)

    @wraps(step)
    def stepped(current: Any, *args: Any, **kwargs: Any) -> Any:
        bound = inspect.signature(step).bind(current, *args, **kwargs)
        bound.apply_defaults()
        values = bound.arguments
        sample, prediction, timestep = values["sample"], values["model_output"], values["timestep"]
        index = current.step_index
        sigma, next_sigma = current.sigmas[index : index + 2]
        # Reproduce just this Euler primitive, never a second diffusion loop.
        floating = sample.to(torch.float32)
        predicted_original = floating - sigma * prediction
        expected = (floating + (floating - predicted_original) / sigma * (next_sigma - sigma)).to(
            prediction.dtype
        )
        batch = torch.cat((sample, sample))
        record = {
            "step": len(seen.steps) + 1,
            "timestep": timestep.item(),
            "sample": _tensor_hash(native, sample),
            "batch": _tensor_hash(native, batch),
            "prediction": _tensor_hash(native, prediction),
            "cfgAssociation": _tensor_hash(native, prediction) == seen.prediction,
            "previousAssociation": seen.previous is None
            or _tensor_hash(native, sample) == seen.previous,
            "sigma": sigma.item(),
            "nextSigma": next_sigma.item(),
            "sChurn": values["s_churn"],
        }
        seen.steps.append(record)
        seen.events.append("step")
        result = step(current, *args, **kwargs)
        output = (
            cast(tuple[Any, ...], result)[0] if isinstance(result, tuple) else result.prev_sample
        )
        record.update(
            output=_tensor_hash(native, output), literalEuler=torch.equal(output, expected)
        )
        seen.previous = record["output"]
        seen.decode_input = _tensor_hash(native, output / p.vae.config.scaling_factor)
        return cast(Any, result)

    @wraps(decode)
    def decoded(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is not p.vae:
            return decode(current, *args, **kwargs)
        record = {
            "input": _tensor_hash(native, args[0]),
            "shape": list(args[0].shape),
            "reserved": id(current) in native.recipe._RESERVATIONS,
            "lastSampleAssociation": _tensor_hash(native, args[0]) == seen.decode_input,
            "regionalInstalled": all(
                site.attention.processor is not site.original for site in native.sites.values()
            ),
        }
        seen.decodes.append(record)
        seen.events.append("decode")
        result: Any = decode(current, *args, **kwargs)
        record["output"] = _tensor_hash(
            native, cast(tuple[Any, ...], result)[0] if isinstance(result, tuple) else result.sample
        )
        return cast(Any, result)

    @wraps(processor)
    def processed(current: Any, attention: Any, *args: Any, **kwargs: Any) -> Any:
        site = native.sites.get(id(attention))
        if site is None:
            return processor(current, attention, *args, **kwargs)
        bound = inspect.signature(processor).bind(current, attention, *args, **kwargs)
        bound.apply_defaults()
        hidden, context = bound.arguments["hidden_states"], bound.arguments["encoder_hidden_states"]
        record = {
            "step": len(seen.roots),
            "site": site.name,
            "factor": site.factor,
            "original": current is site.original,
            "heads": attention.heads,
            "queries": hidden.shape[1],
            "keys": context.shape[1],
            "context": _tensor_hash(native, context),
            "processorMask": _mask_observation(
                native, bound.arguments["attention_mask"], masks[site.factor], attention.heads
            ),
            "sdpaCalls": 0,
        }
        seen.sites.append(record)
        frame = SimpleNamespace(record=record, site=site, hidden=hidden, context=context)
        seen.active.append(frame)
        try:
            result = processor(current, attention, *args, **kwargs)
        finally:
            assert seen.active.pop() is frame
        record["output"] = _tensor_hash(native, result)
        return result

    @wraps(sdpa)
    def attended(*args: Any, **kwargs: Any) -> Any:
        if seen.active:
            frame = seen.active[-1]
            q, k, v = args[:3]
            mask = args[3] if len(args) > 3 else kwargs.get("attn_mask")
            record = frame.record
            record["sdpaCalls"] += 1
            record["sdpaMask"] = _mask_observation(
                native, mask, masks[frame.site.factor], frame.site.attention.heads
            )
            projection_matches: list[bool] = []
            for actual, source, layer in (
                (q, frame.hidden, frame.site.attention.to_q),
                (k, frame.context, frame.site.attention.to_k),
                (v, frame.context, frame.site.attention.to_v),
            ):
                projected = (
                    torch.nn.functional.linear(source, layer.weight, layer.bias)
                    .view(2, -1, frame.site.attention.heads, 64)
                    .transpose(1, 2)
                )
                projection_matches.append(
                    all(
                        torch.equal(
                            actual[:, :, start : start + 64], projected[:, :, start : start + 64]
                        )
                        for start in range(0, actual.shape[2], 64)
                    )
                )
                del projected
            record["qkvMatches"] = projection_matches
            record["nativePolicy"] = {
                "dtype": all(value.dtype == torch.float16 for value in (q, k, v)),
                "device": all(value.device == torch.device("cuda:0") for value in (q, k, v)),
                "dropout": args[4] if len(args) > 4 else kwargs.get("dropout_p", 0.0),
                "causal": args[5] if len(args) > 5 else kwargs.get("is_causal", False),
                "scale": kwargs.get("scale"),
            }
        return sdpa(*args, **kwargs)

    @wraps(output_entry)
    def consumed(*args: Any, **kwargs: Any) -> Any:
        result = output_entry(*args, **kwargs)
        seen.image_hash = _tensor_hash(native, result.images)
        return result

    with monkeypatch.context() as patch:
        for owner, key, replacement in (
            (cast(Any, type(p)), "__call__", pipeline_call),
            (cast(Any, type(p.unet)), "forward", unet),
            (cast(Any, type(p.vae)), "decode", decoded),
            (scheduler_cls, "scale_model_input", scaled),
            (scheduler_cls, "step", stepped),
            (native.processor_type, "__call__", processed),
            (torch.nn.functional, "scaled_dot_product_attention", attended),
            (native.output, "run_current_canvas_regional_denoising", consumed),
        ):
            patch.setattr(owner, key, replacement)
        yield seen


def _raw(native: Any, text: Any, seen: Any, report: Any) -> None:
    if seen is not None:
        for name in ("roots", "scales", "steps", "sites", "decodes", "calls", "events"):
            report[name] = getattr(seen, name)
        report["predictions"] = [row["prediction"] for row in seen.steps]
        report["nativeImage"] = seen.image_hash
    if text is not None:
        report["encodingCounts"] = {
            "prepared": len(text.plans),
            "pairs": len(text.pairs),
            "tiLoads": len(text.loads),
            "resizes": text.resizes,
            "clipForwards": len(text.encoder_calls),
        }
        report["aliasRows"] = [
            {"ids": load.ids, "aliases": load.aliases, "sha256": _tensor_hash(native, load.rows)}
            for load in text.loads
        ]
        report["actualClipAliases"] = [
            {
                "ids": row.ids.tolist(),
                "aliases": row.alias_ids,
                "rows": _tensor_hash(native, row.rows),
            }
            for row in text.encoder_calls
        ]


def _expected(settings: Any, name: str) -> Any:
    template, pinned = (
        os.environ.get(PREFIX + "EXPECTED"),
        os.environ.get(PREFIX + "EXPECTED_SHA256"),
    )
    assert template and pinned, "verify requires pinned immutable GREEN records"
    binary = Path(template.format(case=name)).read_bytes()
    digest = json.loads(pinned)[name] if pinned.startswith("{") else pinned
    assert _sha(binary) == digest
    record = json.loads(binary)
    if "cases" in record:
        record = record["cases"][name]
    assert record["status"] == "passed" and record["case"] == name
    assert record["recipeFileSha256"] == settings.sha256
    assert record["checkpointSha256"] == prior.SOURCE_SHA
    assert record["loadingJournalSourceSha256"] == JOURNAL_SHA
    assert record["sourceSha256"].keys() == settings.sources.keys()
    changed = {
        path for path, value in settings.sources.items() if record["sourceSha256"][path] != value
    }
    assert changed == ({MUTABLE[settings.mutation]} if settings.mutation else set()), (
        "only the named production mutation owner may differ; self/helpers stay pinned"
    )
    return record


def _comparison(settings: Any, name: str, report: Any) -> Any:
    if settings.mode == "record":
        return None
    expected = _expected(settings, name)
    first14 = (
        report["roots"][:14] == expected["roots"][:14]
        and report["steps"][:14] == expected["steps"][:14]
        and report["scales"][:14] == expected["scales"][:14]
        and [row for row in report["sites"] if row["step"] <= 14]
        == [row for row in expected["sites"] if row["step"] <= 14]
    )
    comparison = {
        "first14StepsIdentical": first14,
        "downstreamPredictionsDifferent": report["predictions"][14:]
        != expected["predictions"][14:],
        "predictionsSame": report["predictions"] == expected["predictions"],
        "reopenedRgbDifferent": report["rgb"] != expected["rgb"],
        "nativeImageSame": report["nativeImage"] == expected["nativeImage"],
    }
    report["baselineComparison"] = comparison
    if settings.mutation == "permission" and name == "base20":
        assert first14, "late permission mutation contaminated the first fourteen steps"
        assert (
            comparison["downstreamPredictionsDifferent"] and comparison["reopenedRgbDifferent"]
        ), "late mutation did not propagate through native prediction and reopened RGB"
    if settings.mutation == "policy" and name == "base20":
        assert not comparison["predictionsSame"] and comparison["reopenedRgbDifferent"], (
            "policy mutation must reach native prediction and reopened RGB"
        )
    return expected


def _png(native: Any, case: Any, seen: Any, receipt: Any, report: Any) -> None:
    torch = native.torch
    image_type = importlib.import_module("PIL.Image")
    derivatives = importlib.import_module("imagegen_worker.derivatives")
    tensor = seen.result.images
    assert _tensor_hash(native, tensor) == seen.image_hash, "publisher changed original native PT"
    assert tuple(tensor.shape) == (1, 3, case.command.height, case.command.width)
    assert tensor.dtype == torch.float16 and tensor.device == torch.device("cuda:0")
    assert not tensor.requires_grad and torch.isfinite(tensor).all()
    assert (tensor >= 0).all() and (tensor <= 1).all()
    array = tensor.detach().cpu().float()[0].permute(1, 2, 0).numpy()
    rgb = (array * 255).round().astype("uint8").tobytes()
    with image_type.open(case.command.output_path) as image:
        image.load()
        assert image.format == "PNG" and image.mode == "RGB"
        assert image.size == (case.command.width, case.command.height)
        assert image.info["icc_profile"] == derivatives.SRGB_ICC_PROFILE
        reopened = image.tobytes()
        _equal(reopened, rgb, "all reopened RGB channels must match original PT quantization")
    report.update(
        rgb=_sha(reopened), png=_sha(case.command.output_path.read_bytes()), completion=receipt
    )
    assert receipt["type"] == "generation-done" and receipt["protocolVersion"] == "1"
    assert receipt["requestId"] == case.command.request_id and receipt["seed"] == case.command.seed
    assert receipt["outputPath"] == str(case.command.output_path)
    assert not list(case.root.glob(".*.tmp"))


def _literal_schedule(native: Any, case: Any) -> Any:
    """Literal beta oracle and grids, independent of native policy selection."""
    torch = native.torch
    beta = torch.linspace(0.00085**0.5, 0.012**0.5, 1000, dtype=torch.float32) ** 2
    cumulative = (1 - beta).cumprod(0)
    grid = (
        [999.0, 0.0]
        if case.legacy
        else [1 + (case.steps - 1 - index) * (1000 // case.steps) for index in range(case.steps)]
    )
    training_sigma = ((1 - cumulative) / cumulative) ** 0.5
    sigmas = torch.cat((training_sigma[torch.tensor(grid, dtype=torch.long)], torch.zeros(1)))
    initial = sigmas.max() if case.legacy else (sigmas.max() ** 2 + 1) ** 0.5
    noise = torch.randn(
        (1, 4, *native.main.latent),
        generator=torch.Generator(device="cpu").manual_seed(case.command.seed),
        device="cpu",
        dtype=torch.float16,
    ).to("cuda:0")
    return SimpleNamespace(
        grid=grid,
        sigmas=sigmas.tolist(),
        beta=_tensor_hash(native, beta),
        alpha=_tensor_hash(native, cumulative),
        initial=_tensor_hash(native, noise * initial),
    )


def _assert_case(native: Any, case: Any, text: Any, seen: Any, report: Any) -> None:
    """Literal assertions deliberately follow publication and baseline witnesses."""
    torch = native.torch
    # Existing geometry-independent oracle uses fresh tokenizers, exact resource
    # rows and real CLIP/Compel; its temporary ten-row suffix is restored.
    conditioning = prior._conditioning(
        native, text, case.recipe, case.variant == "resource-neighbor"
    )
    context = torch.cat((conditioning.negative, conditioning.positive))
    pools = torch.cat((conditioning.negative_pooled, conditioning.positive_pooled))
    times = torch.tensor(
        [[1024, 1024, 0, 0, 1024, 1024]], device="cuda:0", dtype=torch.float16
    ).repeat(2, 1)
    masks = {factor: _permissions(native, case, factor) for factor in (2, 4)}
    expected: dict[str, Any] = {
        "context": _tensor_hash(native, context),
        "pools": _tensor_hash(native, pools),
        "timeIds": _tensor_hash(native, times),
        "masks": {str(factor): _tensor_hash(native, value) for factor, value in masks.items()},
        "streams": [
            {
                name: _tensor_hash(native, getattr(pair.result, name))
                for name in ("positive", "negative", "positive_pooled", "negative_pooled")
            }
            for pair in text.pairs
        ],
    }
    schedule = _literal_schedule(native, case)
    report["expected"], report["literalTimeline"] = expected, vars(schedule)
    assert len(seen.calls) == len(seen.decodes) == 1
    assert len(seen.roots) == len(seen.scales) == len(seen.steps) == case.steps
    assert seen.events == [
        event for _ in range(case.steps) for event in ("scale", "unet", "step")
    ] + ["decode"]
    call = seen.calls[0]
    assert not call["borrowed"] and not call["schedulerBorrowed"]
    assert call["unetSame"] and call["vaeSame"]
    assert call["generatorDevice"] == "cpu" and call["seed"] == case.command.seed
    config = call["config"]
    for key, value in {
        "num_train_timesteps": 1000,
        "beta_start": 0.00085,
        "beta_end": 0.012,
        "beta_schedule": "scaled_linear",
        "trained_betas": None,
        "steps_offset": 1,
        "prediction_type": "epsilon",
        "rescale_betas_zero_snr": False,
        "timestep_spacing": "linspace" if case.legacy else "leading",
        "interpolation_type": "linear",
        "timestep_type": "discrete",
        "final_sigmas_type": "zero",
        "use_karras_sigmas": False,
        "use_exponential_sigmas": False,
        "use_beta_sigmas": False,
        "sigma_min": None,
        "sigma_max": None,
    }.items():
        assert config[key] == value, f"literal Euler policy differs at {key}"
    assert call["timesteps"] == schedule.grid, (
        "actual consumed scheduler grid differs from Main policy"
    )
    assert call["sigmas"] == schedule.sigmas, (
        "scheduler sigmas differ from independent beta equations"
    )
    assert call["betaHash"] == schedule.beta and call["alphaHash"] == schedule.alpha
    options = call["options"]
    assert options["num_inference_steps"] == case.steps and options["num_images_per_prompt"] == 1
    assert options["output_type"] == "pt" and options["guidance_scale"] == 5.0
    assert options["guidance_rescale"] == 0.0
    assert (options["height"], options["width"]) == (case.command.height, case.command.width)
    for key in ("original_size", "target_size", "negative_original_size", "negative_target_size"):
        assert tuple(options[key]) == (1024, 1024)
    for key in ("crops_coords_top_left", "negative_crops_coords_top_left"):
        assert tuple(options[key]) == (0, 0)
    assert (
        options.get("timesteps")
        is options.get("sigmas")
        is options.get("callback_on_step_end")
        is None
    )
    assert seen.steps[0]["sample"] == schedule.initial, (
        "first sample lost CPU-seed/native noise association"
    )
    names = Counter({site.name: 1 for site in native.sites.values()})
    for index, (root, scale, step) in enumerate(
        zip(seen.roots, seen.scales, seen.steps, strict=True)
    ):
        assert root["timestep"] == scale["timestep"] == step["timestep"] == schedule.grid[index]
        assert step["sigma"] == scale["sigma"] == schedule.sigmas[index]
        assert step["nextSigma"] == schedule.sigmas[index + 1]
        assert (
            scale["literalScale"]
            and step["literalEuler"]
            and step["cfgAssociation"]
            and step["previousAssociation"]
        )
        assert step["sChurn"] == 0.0
        assert step["batch"] == scale["input"] and scale["output"] == root["sample"]
        assert root["sampleShape"] == [2, 4, *native.main.latent]
        assert root["sampleDtype"] == "torch.float16" and root["sampleDevice"] == "cuda:0"
        assert (
            root["timeDtype"] == "torch.float32"
            and root["timeDevice"] == "cuda:0"
            and root["timeShape"] == []
        )
        assert all(root[key] == expected[key] for key in ("context", "pools", "timeIds"))
        rows = [row for row in seen.sites if row["step"] == index + 1]
        assert Counter(row["site"] for row in rows) == names
        for row in rows:
            assert row["original"] and row["sdpaCalls"] == 1
            assert row["context"] == expected["context"]
            assert row["heads"] == (10 if row["factor"] == 2 else 20)
            assert (
                row["queries"] == masks[row["factor"]].shape[1] and row["keys"] == context.shape[1]
            )
            for key in ("processorMask", "sdpaMask"):
                mask = row[key]
                assert mask["matches"] and mask["headsIdentical"], (
                    f"wrong Main permissions at {row['site']} step {index + 1} ({key})"
                )
                assert mask["firstHead"] == expected["masks"][str(row["factor"])]
                assert mask["none"] == (not case.recipe["regions"]), (
                    "zero must preserve original no-mask native path"
                )
            assert row["qkvMatches"] == [True] * 3
            assert row["nativePolicy"] == {
                "dtype": True,
                "device": True,
                "dropout": 0.0,
                "causal": False,
                "scale": None,
            }
    decode = seen.decodes[0]
    assert decode["reserved"] and decode["regionalInstalled"] and decode["lastSampleAssociation"]
    assert decode["shape"] == [1, 4, *native.main.latent]
    assert len(text.plans) == 1 and len(text.pairs) == (4 if case.recipe["regions"] else 1), (
        "encoding must occur once, independently of step count"
    )
    if not case.recipe["regions"]:
        assert text.plans == [None] and text.pairs[0].pipeline is native.pipeline
        assert not text.loads and text.resizes == 0
        assert len(text.encoder_calls) == 6
        return
    assert len(text.loads) == text.resizes == 2 and len(text.encoder_calls) == 15
    plan = text.plans[0]
    assert plan.prepared.aliases == tuple(f"igs_ti_private_{index}" for index in range(5))
    assert plan.prepared.counts == (2,) * 5
    for alias_index, pair_index, sign, resource_name in (
        (0, 0, 0, "A"),
        (1, 0, 1, "B"),
        (2, 1, 0, "A" if case.variant == "resource-neighbor" else "C"),
        (3, 1, 1, "B"),
        (4, 3, 1, "D"),
    ):
        pair, alias = text.pairs[pair_index], f"igs_ti_private_{alias_index}"
        assert alias in pair.inputs.prompts[sign]
        view = SimpleNamespace(
            pairs=[
                SimpleNamespace(
                    pipeline=pair.pipeline,
                    inputs=SimpleNamespace(prompts=(alias,), managers=pair.inputs.managers),
                )
            ],
            loads=text.loads,
            encoder_calls=text.encoder_calls,
        )
        native.shared._alias_rows(native, view, 0, native.main.states[resource_name])


def _ordinary(native: Any, case: Any, regional: Any, report: Any) -> None:
    """Independent ordinary zero: literal Euler, direct Compel, all PT/RGB exact."""
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
        timestep_spacing="linspace" if case.legacy else "leading",
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
    finite_unet = importlib.import_module("imagegen_worker.inference_lora").finite_unet_outputs
    finite_vae = importlib.import_module("imagegen_worker.inference_vae").finite_vae_outputs
    with finite_unet(ordinary, torch), finite_vae(ordinary, torch):
        result = ordinary(
            prompt_embeds=positive,
            negative_prompt_embeds=negative,
            pooled_prompt_embeds=positive_pool,
            negative_pooled_prompt_embeds=negative_pool,
            width=case.command.width,
            height=case.command.height,
            original_size=(1024, 1024),
            target_size=(1024, 1024),
            negative_original_size=(1024, 1024),
            negative_target_size=(1024, 1024),
            crops_coords_top_left=(0, 0),
            negative_crops_coords_top_left=(0, 0),
            num_inference_steps=case.steps,
            num_images_per_prompt=1,
            guidance_scale=5.0,
            guidance_rescale=0.0,
            generator=torch.Generator(device="cpu").manual_seed(case.command.seed),
            output_type="pt",
        )
    array = result.images.detach().cpu().float()[0].permute(1, 2, 0).numpy()
    rgb = (array * 255).round().astype("uint8").tobytes()
    with importlib.import_module("PIL.Image").open(case.command.output_path) as image:
        image.load()
        reopened = image.tobytes()
    report["ordinary"] = {
        "nativeImage": _tensor_hash(native, result.images),
        "rgb": _sha(rgb),
        "allPtExact": torch.equal(result.images, regional.images),
        "allReopenedRgbExact": rgb == reopened,
        "literalSpacing": "linspace" if case.legacy else "leading",
        "originalProcessors": True,
    }
    assert report["ordinary"]["allPtExact"] and report["ordinary"]["allReopenedRgbExact"]


def _finish(settings: Any, selector: str, report: Any, started: float) -> None:
    report["elapsedSeconds"] = time.monotonic() - started
    report["processPeakRssBytes"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024
    with (RUN / f"{settings.label}-{selector}.json").open("x") as stream:
        json.dump(report, stream, indent=2)
        stream.write("\n")


def _header(settings: Any) -> dict[str, Any]:
    return {
        "status": "incomplete",
        "base": "10147ef7c4797340e5b574c3cfcf82147abe37a7",
        "checkpointSha256": prior.SOURCE_SHA,
        "checkpointBytes": prior.SOURCE_BYTES,
        "recipeFile": str(settings.path),
        "recipeFileSha256": settings.sha256,
        "sourceSha256": settings.sources,
        "loadingJournalSourceSha256": JOURNAL_SHA,
        "mainCheckpointResolution": settings.resolved,
        "mode": settings.mode,
        "mutation": settings.mutation,
        "bbox": settings.bbox,
        "latent": list(settings.latent),
        "limits": [
            "private trained worker mechanics",
            "ROOT owns aggregate envelope",
            "no quality or public readiness",
            "Main durability remains producer evidence",
        ],
    }


def _run_case(native: Any, name: str, monkeypatch: Any, *, selector: str | None = None) -> Any:
    settings, started = native.main, time.monotonic()
    selector = selector or name
    report = _header(settings)
    report.update(case=name, selector=selector)
    text = seen = case = None
    native.torch.cuda.reset_peak_memory_stats(0)
    try:
        case = _case(native, name, selector)
        report.update(
            variant=case.variant,
            steps=case.steps,
            seed=case.command.seed,
            denoisingProfile=case.args["denoising_profile"],
            callerNoisePolicy=None
            if case.legacy
            else dataclasses.asdict(case.command.noise_profile),
        )
        recipe_before, command_before, target_before = (
            copy.deepcopy(case.recipe),
            copy.deepcopy(case.command),
            case.target.read_bytes(),
        )
        with _preserved(native):
            with (
                _text_observer(native, monkeypatch) as text,
                _native_observer(native, case, monkeypatch) as seen,
            ):
                receipt = native.output.generate_current_canvas_regional_txt2img(
                    case.recipe, command=case.command, **case.args
                )
            _raw(native, text, seen, report)
            _png(native, case, seen, receipt, report)
            baseline = _comparison(settings, name, report)
            _assert_case(native, case, text, seen, report)
            if case.variant == "zero":
                _ordinary(native, case, seen.result, report)
            if baseline is not None:
                for key in (
                    "roots",
                    "scales",
                    "steps",
                    "sites",
                    "decodes",
                    "predictions",
                    "nativeImage",
                    "rgb",
                    "encodingCounts",
                    "aliasRows",
                    "actualClipAliases",
                    "expected",
                    "literalTimeline",
                ):
                    _equal(report[key], baseline[key], f"native {key} differs from pinned GREEN")
        _equal(case.recipe, recipe_before, "complete Main recipe changed")
        assert case.command == command_before
        _equal(case.target.read_bytes(), target_before, "target PNG changed")
        assert prior._source_map() == settings.sources
        _equal(settings.path.read_bytes(), settings.raw, "Main JSON changed during ROOT case")
        assert time.monotonic() - started < 600, "ROOT unit deadline exceeded"
        report.update(
            status="passed", sourceStateStorageGraphTokenizersRngReservationsPreserved=True
        )
        settings.records[name] = report
        return report
    except BaseException as error:
        report.update(
            status="failed", failure={"type": type(error).__name__, "message": str(error)[:1200]}
        )
        raise
    finally:
        _raw(native, text, seen, report)
        native.torch.cuda.synchronize(0)
        report["cudaPeakAllocatedBytes"] = native.torch.cuda.max_memory_allocated(0)
        report["cudaPeakReservedBytes"] = native.torch.cuda.max_memory_reserved(0)
        _finish(settings, selector, report, started)
        # Release owned TI graphs even when pytest keeps a failing frame alive.
        if text is not None:
            cast(dict[str, Any], vars(text)).clear()
        if seen is not None:
            cast(dict[str, Any], vars(seen)).clear()
        case = text = seen = None
        gc.collect()


@pytest.mark.parametrize("name", tuple(CASES))
def test_sampling_main_matrix(sampling: Any, monkeypatch: Any, name: str) -> None:
    _run_case(sampling, name, monkeypatch)


def test_sampling_main_policy_red(sampling: Any, monkeypatch: Any) -> None:
    _run_case(sampling, "base20", monkeypatch, selector="main-policy-base20")


def test_sampling_legacy_policy_control_green(sampling: Any, monkeypatch: Any) -> None:
    _run_case(sampling, "legacyzero2", monkeypatch, selector="legacy-policy-zero2")


def test_sampling_late_permission_red(sampling: Any, monkeypatch: Any) -> None:
    _run_case(sampling, "base20", monkeypatch, selector="late-permission-base20")


def test_sampling_zero_permission_control_green(sampling: Any, monkeypatch: Any) -> None:
    _run_case(sampling, "zero20", monkeypatch, selector="permission-zero20")


def test_sampling_recorded_causal_controls(settings: Any) -> None:
    """Pinned-record aggregate has no dependency on the ML/loader fixture."""
    report, started = _header(settings), time.monotonic()
    try:
        assert settings.mutation is None
        records = (
            {name: _expected(settings, name) for name in CASES}
            if settings.mode == "verify"
            else settings.records
        )
        assert set(CASES).issubset(records), "all seven GREEN matrix records are required"
        base = records["base20"]
        repeat = records["repeat20"]
        for key in (
            "roots",
            "scales",
            "steps",
            "sites",
            "predictions",
            "nativeImage",
            "rgb",
            "expected",
            "encodingCounts",
        ):
            _equal(base[key], repeat[key], f"same-seed repeat changed {key}")
        for name in ("base30", "resource20", "coverage20", "changedseed20"):
            other = records[name]
            assert other["predictions"] != base["predictions"] and other["rgb"] != base["rgb"]
            assert other["encodingCounts"] == base["encodingCounts"], (
                "encoding counts depend on steps/neighbor"
            )
            left, right = base["expected"], other["expected"]
            if name == "resource20":
                assert left["masks"] == right["masks"] and left["pools"] == right["pools"]
                for index, (a, b) in enumerate(zip(left["streams"], right["streams"], strict=True)):
                    for key in a:
                        if index == 1 and key == "positive":
                            assert a[key] != b[key]
                        elif index == 1 and key == "positive_pooled":
                            continue  # unselected regional pool never reaches UNet
                        else:
                            assert a[key] == b[key]
                assert base["steps"][0]["sample"] == other["steps"][0]["sample"]
                assert any(
                    a["output"] != b["output"]
                    for a, b in zip(base["sites"], other["sites"], strict=True)
                )
            elif name == "coverage20":
                assert all(
                    left[key] == right[key] for key in ("context", "pools", "timeIds", "streams")
                )
                assert all(
                    left["masks"][str(factor)] != right["masks"][str(factor)] for factor in (2, 4)
                ), "coverage contrast collapsed under native spatial pooling"
                assert base["steps"][0]["sample"] == other["steps"][0]["sample"]
            else:
                assert left == right
                assert base["roots"][0]["sample"] != other["roots"][0]["sample"]
        assert (
            records["zero20"]["ordinary"]["allPtExact"]
            and records["zero20"]["ordinary"]["allReopenedRgbExact"]
        )
        report.update(
            status="passed",
            cases=7,
            newNativeRequests=0,
            modelLoads=0,
            pinnedRecordDigests={
                name: _sha(json.dumps(records[name], sort_keys=True).encode()) for name in CASES
            },
        )
    except BaseException as error:
        report.update(
            status="failed", failure={"type": type(error).__name__, "message": str(error)[:1200]}
        )
        raise
    finally:
        _finish(settings, "causal-controls", report, started)


@pytest.mark.parametrize("failure", ("later-step15", "decode", "publication"))
def test_sampling_recoverable_failure(sampling: Any, monkeypatch: Any, failure: str) -> None:
    native, started = sampling, time.monotonic()
    settings = native.main
    selector, report = f"fault-{failure}", _header(settings)
    report.update(failureCase=failure, failedRequestSuccessReceipts=0, recoverySuccessReceipts=0)
    case = text = seen = None
    calls: list[str] = []
    owner: Any
    sentinel = OSError(f"trained sampling recoverable {failure}")
    try:
        case = _case(native, "base20", selector)
        if failure == "later-step15":
            owner, method, threshold = cast(Any, type(native.pipeline.unet)), "forward", 15
        elif failure == "decode":
            owner, method, threshold = cast(Any, type(native.pipeline.vae)), "decode", 1
        else:
            owner, method, threshold = (
                importlib.import_module("imagegen_worker.generation_artifacts").os,
                "link",
                1,
            )
        recipe_before, command_before, target_before = (
            copy.deepcopy(case.recipe),
            copy.deepcopy(case.command),
            case.target.read_bytes(),
        )
        with _preserved(native):
            with (
                _text_observer(native, monkeypatch) as text,
                _native_observer(native, case, monkeypatch) as seen,
                monkeypatch.context() as patch,
            ):
                original = getattr(owner, method)

                @wraps(original)
                def injected(*args: Any, **kwargs: Any) -> Any:
                    if failure == "publication":
                        if Path(args[1]) == cast(Any, case).command.output_path:
                            calls.append("real-publisher-link")
                            raise sentinel
                        return original(*args, **kwargs)
                    result = original(*args, **kwargs)
                    calls.append("original-native-result")
                    if len(calls) == threshold:
                        raise sentinel
                    return result

                patch.setattr(owner, method, injected)
                with pytest.raises(Exception) as caught:
                    native.output.generate_current_canvas_regional_txt2img(
                        case.recipe, command=case.command, **case.args
                    )
            _raw(native, text, seen, report)
            visited: set[int]
            error, visited = caught.value, cast(set[int], set())
            while error is not None and id(error) not in visited:
                visited.add(id(error))
                if error is sentinel:
                    break
                error = error.__cause__
            assert error is sentinel, "failure did not originate at the designated real boundary"
            report["exception"] = {
                "type": type(caught.value).__name__,
                "message": str(caught.value),
            }
            assert len(calls) == threshold
            if failure == "later-step15":
                assert len(seen.roots) == 15 and len(seen.steps) == 14
                assert not seen.decodes and seen.result is None
            else:
                assert len(seen.roots) == len(seen.steps) == 20
                assert len(seen.decodes) == 1 and seen.decodes[0]["reserved"]
                assert seen.decodes[0]["lastSampleAssociation"]
                assert (seen.result is not None) == (failure == "publication")
            assert not case.command.output_path.exists() and not list(case.root.glob(".*.tmp"))
            _equal(case.recipe, recipe_before, "failed request changed complete Main recipe")
            assert case.command == command_before
            _equal(case.target.read_bytes(), target_before, "failed request changed target PNG")
        report["failedRequestRestored"] = True
        cast(dict[str, Any], vars(text)).clear()
        cast(dict[str, Any], vars(seen)).clear()
        text = seen = None
        gc.collect()
        recovery = _run_case(native, "base20", monkeypatch, selector=f"recovery-{failure}")
        assert recovery["status"] == "passed"
        report.update(status="passed", freshRecoveryRgb=recovery["rgb"], recoverySuccessReceipts=1)
        assert time.monotonic() - started < 600
    except BaseException as error:
        report.update(
            status="failed", failure={"type": type(error).__name__, "message": str(error)[:1200]}
        )
        raise
    finally:
        _raw(native, text, seen, report)
        report["callsAtFault"] = calls
        _finish(settings, selector, report, started)
        if text is not None:
            cast(dict[str, Any], vars(text)).clear()
        if seen is not None:
            cast(dict[str, Any], vars(seen)).clear()
        case = text = seen = None
        gc.collect()
