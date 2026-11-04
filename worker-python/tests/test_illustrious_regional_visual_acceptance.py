"""ROOT-only natural-text experiment: mechanical PASS leaves visual evaluation pending.

Author validation is AST/scoped Ruff only. ROOT owns imports, collection, strict
typing and serial native units (aggregate host <=12 GiB, swap=0, <=600 s,
CUDA allocator .75). No provisioning, driver, mutation or cleanup lives here.

IGS_REGIONAL_VISUAL_RUN must equal RUN; MODE=record|verify; LABEL is fresh ASCII
<=64 characters. MAIN defaults to RUN/main-natural/main-natural-recipes.json.
EXPECTED is a pinned GREEN filename (optional {case}); EXPECTED_SHA256 is its
SHA256 or a JSON case:digest map. Aggregates may contain a cases mapping. The
same framework as the earlier sampling experiment is permitted, but this file,
all regional test helpers, production owners and native sources remain bound.
MUTATION=association permits only the adapter source to differ, in verify mode.

Frozen mutation selectors, with no extra alias requests:
  test_natural_text_visual_matrix[seed123-assignment]
  test_natural_text_visual_matrix[seed123-baseline]
Reports: RUN/{LABEL}-{case}.json, natural-text-regional-visual-mechanical-v1.
Six primary calls plus seed123-assignment-repeat plus one ordinary baseline123
counterpart = eight native calls. The ordinary counterpart runs ONLY in record
mode; verify controls compare their actual PT/RGB to that pinned ordinary GREEN.
The mutant/restored pairs therefore add two calls each, twelve in total.

Original-calling sampling observers are reused, with this scene's independent
literal permission oracle. No denoising loop or production wrapper is copied.
All 70 original processors/SDPA calls on every step are observed compactly;
mask association assertions follow actual publication. Finally retains reports
on semantic RED. The only transport normalization is __test_alpha8_b64__.
Images/color differences never establish visual PASS. ROOT separately evaluates
the six unchanged PNGs, blinded, against the immutable preregistered rubric.
No public admission, Main durability or PP-001/007/008 readiness is qualified.
"""

from __future__ import annotations

import copy
import dataclasses
import gc
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

import test_illustrious_regional_sampling_trained as _sampling_helpers
import test_illustrious_regional_trained as _trained_helpers

sampling: Any = cast(Any, _sampling_helpers)
trained: Any = cast(Any, _trained_helpers)

RUN = (
    Path.home()
    / ".codex/artifacts/imagegen-studio/runs/regional-guidance-visual/20261027-apple-mug"
)
BASE = "166ecdd4ceaedbe0905e1a2ce310141707c9df5c"
CONTRACT_SHA = "d97bfe4944659c956be0c30d66f5e77ce533026192836d6f4aa3578917b4495c"
PREFIX = "IGS_REGIONAL_VISUAL_"
SCHEMA = "natural-text-regional-visual-mechanical-v1"
JOURNAL = trained.RUN / "trained_loading_journal.py"
JOURNAL_SHA = "b998141902d577d1cf1d81bc70cc71b7d73f3c26742d2ef1f16a82d00bfbff31"
ADAPTER = "worker-python/src/imagegen_worker/illustrious_regional_attention_adapter.py"
SELF = "worker-python/tests/test_illustrious_regional_visual_acceptance.py"
BBOX = {"x": -13, "y": 5, "width": 1024, "height": 1024}
GLOBAL = (
    "a still life of a red apple and a blue ceramic mug on a plain table, "
    "two separate objects, soft studio lighting"
)
LEFT, RIGHT = "a single red apple", "a single blue ceramic mug"
CASES = tuple(
    f"seed{seed}-{variant}"
    for seed in (123, 124)
    for variant in ("baseline", "assignment", "swapped")
)
REPEAT = "seed123-assignment-repeat"
FIELDS = ("positive", "negative", "positive_pooled", "negative_pooled")
EXACT_FIELDS = (
    "roots",
    "scales",
    "steps",
    "sites",
    "decodes",
    "predictions",
    "nativeImage",
    "rgb",
    "encodingCounts",
    "actualClipAliases",
    "expected",
    "literalTimeline",
    "assembly",
)


def _equal(actual: Any, expected: Any, message: str) -> None:
    sampling._equal(actual, expected, message)


def _sha(value: bytes) -> str:
    return cast(str, trained._sha(value))


def _hash(native: Any, value: Any) -> str:
    return cast(str, trained._tensor_hash(native, value))


def _document_witness(document: Any) -> Any:
    """Detached comparison witness; never used as a production recipe/input."""
    result = copy.deepcopy(document)
    result.pop("documentRevision")
    result["generationDraft"]["seed"]["value"] = "<seed-axis>"
    for region in result["regionalGuidance"]:
        region["enabled"] = "<enable-axis>"
        region["prompts"]["positive"]["text"] = "<association-axis>"
    return result


def _recipe_witness(recipe: Any, *, regions: bool) -> Any:
    """Only compare detached witnesses; no rebuilt recipe is ever submitted."""
    result = copy.deepcopy(recipe)
    result.pop("documentRevision")
    result["item"].pop("seed")
    if not regions:
        result.pop("regions")
    else:
        for region in result["regions"]:
            region["positive"]["text"] = "<association-axis>"
            if "authoredPrompts" in region:
                region["authoredPrompts"]["positive"]["text"] = "<association-axis>"
    return result


@pytest.fixture(scope="module")
def settings() -> Any:
    requested = os.environ.get(PREFIX + "RUN")
    if requested is None:
        pytest.skip("ROOT opt-in: IGS_REGIONAL_VISUAL_RUN=<exact RUN>")
    assert requested == str(RUN)
    mode, label = os.environ.get(PREFIX + "MODE"), os.environ.get(PREFIX + "LABEL", "")
    assert mode in ("record", "verify")
    assert re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", label)
    mutation = os.environ.get(PREFIX + "MUTATION")
    assert mutation in (None, "association")
    assert mutation is None or mode == "verify", "mutations cannot create expected GREEN"
    contract_raw = (RUN / "experiment-contract.json").read_bytes()
    assert _sha(contract_raw) == CONTRACT_SHA
    contract = json.loads(contract_raw)
    assert contract["base"] == BASE and contract["fixedBeforeNativeExecution"] is True
    assert contract["geometry"] == BBOX and contract["seeds"] == [123, 124]
    assert contract["globalPositive"] == GLOBAL and contract["globalNegative"] == ""
    assert contract["leftPrompt"] == LEFT and contract["rightPrompt"] == RIGHT
    path = Path(
        os.environ.get(PREFIX + "MAIN", str(RUN / "main-natural/main-natural-recipes.json"))
    )
    raw = path.read_bytes()
    # The existing normalizer decodes only the exact alpha marker; no recipe edits.
    data: Any = trained._transport(json.loads(raw))
    assert data["schema"] == "main-natural-text-visual-v1"
    assert data["base"] == BASE and data["experimentContractSha256"] == CONTRACT_SHA
    assert data["exactResources"] == {} and data["sourcePins"]
    assert set(data["variants"]) == set(CASES)
    checkpoint, variants = data["checkpoint"], data["variants"]
    reference, resolved = checkpoint["reference"], checkpoint["resolved"]
    assert checkpoint["sha256"] == reference["fileSha256"] == trained.SOURCE_SHA
    assert checkpoint["byteSize"] == trained.SOURCE_BYTES
    assert checkpoint["sourcePath"] == resolved["managedPath"] == str(trained.SOURCE)
    assert reference["predictionType"] == "epsilon"
    assert set(resolved) == {"managedPath", "reference", "noiseProfile"}
    assert resolved["reference"] == reference and resolved["noiseProfile"] == sampling.POLICY
    document_witness = recipe_witness = regional_witness = None
    targets: dict[str, Any] = {}
    halves = (bytes([255]) * 512 + bytes(512), bytes(512) + bytes([255]) * 512)
    for name in CASES:
        row = variants[name]
        seed, variant = name.split("-", 1)
        recipe, target, document = row["recipe"], row["targetMode"], row["authoredDocument"]
        assert row["checkpointResolution"] == resolved and row["durableUnchanged"] is True
        assert re.fullmatch(r"[0-9a-f]{64}", row["durableStateSha256"])
        assert recipe["kind"] == "current-canvas-regional-recipe"
        assert recipe["family"] == "illustrious" and recipe["bbox"] == target["bbox"] == BBOX
        assert target["mode"] == "txt2img" and target["alphaClassification"] == "all-zero"
        assert all(
            recipe[key] == target[key] == document[key]
            for key in ("documentId", "documentRevision")
        )
        assert recipe["item"]["seed"] == int(seed[4:])
        assert recipe["item"]["prompts"] == {"positive": GLOBAL, "negative": ""}
        assert recipe["globalPrompts"] == {
            "positive": {"text": GLOBAL, "embeddingRefs": []},
            "negative": {"text": "", "embeddingRefs": []},
        }
        assert recipe["globalEmbeddings"] == {"positive": [], "negative": []}
        draft = document["generationDraft"]
        assert draft["positivePrompt"] == recipe["globalPrompts"]["positive"]
        assert draft["negativePrompt"] == recipe["globalPrompts"]["negative"]
        assert draft["model"] == reference and draft["loras"] == [] and draft["vae"] is None
        assert draft["seed"] == {"policy": "fixed", "value": int(seed[4:])}
        assert draft["sampling"]["steps"] == 30 and draft["sampling"]["cfgScale"] == 5.0
        assert draft.get("cfgRescale", 0) == 0 and draft["vaePrecision"] == "FP16"
        assert "dynamicPrompt" not in draft
        assert draft["sampling"]["sampler"] == "Euler"
        assert draft["sampling"]["scheduler"] == "Normal"
        assert draft["sampling"]["denoisingStrength"] is None
        authored = document["regionalGuidance"]
        assert len(authored) == 2
        texts = (RIGHT, LEFT) if variant == "swapped" else (LEFT, RIGHT)
        for index, owner in enumerate(authored):
            assert owner["enabled"] is (variant != "baseline")
            assert owner["prompts"]["positive"] == {"text": texts[index], "embeddingRefs": []}
            assert owner["prompts"]["negative"] == {"text": "", "embeddingRefs": []}
            assert owner["prompts"]["useGlobalNegativePrompt"] is False
            assert not owner.get("referenceImages", [])
        regions = recipe["regions"]
        assert len(regions) == (0 if variant == "baseline" else 2)
        for index, region in enumerate(regions):
            owner = authored[index]
            assert region["regionId"] == owner["id"]
            assert region["maskId"] == owner["mask"]["id"]
            assert region["maskRevision"] == owner["mask"]["revision"]
            assert region["positive"] == {"text": texts[index], "embeddingRefs": []}
            assert region["negative"] == {
                "source": "regional",
                "prompt": {"text": "", "embeddingRefs": []},
            }
            assert region["embeddings"] == {"positive": [], "negative": []}
            assert not region.get("referenceImages", [])
            if "authoredPrompts" in region:
                assert region["authoredPrompts"] == owner["prompts"]
            coverage = region["coverage"]
            assert coverage["kind"] == "covered" and coverage["bounds"] == BBOX
            assert (
                coverage["intersection"]
                == owner["mask"]["bounds"]
                == {
                    "x": -13 + 512 * index,
                    "y": 5,
                    "width": 512,
                    "height": 1024,
                }
            )
            _equal(coverage["alpha"], halves[index] * 1024, "whole literal half mask differs")
        dw, rw = _document_witness(document), _recipe_witness(recipe, regions=False)
        if document_witness is None:
            document_witness, recipe_witness = dw, rw
        _equal(dw, document_witness, "saved document differs outside preregistered axes")
        _equal(rw, recipe_witness, "complete Main recipe differs outside declared axes")
        if regions:
            witness = _recipe_witness(recipe, regions=True)
            if regional_witness is None:
                regional_witness = witness
            _equal(
                witness, regional_witness, "swapping text changed owners/masks/other recipe data"
            )
        relative = Path(target["relativePng"])
        assert not relative.is_absolute() and relative.parts[0] == "targets"
        assert ".." not in relative.parts and relative.suffix == ".png"
        source = path.parent / relative
        binary = source.read_bytes()
        assert len(binary) == target["byteSize"] and _sha(binary) == target["sha256"]
        targets[name] = (source, binary)
    sources = trained._source_map()
    baseline = json.loads((RUN / "baseline-source.manifest.json").read_bytes())
    assert baseline["base"] == BASE
    for source, digest in sources.items():
        if source == SELF or (source == ADAPTER and mutation):
            continue
        assert baseline["files"][source]["sha256"] == digest, f"unexpected source drift: {source}"
    result = SimpleNamespace(
        path=path,
        raw=raw,
        data=data,
        variants=variants,
        resolved=resolved,
        reference=reference,
        bbox=BBOX,
        latent=(128, 128),
        sha256=_sha(raw),
        label=label,
        mode=mode,
        mutation=mutation,
        sources=sources,
        records={},
        targets=targets,
        contract_raw=contract_raw,
    )
    result.pinned = {}
    if mode == "verify":
        assert os.environ.get(PREFIX + "EXPECTED") and os.environ.get(PREFIX + "EXPECTED_SHA256")
    return result


def _framework_sources(native: Any) -> dict[str, str]:
    objects: dict[str, Any] = {
        "pipeline": type(native.pipeline),
        "euler": native.diffusers.EulerDiscreteScheduler,
        "processor": native.processor_type,
        "compel": native.runtime.compel.Compel,
        "clip_l": type(native.pipeline.text_encoder),
        "clip_g": type(native.pipeline.text_encoder_2),
        "torch_functional": native.torch.nn.functional,
        "compel_embeddings": importlib.import_module("compel.embeddings_provider"),
    }
    result = {name: _sha(Path(inspect.getfile(obj)).read_bytes()) for name, obj in objects.items()}
    for path in sorted((trained.OLD / "retained-config").rglob("*")):
        if path.is_file():
            result[f"config/{path.relative_to(trained.OLD / 'retained-config')}"] = _sha(
                path.read_bytes()
            )
    return result


@pytest.fixture(scope="module")
def visual(settings: Any) -> Iterator[Any]:
    """One production loader; verified evaluated components, restored loading slots."""
    inference = importlib.import_module("imagegen_worker.inference")
    shared = importlib.import_module("test_illustrious_regional_shared_text")
    runtime = inference.qualify_ml_runtime()
    torch = runtime.torch
    assert torch.cuda.is_available(), "opted-in CUDA execution must not skip"
    torch.set_num_threads(1)
    torch.cuda.set_per_process_memory_fraction(0.75, 0)
    assert _sha(JOURNAL.read_bytes()) == JOURNAL_SHA
    spec = importlib.util.spec_from_file_location("_visual_trained_loading_journal", JOURNAL)
    assert spec is not None and spec.loader is not None and spec.name not in sys.modules
    journal_module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = journal_module
    try:
        spec.loader.exec_module(journal_module)
        parameters = shared.e._parameters(
            GLOBAL,
            "",
            checkpoint_path=trained.SOURCE,
            checkpoint_sha256=trained.SOURCE_SHA,
            prediction_type="epsilon",
            seed=123,
            steps=30,
            cfg_scale=5.0,
            scheduler="euler",
            vae_precision="FP16",
            noise_profile=sampling._noise(settings),
        )
        with torch.no_grad():
            with journal_module.loading_journal(
                torch, trained.SOURCE, RUN / f"{settings.label}-loading.json"
            ) as journal:
                pipeline, inputs = inference.load_illustrious_pipeline(
                    parameters,
                    config_dir=trained.OLD / "retained-config",
                    runtime=runtime,
                    mode="txt2img",
                )
                components = (
                    pipeline.text_encoder,
                    pipeline.text_encoder_2,
                    pipeline.unet,
                    pipeline.vae,
                )
                for component in components:
                    component.eval()
                journal.verify(pipeline)
            assert [sum(p.numel() for p in model.parameters()) for model in components] == [
                123060480,
                694659840,
                2567463684,
                83653863,
            ]
            assert all(
                model.device == torch.device("cuda:0")
                and model.dtype == torch.float16
                and not model.training
                for model in components
            )
            assert pipeline.vae.config.force_upcast is False
            # Native lazy CLIP capture setup belongs outside the preserved baseline.
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
            assert set(parents) == set(trained.TOPOLOGY)
            sites: dict[int, Any] = {}
            bindings: list[Any] = []
            for name, (factor, depth) in trained.TOPOLOGY.items():
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
            native.framework_sources = _framework_sources(native)
            yield native
            _equal(_framework_sources(native), native.framework_sources, "framework/config drift")
    finally:
        sys.modules.pop(spec.name, None)
        _inputs_unchanged(settings)


def _inputs_unchanged(settings: Any) -> None:
    _equal(trained._source_map(), settings.sources, "source changed during ROOT execution")
    _equal(settings.path.read_bytes(), settings.raw, "Main JSON changed")
    _equal(
        (RUN / "experiment-contract.json").read_bytes(), settings.contract_raw, "contract changed"
    )
    for source, binary in settings.targets.values():
        _equal(source.read_bytes(), binary, "retained Main target changed")


@contextmanager
def _original_preserved(native: Any, report: Any) -> Generator[None]:
    """Retain an explicit successful restoration witness even when the body is RED."""
    original = trained._preserved(native)
    original.__enter__()
    try:
        yield
    finally:
        report["sourceStateStorageGraphTokenizersRngReservationsPreserved"] = False
        original.__exit__(*sys.exc_info())
        report["sourceStateStorageGraphTokenizersRngReservationsPreserved"] = True


def _case(native: Any, name: str) -> Any:
    settings = native.main
    primary = "seed123-assignment" if name == REPEAT else name
    row = settings.variants[primary]
    recipe, target = row["recipe"], row["targetMode"]
    source, binary = settings.targets[primary]
    image_type = importlib.import_module("PIL.Image")
    derivatives = importlib.import_module("imagegen_worker.derivatives")
    with image_type.open(source) as image:
        image.load()
        assert image.format == "PNG" and image.mode == "RGBA" and image.size == (1024, 1024)
        assert image.getchannel("A").getextrema() == (0, 0)
        assert image.info["icc_profile"] == derivatives.SRGB_ICC_PROFILE
    root = RUN / "payloads" / settings.label / name
    root.mkdir(mode=0o700, parents=True, exist_ok=False)
    local_target = root / "target.png"
    local_target.write_bytes(binary)
    item = recipe["item"]
    parameters = native.shared.e._parameters(
        item["prompts"]["positive"],
        item["prompts"]["negative"],
        checkpoint_path=trained.SOURCE,
        checkpoint_sha256=trained.SOURCE_SHA,
        prediction_type="epsilon",
        seed=item["seed"],
        steps=30,
        cfg_scale=5.0,
        scheduler="euler",
        vae_precision="FP16",
        noise_profile=sampling._noise(settings),
    )
    protocol = importlib.import_module("imagegen_worker.protocol")
    command = protocol.GenerateIllustriousTxt2ImgCommand(
        **{
            field.name: getattr(parameters, field.name)
            for field in dataclasses.fields(protocol.IllustriousInferenceParameters)
        },
        request_id=f"visual-{settings.label}-{name}",
        target_path=local_target,
        target_sha256=target["sha256"],
        target_byte_size=target["byteSize"],
        target_icc_sha256=derivatives.PINNED_SRGB_ICC_SHA256,
        width=1024,
        height=1024,
        bbox=copy.deepcopy(BBOX),
        staging_root=root,
        output_path=root / "candidate.png",
    )
    everywhere = importlib.import_module(
        "imagegen_worker.illustrious_regional_attention"
    ).Everywhere
    return SimpleNamespace(
        recipe=recipe,
        command=command,
        parameters=parameters,
        root=root,
        target=local_target,
        steps=30,
        variant=primary.split("-", 1)[1],
        legacy=False,
        args={
            "pipeline": native.pipeline,
            "runtime": native.runtime,
            "profile": native.shared.CUDA_ENCODING,
            "denoising_profile": "ordinary-canvas-euler-txt2img-cuda-fp16-v2",
            "global_negative_coverage": everywhere(),
            "global_positive_coverage": everywhere(),
            "negative_pooled_source_id": "current-canvas",
            "positive_pooled_source_id": "current-canvas",
            "bindings": native.bindings,
            "layout": "cfg-negative-first",
        },
    )


def _permissions(native: Any, case: Any, factor: int) -> Any:
    """Independent binary half planes on actual factor-two/four native grids."""
    torch = native.torch
    side = 128 // factor
    regional = bool(case.recipe["regions"])
    allowed = torch.zeros(2, side * side, 231 if regional else 77, dtype=torch.bool)
    allowed[:, :, :77] = True
    if regional:
        x = torch.arange(side).repeat(side)
        allowed[:, :, 77:154] = (x < side // 2)[None, :, None]
        allowed[:, :, 154:231] = (x >= side // 2)[None, :, None]
    return allowed.to("cuda:0")


@contextmanager
def _original_observers(native: Any, case: Any, monkeypatch: Any) -> Generator[Any]:
    """Observe actual one-shot encode/assembly and reuse transparent native observers."""
    assembly = SimpleNamespace(encodes=[], assemblies=[], originalCallSlotsRestored=False)
    owner = native.denoising
    encode, assemble = owner._encode_recipe_bindings, owner._assemble_owned_conditioning
    p = native.pipeline
    slots = [
        (owner, "_encode_recipe_bindings"),
        (owner, "_assemble_owned_conditioning"),
        (sampling, "_permissions"),
        (native.output, "run_current_canvas_regional_denoising"),
        (cast(Any, type(p)), "__call__"),
        (cast(Any, type(p.unet)), "forward"),
        (cast(Any, type(p.vae)), "decode"),
        (cast(Any, type(p.text_encoder)), "forward"),
        (cast(Any, type(p.text_encoder_2)), "forward"),
        (native.diffusers.EulerDiscreteScheduler, "scale_model_input"),
        (native.diffusers.EulerDiscreteScheduler, "step"),
        (native.processor_type, "__call__"),
        (native.torch.nn.functional, "scaled_dot_product_attention"),
        (native.shared.e._loader_mixin(), "load_textual_inversion"),
        (
            importlib.import_module("transformers.modeling_utils").PreTrainedModel,
            "_get_resized_embeddings",
        ),
        (native.recipe, "prepare_regional_embeddings"),
        (native.recipe, "build_sdxl_conditioning"),
    ]
    originals = [(current, key, getattr(current, key)) for current, key in slots]

    @wraps(encode)
    def encoded(*args: Any, **kwargs: Any) -> Any:
        result = encode(*args, **kwargs)
        plan, negative, positive = result
        assembly.encodes.append(
            {
                "keys": plan.key_length,
                "negative": [[row.binding_id, row.context.shape[1]] for row in negative],
                "positive": [[row.binding_id, row.context.shape[1]] for row in positive],
                "strategy": kwargs["embedding_strategy"],
            }
        )
        return result

    @wraps(assemble)
    def assembled(*args: Any, **kwargs: Any) -> Any:
        result = assemble(*args, **kwargs)
        assembly.assemblies.append(
            {
                "context": _hash(native, result[0]),
                "pools": _hash(native, result[1]),
                "keys": kwargs["keys"],
                "signs": list(kwargs["signs"]),
            }
        )
        return result

    try:
        with monkeypatch.context() as patch:
            patch.setattr(owner, "_encode_recipe_bindings", encoded)
            patch.setattr(owner, "_assemble_owned_conditioning", assembled)
            patch.setattr(sampling, "_permissions", _permissions)
            with (
                sampling._text_observer(native, monkeypatch) as text,
                sampling._native_observer(native, case, monkeypatch) as seen,
            ):
                yield text, seen, assembly
    finally:
        assembly.originalCallSlotsRestored = all(
            getattr(current, key) is original for current, key, original in originals
        )
        assert assembly.originalCallSlotsRestored, "original observer call slots were not restored"


def _literal_pair(native: Any, positive: str) -> tuple[Any, ...]:
    """Direct real Compel on literal scene text; no worker encoder/recipe builder."""
    torch, compel, pipeline = native.torch, native.runtime.compel, native.pipeline
    chunks: list[Any] = []
    pool: Any = None
    for index, (tokenizer, encoder) in enumerate(
        (
            (pipeline.tokenizer, pipeline.text_encoder),
            (pipeline.tokenizer_2, pipeline.text_encoder_2),
        )
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
        result = builder(positive)
        hidden, current_pool = result if index == 1 else (result, None)
        assert tuple(hidden.shape) == (1, 77, (768, 1280)[index])
        chunks.append(hidden)
        if index == 1:
            pool = current_pool
    combined = torch.cat(chunks, dim=-1)
    return combined, torch.zeros_like(combined), pool, torch.zeros_like(pool)


def _assert_text(native: Any, case: Any, text: Any, assembly: Any, report: Any) -> Any:
    torch, p = native.torch, native.pipeline
    literals = [GLOBAL]
    if case.variant != "baseline":
        literals += [RIGHT, LEFT] if case.variant == "swapped" else [LEFT, RIGHT]
    pairs = [_literal_pair(native, literal) for literal in literals]
    assert len(text.pairs) == len(pairs)
    for actual, literal, expected in zip(text.pairs, literals, pairs, strict=True):
        assert actual.pipeline is p
        assert (
            actual.parameters.positive_prompt == literal and actual.parameters.negative_prompt == ""
        )
        assert actual.inputs.prompts == (literal, "") and actual.inputs.managers == (None, None)
        for field, value in zip(FIELDS, expected, strict=True):
            assert torch.equal(getattr(actual.result, field), value), f"literal {field} differs"
        assert actual.result.positive_length == actual.result.negative_length == 77
    assert text.plans == [None], "no effective exact resources must preserve plan=None"
    assert not text.loads and text.resizes == 0, "no TI installation/resizing is allowed"
    # Pinned Compel: each nonempty positive calls CLIP-L once and CLIP-G twice
    # (hidden + pooled); inference._clip_embeddings creates zeros for empty signs.
    counts = Counter(id(row.encoder) for row in text.encoder_calls)
    assert counts == Counter({id(p.text_encoder): len(pairs), id(p.text_encoder_2): 2 * len(pairs)})
    assert all(not row.alias_ids and row.rows.numel() == 0 for row in text.encoder_calls)
    ids = ["current-canvas"] + [region["regionId"] for region in case.recipe["regions"]]
    expected_bindings = [[identity, 77] for identity in ids]
    assert assembly.encodes == [
        {
            "keys": 77 * len(pairs),
            "negative": expected_bindings,
            "positive": expected_bindings,
            "strategy": "shared-readonly",
        }
    ], "encoding must run once with the original full ordered sign-local bindings"
    context = torch.cat(
        (
            torch.cat([pair[1] for pair in pairs], dim=1),
            torch.cat([pair[0] for pair in pairs], dim=1),
        )
    )
    pools = torch.cat((pairs[0][3], pairs[0][2]))
    assert torch.count_nonzero(context[0]) == 0 and torch.count_nonzero(pools[0]) == 0
    assert assembly.assemblies == [
        {
            "context": _hash(native, context),
            "pools": _hash(native, pools),
            "keys": 77 * len(pairs),
            "signs": ["negative", "positive"],
        }
    ], "one owned assembly must retain all zero negative rows without tail padding"
    times = torch.tensor(
        [[1024, 1024, 0, 0, 1024, 1024]], device="cuda:0", dtype=torch.float16
    ).repeat(2, 1)
    report["assembly"] = cast(dict[str, Any], vars(assembly)).copy()
    report["expected"] = {
        "context": _hash(native, context),
        "pools": _hash(native, pools),
        "timeIds": _hash(native, times),
        "masks": {str(f): _hash(native, _permissions(native, case, f)) for f in (2, 4)},
        "streams": [
            {field: _hash(native, value) for field, value in zip(FIELDS, pair, strict=True)}
            for pair in pairs
        ],
        "sourceTexts": literals,
        "negativeTexts": [""] * len(pairs),
        "negativeAllZero": True,
        "rowsPerStream": 77,
        "tailPaddingRows": 0,
        "keys": 77 * len(pairs),
    }
    return context


def _assert_native(native: Any, case: Any, seen: Any, report: Any) -> None:
    expected = report["expected"]
    schedule = sampling._literal_schedule(native, case)
    report["literalTimeline"] = vars(schedule)
    assert schedule.grid == list(range(958, 0, -33))
    assert len(seen.calls) == len(seen.decodes) == 1
    assert len(seen.roots) == len(seen.scales) == len(seen.steps) == 30
    assert seen.events == [event for _ in range(30) for event in ("scale", "unet", "step")] + [
        "decode"
    ]
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
        "timestep_spacing": "leading",
        "interpolation_type": "linear",
        "timestep_type": "discrete",
        "final_sigmas_type": "zero",
        "use_karras_sigmas": False,
        "use_exponential_sigmas": False,
        "use_beta_sigmas": False,
        "sigma_min": None,
        "sigma_max": None,
    }.items():
        assert config[key] == value, f"literal Euler configuration differs: {key}"
    assert call["timesteps"] == schedule.grid and call["sigmas"] == schedule.sigmas
    assert call["betaHash"] == schedule.beta and call["alphaHash"] == schedule.alpha
    options = call["options"]
    for key, value in {
        "num_inference_steps": 30,
        "num_images_per_prompt": 1,
        "output_type": "pt",
        "guidance_scale": 5.0,
        "guidance_rescale": 0.0,
        "height": 1024,
        "width": 1024,
    }.items():
        assert options[key] == value
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
    assert seen.steps[0]["sample"] == schedule.initial
    names = Counter({site.name: 1 for site in native.sites.values()})
    for index, (root, scale, step) in enumerate(
        zip(seen.roots, seen.scales, seen.steps, strict=True)
    ):
        assert root["timestep"] == scale["timestep"] == step["timestep"] == schedule.grid[index]
        assert step["sigma"] == scale["sigma"] == schedule.sigmas[index]
        assert step["nextSigma"] == schedule.sigmas[index + 1]
        assert all(step[key] for key in ("literalEuler", "cfgAssociation", "previousAssociation"))
        assert scale["literalScale"] and step["sChurn"] == 0.0
        assert step["batch"] == scale["input"] and scale["output"] == root["sample"]
        assert root["sampleShape"] == [2, 4, 128, 128]
        assert root["sampleDtype"] == "torch.float16" and root["sampleDevice"] == "cuda:0"
        assert root["timeDtype"] == "torch.float32" and root["timeDevice"] == "cuda:0"
        assert root["timeShape"] == []
        assert all(root[key] == expected[key] for key in ("context", "pools", "timeIds"))
        rows = [row for row in seen.sites if row["step"] == index + 1]
        assert Counter(row["site"] for row in rows) == names
        for row in rows:
            assert row["original"] and row["sdpaCalls"] == 1
            assert row["context"] == expected["context"]
            assert row["heads"] == (10 if row["factor"] == 2 else 20)
            assert row["queries"] == (128 // row["factor"]) ** 2 and row["keys"] == expected["keys"]
            for key in ("processorMask", "sdpaMask"):
                mask = row[key]
                assert mask["matches"] and mask["headsIdentical"], (
                    f"positive regional mask association differs after PNG publication: "
                    f"{row['site']} step {index + 1} {key}"
                )
                assert mask["firstHead"] == expected["masks"][str(row["factor"])]
                assert mask["none"] == (case.variant == "baseline")
            assert row["qkvMatches"] == [True, True, True]
            assert row["nativePolicy"] == {
                "dtype": True,
                "device": True,
                "dropout": 0.0,
                "causal": False,
                "scale": None,
            }
    decode = seen.decodes[0]
    assert decode["reserved"] and decode["regionalInstalled"] and decode["lastSampleAssociation"]
    assert decode["shape"] == [1, 4, 128, 128]


def _expected(settings: Any, name: str) -> Any:
    template, pinned = (
        os.environ.get(PREFIX + "EXPECTED"),
        os.environ.get(PREFIX + "EXPECTED_SHA256"),
    )
    assert template and pinned, "pinned previous GREEN EXPECTED and EXPECTED_SHA256 are required"
    binary = Path(template.format(case=name)).read_bytes()
    digest = json.loads(pinned)[name] if pinned.startswith("{") else pinned
    assert _sha(binary) == digest
    record = json.loads(binary)
    if "cases" in record:
        record = record["cases"][name]
    assert record["schema"] == SCHEMA and record["status"] == "passed" and record["case"] == name
    assert record["mechanicalStatus"] == "passed" and record["visualStatus"] == "pending"
    assert record["actualPublicationCompleted"] is True
    assert record["sourceStateStorageGraphTokenizersRngReservationsPreserved"] is True
    assert record["assembly"]["originalCallSlotsRestored"] is True
    assert record["recipeFileSha256"] == settings.sha256
    assert record["experimentContractSha256"] == CONTRACT_SHA and record["base"] == BASE
    assert record["checkpointSha256"] == trained.SOURCE_SHA
    assert record["checkpointBytes"] == trained.SOURCE_BYTES
    assert record["loadingJournalSourceSha256"] == JOURNAL_SHA
    assert record["sourceSha256"].keys() == settings.sources.keys()
    changed = {
        path for path, digest in settings.sources.items() if record["sourceSha256"][path] != digest
    }
    assert changed == ({ADAPTER} if settings.mutation else set()), (
        "only adapter mutation may differ"
    )
    return record


def _compare(native: Any, name: str, report: Any) -> None:
    settings = native.main
    primary = "seed123-assignment" if name == REPEAT else name
    pinned = (
        settings.pinned[primary] if settings.mode == "verify" else settings.records.get(primary)
    )
    if pinned is None or (settings.mode == "record" and name != REPEAT):
        return
    _equal(report["frameworkSourceSha256"], pinned["frameworkSourceSha256"], "native source drift")
    comparison = {
        "predictionsSame": report["predictions"] == pinned["predictions"],
        "nativeImageSame": report["nativeImage"] == pinned["nativeImage"],
        "reopenedRgbSame": report["rgb"] == pinned["rgb"],
    }
    report["pinnedComparison"] = comparison
    if settings.mutation and primary == "seed123-assignment":
        assert not comparison["predictionsSame"] and not comparison["reopenedRgbSame"], (
            "association mutation did not reach actual native predictions and published RGB"
        )
        # Literal permission assertion still runs below and must produce semantic RED.
        return
    for key in EXACT_FIELDS:
        _equal(report[key], pinned[key], f"actual {key} differs from pinned GREEN")
    if primary == "seed123-baseline":
        ordinary = pinned["ordinary"]
        assert ordinary["allPtExact"] and ordinary["allReopenedRgbExact"]
        assert report["nativeImage"] == ordinary["nativeImage"] and report["rgb"] == ordinary["rgb"]
        report["ordinary"] = dict(ordinary)
        report["ordinaryExecuted"] = False
        report["ordinaryPinnedVerification"] = ordinary


def _header(settings: Any, name: str) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "status": "incomplete",
        "mechanicalStatus": "incomplete",
        "visualStatus": "pending",
        "case": name,
        "selector": name,
        "base": BASE,
        "experimentContractSha256": CONTRACT_SHA,
        "checkpointSha256": trained.SOURCE_SHA,
        "checkpointBytes": trained.SOURCE_BYTES,
        "loadingJournalSourceSha256": JOURNAL_SHA,
        "recipeFile": str(settings.path),
        "recipeFileSha256": settings.sha256,
        "sourceSha256": settings.sources,
        "mainSourcePins": settings.data["sourcePins"],
        "mainCheckpointResolution": settings.resolved,
        "mode": settings.mode,
        "mutation": settings.mutation,
        "bbox": BBOX,
        "latent": [128, 128],
        "limits": [
            "mechanical worker PNG only",
            "visual evaluation pending",
            "ROOT owns 12G/swap0/600s/.75 envelope",
            "Main durability is producer evidence",
            "no public admission or PP-001/007/008 readiness",
        ],
    }


def _finish(settings: Any, name: str, report: Any, started: float) -> None:
    report["elapsedSeconds"] = time.monotonic() - started
    report["processPeakRssBytes"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024
    with (RUN / f"{settings.label}-{name}.json").open("x") as stream:
        json.dump(report, stream, indent=2)
        stream.write("\n")


def _run_case(native: Any, name: str, monkeypatch: Any) -> Any:
    settings, started = native.main, time.monotonic()
    report = _header(settings, name)
    report["frameworkSourceSha256"] = native.framework_sources
    case = text = seen = assembly = None
    native.torch.cuda.reset_peak_memory_stats(0)
    try:
        primary = "seed123-assignment" if name == REPEAT else name
        if settings.mode == "verify":
            settings.pinned[primary] = _expected(settings, primary)
        case = _case(native, name)
        report.update(
            variant=case.variant,
            seed=case.command.seed,
            steps=30,
            denoisingProfile=case.args["denoising_profile"],
            callerNoisePolicy=dataclasses.asdict(case.command.noise_profile),
            outputPath=str(case.command.output_path),
            nativeCalls=1,
        )
        recipe_before, command_before, target_before = (
            copy.deepcopy(case.recipe),
            copy.deepcopy(case.command),
            case.target.read_bytes(),
        )
        try:
            with _original_preserved(native, report):
                try:
                    with _original_observers(native, case, monkeypatch) as observations:
                        text, seen, assembly = observations
                        receipt = native.output.generate_current_canvas_regional_txt2img(
                            case.recipe, command=case.command, **case.args
                        )
                    sampling._raw(native, text, seen, report)
                    sampling._png(native, case, seen, receipt, report)
                    report["actualPublicationCompleted"] = True
                    report["publicationBeforeSemanticAssertions"] = True
                    _assert_text(native, case, text, assembly, report)
                    # Compare real downstream observables before the mutation's mask oracle fires.
                    report["literalTimeline"] = vars(sampling._literal_schedule(native, case))
                    _compare(native, name, report)
                    _assert_native(native, case, seen, report)
                    if name == "seed123-baseline" and settings.mode == "record":
                        report["nativeCalls"] = 2
                        report["ordinaryExecuted"] = True
                        sampling._ordinary(native, case, seen.result, report)
                finally:
                    # The original preservation scope checks values/storage/hooks/RNG even on RED.
                    _equal(case.recipe, recipe_before, "complete Main recipe mutated")
                    assert case.command == command_before
                    _equal(case.target.read_bytes(), target_before, "local target mutated")
        finally:
            _inputs_unchanged(settings)
            _equal(_framework_sources(native), native.framework_sources, "native source changed")
        assert time.monotonic() - started < 600, "ROOT unit deadline exceeded"
        report.update(
            status="passed",
            mechanicalStatus="passed",
            outcome="mechanical passed, visual evaluation pending",
        )
        settings.records[name] = report
        return report
    except BaseException as error:
        report.update(
            status="failed",
            mechanicalStatus="failed",
            failure={"type": type(error).__name__, "message": str(error)[:1200]},
        )
        raise
    finally:
        try:
            sampling._raw(native, text, seen, report)
            if assembly is not None:
                report["assembly"] = cast(dict[str, Any], vars(assembly)).copy()
            native.torch.cuda.synchronize(0)
            report["cudaPeakAllocatedBytes"] = native.torch.cuda.max_memory_allocated(0)
            report["cudaPeakReservedBytes"] = native.torch.cuda.max_memory_reserved(0)
        finally:
            _finish(settings, name, report, started)
        if text is not None:
            cast(dict[str, Any], vars(text)).clear()
        if seen is not None:
            cast(dict[str, Any], vars(seen)).clear()
        case = text = seen = assembly = None
        gc.collect()


@pytest.mark.parametrize("name", CASES)
def test_natural_text_visual_matrix(visual: Any, monkeypatch: Any, name: str) -> None:
    _run_case(visual, name, monkeypatch)


def test_natural_text_assignment_repeat(visual: Any, monkeypatch: Any) -> None:
    settings = visual.main
    assert settings.mutation is None
    assert settings.mode == "verify" or "seed123-assignment" in settings.records, (
        "record repeat requires earlier assignment123 in this module; "
        "separate units use pinned EXPECTED in verify mode"
    )
    _run_case(visual, REPEAT, monkeypatch)


def test_natural_text_recorded_matrix(settings: Any) -> None:
    """No ML: join six primaries and exact repeat, including separate pinned units."""
    started, report = time.monotonic(), _header(settings, "recorded-matrix")
    try:
        assert settings.mutation is None
        if settings.mode == "verify":
            records = {name: _expected(settings, name) for name in (*CASES, REPEAT)}
        else:
            # Optional record aggregation can also read explicitly pinned per-case GREEN files.
            records = dict(settings.records)
            for name in (*CASES, REPEAT):
                if name not in records:
                    records[name] = _expected(settings, name)
        assert set((*CASES, REPEAT)).issubset(records)
        for name, row in records.items():
            assert row["status"] == "passed" and row["visualStatus"] == "pending"
            assert row["recipeFileSha256"] == settings.sha256
            _equal(row["sourceSha256"], settings.sources, f"aggregate source drift: {name}")
        base = records["seed123-assignment"]
        for key in EXACT_FIELDS:
            _equal(records[REPEAT][key], base[key], f"same-seed repeat differs: {key}")
        global_stream = records["seed123-baseline"]["expected"]["streams"][0]
        for seed in (123, 124):
            baseline, assignment, swapped = (
                records[f"seed{seed}-{variant}"]
                for variant in ("baseline", "assignment", "swapped")
            )
            a, b = assignment["expected"], swapped["expected"]
            assert a["masks"] == b["masks"] and a["pools"] == b["pools"]
            assert a["pools"] == baseline["expected"]["pools"]
            assert a["streams"][0] == b["streams"][0] == global_stream
            assert a["streams"][1] == b["streams"][2]
            assert a["streams"][2] == b["streams"][1]
            assert a["streams"][1]["positive"] != a["streams"][2]["positive"]
            assert a["context"] != b["context"]
            assert assignment["steps"][0]["sample"] == swapped["steps"][0]["sample"]
            assert assignment["steps"][0]["sample"] == baseline["steps"][0]["sample"]
            assert assignment["predictions"] != swapped["predictions"]
            assert assignment["rgb"] != swapped["rgb"]
        for variant in ("baseline", "assignment", "swapped"):
            a, b = records[f"seed123-{variant}"], records[f"seed124-{variant}"]
            assert a["expected"] == b["expected"]
            assert a["steps"][0]["sample"] != b["steps"][0]["sample"]
        ordinary = records["seed123-baseline"]["ordinary"]
        assert ordinary["allPtExact"] and ordinary["allReopenedRgbExact"]
        report.update(
            status="passed",
            mechanicalStatus="passed",
            primaryCases=6,
            repeatCases=1,
            newNativeRequests=0,
            modelLoads=0,
            outcome="mechanical passed, visual evaluation pending",
            cases=records,
        )
    except BaseException as error:
        report.update(
            status="failed",
            mechanicalStatus="failed",
            failure={"type": type(error).__name__, "message": str(error)[:1200]},
        )
        raise
    finally:
        _finish(settings, "recorded-matrix", report, started)
