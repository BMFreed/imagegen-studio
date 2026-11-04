"""ROOT-only global text-bank comparison with an invariant genuine pooled carrier.

The independent Main validator consumes eight complete saved/reopened recipes:
two seeds, assigned/swapped owner texts, and full/scene-only global text. Every
recipe has the same third enabled empty-mask owner carrying the original full
global prompt. Its positive pool is selected in BOTH conditions; its text keys
are never permitted. Four 77-row streams give K=308. This changes the bank size
from historical K=231, so no historical-output numerical equivalence is claimed.

IGS_REGIONAL_COMPOSITION_RUN must equal RUN. MODE=record|verify, LABEL is fresh
ASCII <=64. CONTRACT_SHA256 pins experiment-contract.json; MAIN_SHA256 separately
pins the produced Main JSON. QUALIFICATION_SHA256 pins qualification-r1.manifest.json,
which independently freezes this harness and the genuine Main producer.
EXPECTED (optional {case}) and EXPECTED_SHA256
(scalar or JSON case:digest map) pin own healthy records before a verify call.
MUTATION=ignored-global-text is verify-only: forward the corresponding complete
full-global Main recipe and matching command for an intended scene-only case.
The literal intended-text oracle must become RED AFTER real PNG publication;
the neighboring full-global call remains unaffected. This test-call forwarding
fault is neither a production defect nor a source-mutation qualification.

Eight matrix requests, one exact repeat, and four fault/control/restored requests
are thirteen actual native calls at most. Aggregate checks load no models. The
existing production loader/journal/native loop/output and original processors
are reused, with per-case restoration and independently quantized reopened PNG.
All thirty original UNet inputs additionally capture bounded [2,1280] FP16 pool
rows (153,600 bytes), released after serialization. No model/table clones or
complete attention tensors are retained. Mechanical PASS leaves visual pending.

Author checks are AST/Ruff only. ROOT owns target imports, strict typing, serial
12 GiB / swap0 / 600 s / CUDA allocator .75 execution and lifecycle/cleanup.
Public admission, product defaults, Anima, provenance and PP-001/007/008 remain
outside this private experiment.
"""

from __future__ import annotations

import copy
import dataclasses
import gc
import inspect
import json
import os
import re
import time
from collections import Counter
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from functools import wraps
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest

import test_illustrious_regional_visual_acceptance as _visual_helpers

old: Any = cast(Any, _visual_helpers)
RUN = (
    Path.home()
    / ".codex/artifacts/imagegen-studio/runs/regional-guidance-composition/20261031-scene-bank"
)
BASE = "2ae588d7911ae611790c7264ef832fdbd9d7e2b6"
SELF = Path(__file__).resolve()
PREFIX = "IGS_REGIONAL_COMPOSITION_"
SCHEMA = "regional-global-text-composition-v1"
FULL: str = old.GLOBAL
SCENE = "a still life on a plain table, two separate objects, soft studio lighting"
CASES = tuple(
    f"seed{seed}-{association}-global-{global_text}"
    for seed in (123, 124)
    for association in ("assignment", "swapped")
    for global_text in ("full", "scene")
)
TARGET = "seed123-assignment-global-scene"
CONTROL = "seed123-assignment-global-full"
REPEAT = TARGET + "-repeat"
_legacy_case: Any = old._case
_legacy_inputs: Any = old._inputs_unchanged
_legacy_native_observer: Any = old.sampling._native_observer
_legacy_raw: Any = old.sampling._raw


def _identity(name: str) -> tuple[str, str, str]:
    primary = TARGET if name == REPEAT else name
    assert primary in CASES, "unknown finite composition case"
    seed, association, marker, global_text = primary.split("-")
    assert marker == "global"
    return seed, association, global_text


def _global_text(choice: str) -> str:
    assert choice in ("full", "scene")
    return FULL if choice == "full" else SCENE


def _witness(document: Any, recipe: Any) -> tuple[Any, Any]:
    """Detached comparison only; never submit a reconstructed recipe."""
    d, r = copy.deepcopy(document), copy.deepcopy(recipe)
    d.pop("documentRevision")
    d["generationDraft"]["seed"]["value"] = "<seed>"
    d["generationDraft"]["positivePrompt"]["text"] = "<global-text>"
    r.pop("documentRevision")
    r["item"]["seed"] = "<seed>"
    r["item"]["prompts"]["positive"] = "<global-text>"
    r["globalPrompts"]["positive"]["text"] = "<global-text>"
    for index in range(2):
        d["regionalGuidance"][index]["prompts"]["positive"]["text"] = "<association>"
        r["regions"][index]["positive"]["text"] = "<association>"
        if "authoredPrompts" in r["regions"][index]:
            r["regions"][index]["authoredPrompts"]["positive"]["text"] = "<association>"
    return d, r


@pytest.fixture(scope="module")
def composition_settings() -> Any:
    requested = os.environ.get(PREFIX + "RUN")
    if requested is None:
        pytest.skip("ROOT opt-in: IGS_REGIONAL_COMPOSITION_RUN=<exact RUN>")
    assert requested == str(RUN)
    label, mode = os.environ.get(PREFIX + "LABEL", ""), os.environ.get(PREFIX + "MODE")
    assert re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", label)
    assert mode in ("record", "verify")
    mutation = os.environ.get(PREFIX + "MUTATION")
    assert mutation in (None, "ignored-global-text")
    assert mutation is None or mode == "verify", "a fault cannot write healthy gold"
    contract_raw = (RUN / "experiment-contract.json").read_bytes()
    contract_sha = os.environ.get(PREFIX + "CONTRACT_SHA256", "")
    assert re.fullmatch(r"[0-9a-f]{64}", contract_sha)
    assert old._sha(contract_raw) == contract_sha
    contract = json.loads(contract_raw)
    fixed = {
        "schema": "regional-composition-experiment-v1",
        "base": BASE,
        "cfg": 5,
        "checkpointSha256": old.trained.SOURCE_SHA,
        "fixedBeforeNativeExecution": True,
        "geometry": old.BBOX,
        "globalCoverage": (
            "Everywhere for both signs, explicit experiment input, not product default"
        ),
        "globalNegative": "",
        "globalPositiveFull": FULL,
        "globalPositiveScene": SCENE,
        "layout": "cfg-negative-first",
        "leftPrompt": old.LEFT,
        "pooledSources": (
            "negative=current-canvas; positive=third enabled empty-mask carrier "
            "with original full global text"
        ),
        "prediction": "epsilon",
        "regionalNegative": "explicit local empty",
        "rightPrompt": old.RIGHT,
        "sampler": "euler",
        "seeds": [123, 124],
        "steps": 30,
        "variants": ["assignment", "swapped"],
        "globalConditions": ["full", "scene"],
    }
    for key, value in fixed.items():
        old._equal(contract[key], value, f"fixed composition contract differs: {key}")
    harness_sha = old._sha(SELF.read_bytes())
    qualification_raw = (RUN / "qualification-r1.manifest.json").read_bytes()
    qualification_sha = os.environ.get(PREFIX + "QUALIFICATION_SHA256", "")
    assert re.fullmatch(r"[0-9a-f]{64}", qualification_sha)
    assert old._sha(qualification_raw) == qualification_sha
    qualification = json.loads(qualification_raw)
    assert qualification["base"] == BASE
    own_path = "worker-python/tests/test_regional_guidance_composition.py"
    assert qualification["files"][own_path]["sha256"] == harness_sha
    producer = "src/main/projects/test-fixtures/regional-guidance-composition-probe.ts"
    assert qualification["files"][producer]["sha256"] == old._sha(
        (old.trained.REPO / producer).read_bytes()
    )
    path = Path(
        os.environ.get(PREFIX + "MAIN", str(RUN / "main-composition/main-composition-recipes.json"))
    )
    assert path.is_absolute() and path.resolve() == path
    raw = path.read_bytes()
    main_sha = os.environ.get(PREFIX + "MAIN_SHA256", "")
    assert re.fullmatch(r"[0-9a-f]{64}", main_sha)
    assert old._sha(raw) == main_sha
    data: Any = old.trained._transport(json.loads(raw))
    assert data["schema"] == "main-regional-composition-v1" and data["base"] == BASE
    assert data["experimentContractSha256"] == contract_sha
    assert data["exactResources"] == {} and data["sourcePins"]
    variants, checkpoint = data["variants"], data["checkpoint"]
    assert set(variants) == set(CASES)
    reference, resolved = checkpoint["reference"], checkpoint["resolved"]
    assert checkpoint["sha256"] == reference["fileSha256"] == old.trained.SOURCE_SHA
    assert checkpoint["byteSize"] == old.trained.SOURCE_BYTES
    assert checkpoint["sourcePath"] == resolved["managedPath"] == str(old.trained.SOURCE)
    assert (
        reference["baseModelFamily"] == "illustrious" and reference["predictionType"] == "epsilon"
    )
    assert set(resolved) == {"managedPath", "reference", "noiseProfile"}
    assert resolved["reference"] == reference and resolved["noiseProfile"] == old.sampling.POLICY
    baseline = json.loads((RUN / "baseline-source.manifest.json").read_bytes())
    assert baseline["base"] == BASE
    for source, digest in data["sourcePins"].items():
        if source in baseline["files"]:
            assert baseline["files"][source]["sha256"] == digest, f"Main source drift: {source}"
        else:
            assert source == producer
            assert qualification["files"][producer]["sha256"] == digest
            assert old._sha((old.trained.REPO / source).read_bytes()) == digest
    witness = assets = None
    targets: dict[str, Any] = {}
    halves = (bytes([255]) * 512 + bytes(512), bytes(512) + bytes([255]) * 512)
    revisions: set[str] = set()
    for name in CASES:
        seed, association, choice = _identity(name)
        global_text = _global_text(choice)
        row = variants[name]
        recipe, target, document = row["recipe"], row["targetMode"], row["authoredDocument"]
        assert row["checkpointResolution"] == resolved and row["durableUnchanged"] is True
        assert re.fullmatch(r"[0-9a-f]{64}", row["durableStateSha256"])
        assert (
            recipe["kind"] == "current-canvas-regional-recipe" and recipe["family"] == "illustrious"
        )
        assert recipe["bbox"] == target["bbox"] == document["primaryBbox"] == old.BBOX
        assert target["mode"] == "txt2img" and target["alphaClassification"] == "all-zero"
        for key in ("documentId", "documentRevision"):
            assert recipe[key] == target[key] == document[key]
        revisions.add(document["documentRevision"])
        assert recipe["item"]["seed"] == int(seed[4:])
        assert recipe["item"]["prompts"] == {"positive": global_text, "negative": ""}
        assert recipe["globalPrompts"] == {
            "positive": {"text": global_text, "embeddingRefs": []},
            "negative": {"text": "", "embeddingRefs": []},
        }
        assert recipe["globalEmbeddings"] == {"positive": [], "negative": []}
        draft = document["generationDraft"]
        assert draft["positivePrompt"] == recipe["globalPrompts"]["positive"]
        assert draft["negativePrompt"] == recipe["globalPrompts"]["negative"]
        assert draft["model"] == reference and draft["loras"] == [] and draft["vae"] is None
        assert draft["seed"] == {"policy": "fixed", "value": int(seed[4:])}
        assert draft["sampling"] == {
            "cfgScale": 5,
            "denoisingStrength": None,
            "sampler": "Euler",
            "scheduler": "Normal",
            "steps": 30,
        }
        assert draft.get("cfgRescale", 0) == 0 and draft["vaePrecision"] == "FP16"
        assert "dynamicPrompt" not in draft
        authored, regions = document["regionalGuidance"], recipe["regions"]
        assert len(authored) == len(regions) == 3
        texts = ([old.RIGHT, old.LEFT] if association == "swapped" else [old.LEFT, old.RIGHT]) + [
            FULL
        ]
        identities: list[str] = []
        for index, (owner, region, literal) in enumerate(
            zip(authored, regions, texts, strict=True)
        ):
            assert owner["enabled"] is True and owner["locked"] is False
            assert owner["overlayOpacity"] == 0
            assert owner["prompts"] == {
                "positive": {"text": literal, "embeddingRefs": []},
                "negative": {"text": "", "embeddingRefs": []},
                "useGlobalNegativePrompt": False,
            }
            assert not owner.get("referenceImages", []) and not region.get("referenceImages", [])
            assert region["regionId"] == owner["id"] and region["maskId"] == owner["mask"]["id"]
            assert region["maskRevision"] == owner["mask"]["revision"]
            assert region["positive"] == {"text": literal, "embeddingRefs": []}
            assert region["negative"] == {
                "source": "regional",
                "prompt": {"text": "", "embeddingRefs": []},
            }
            assert region["embeddings"] == {"positive": [], "negative": []}
            if "authoredPrompts" in region:
                assert region["authoredPrompts"] == owner["prompts"]
            identities.extend((owner["id"], owner["mask"]["id"]))
            coverage = region["coverage"]
            assert coverage["bounds"] == old.BBOX
            if index < 2:
                assert coverage["kind"] == "covered"
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
                assert owner["mask"]["revision"] == 1 and owner["mask"]["asset"] is not None
                old._equal(coverage["alpha"], halves[index] * 1024, "literal whole half differs")
            else:
                assert set(owner["mask"]) == {"asset", "id", "revision"}
                assert owner["mask"]["asset"] is None and owner["mask"]["revision"] == 0
                assert coverage["kind"] == "empty" and coverage["intersection"] is None
                old._equal(coverage["alpha"], bytes(1024 * 1024), "carrier coverage is not empty")
        assert len(set(identities)) == 6 and "current-canvas" not in identities
        current_witness = _witness(document, recipe)
        if witness is None:
            witness = current_witness
            assets = row["captureAssetDescriptors"]
        old._equal(
            current_witness, witness, "Main data differs outside seed/association/global text"
        )
        old._equal(row["captureAssetDescriptors"], assets, "actual captured masks changed")
        assert len(row["captureAssetDescriptors"]) == 2
        relative = Path(target["relativePng"])
        assert not relative.is_absolute() and relative.parts[0] == "targets"
        assert ".." not in relative.parts and relative.suffix == ".png"
        source = path.parent / relative
        binary = source.read_bytes()
        assert len(binary) == target["byteSize"] and old._sha(binary) == target["sha256"]
        targets[name] = (source, binary)
    assert len(revisions) == 8
    carrier = variants[CASES[0]]["recipe"]["regions"][2]
    assert data["fixedPooledCarrier"] == {
        "index": 2,
        "maskId": carrier["maskId"],
        "regionId": carrier["regionId"],
        "text": FULL,
    }
    assert data["globalPositives"] == {"full": FULL, "scene": SCENE}
    first_target = targets[CASES[0]][1]
    assert all(binary == first_target for _, binary in targets.values())
    sources = old.trained._source_map()
    for source, digest in sources.items():
        assert baseline["files"][source]["sha256"] == digest, (
            f"regional owner/helper drift: {source}"
        )
    result = SimpleNamespace(
        path=path,
        raw=raw,
        data=data,
        variants=variants,
        resolved=resolved,
        reference=reference,
        bbox=old.BBOX,
        latent=(128, 128),
        sha256=main_sha,
        label=label,
        mode=mode,
        mutation=mutation,
        sources=sources,
        records={},
        targets=targets,
        contract_raw=contract_raw,
        contract=contract,
        contract_sha=contract_sha,
        harness_sha=harness_sha,
        qualification_raw=qualification_raw,
        qualification_sha=qualification_sha,
        pinned={},
        expected=os.environ.get(PREFIX + "EXPECTED"),
        expected_sha=os.environ.get(PREFIX + "EXPECTED_SHA256"),
    )
    if mode == "verify":
        assert result.expected and result.expected_sha
    return result


def _inputs_unchanged(settings: Any) -> None:
    _legacy_inputs(settings)
    assert old._sha(SELF.read_bytes()) == settings.harness_sha, "composition harness changed"
    old._equal(
        (RUN / "qualification-r1.manifest.json").read_bytes(),
        settings.qualification_raw,
        "qualification manifest changed",
    )
    for source, digest in settings.data["sourcePins"].items():
        assert old._sha((old.trained.REPO / source).read_bytes()) == digest, (
            f"Main source changed: {source}"
        )


def _case(native: Any, name: str) -> Any:
    settings = native.main
    _, association, choice = _identity(name)
    primary = TARGET if name == REPEAT else name
    label = settings.label
    settings.label = label[:32] + "-" + old._sha(f"{label}:{name}".encode())[:16]
    try:
        case = _legacy_case(native, primary)
    finally:
        settings.label = label
    case.variant, case.global_choice = association, choice
    case.args["positive_pooled_source_id"] = case.recipe["regions"][2]["regionId"]
    assert case.args["negative_pooled_source_id"] == "current-canvas"
    case.effective_name, case.effective_recipe, case.effective_command = (
        primary,
        case.recipe,
        case.command,
    )
    if settings.mutation and choice == "scene":
        effective_name = primary.removesuffix("scene") + "full"
        effective = settings.variants[effective_name]
        assert (
            effective["targetMode"]["sha256"] == settings.variants[primary]["targetMode"]["sha256"]
        )
        assert effective["recipe"]["item"]["seed"] == case.command.seed
        case.effective_name, case.effective_recipe = effective_name, effective["recipe"]
        case.effective_command = dataclasses.replace(case.command, positive_prompt=FULL)
        old._equal(
            case.effective_recipe["regions"],
            case.recipe["regions"],
            "forwarding fault changed regional/carrier recipe data",
        )
        assert case.effective_recipe["bbox"] == case.recipe["bbox"]
    return case


def _permissions(native: Any, case: Any, factor: int) -> Any:
    """Literal global + half-owner permissions; the carrier has no eligible key."""
    torch = native.torch
    side = 128 // factor
    allowed = torch.zeros(2, side * side, 308, dtype=torch.bool)
    allowed[:, :, :77] = True
    x = torch.arange(side).repeat(side)
    allowed[:, :, 77:154] = (x < side // 2)[None, :, None]
    allowed[:, :, 154:231] = (x >= side // 2)[None, :, None]
    assert torch.count_nonzero(allowed[:, :, 231:]) == 0
    return allowed.to("cuda:0")


@contextmanager
def _native_observer(native: Any, case: Any, monkeypatch: Any) -> Generator[Any, None, None]:
    with _legacy_native_observer(native, case, monkeypatch) as seen:
        owner: Any = cast(Any, type(native.pipeline.unet))
        forward = owner.forward
        signature = inspect.signature(forward)
        seen.pool_rows = cast(list[Any], [])
        native.composition_pool_rows = seen.pool_rows

        @wraps(forward)
        def consumed(current: Any, *args: Any, **kwargs: Any) -> Any:
            if current is native.pipeline.unet:
                values = signature.bind(current, *args, **kwargs).arguments
                pools = values["added_cond_kwargs"]["text_embeds"]
                assert tuple(pools.shape) == (2, 1280)
                assert pools.dtype == native.torch.float16 and pools.device == native.torch.device(
                    "cuda:0"
                )
                assert len(seen.pool_rows) < 30
                seen.pool_rows.append(pools.detach().clone())
            return forward(current, *args, **kwargs)

        with monkeypatch.context() as patch:
            patch.setattr(owner, "forward", consumed)
            yield seen


def _raw(native: Any, text: Any, seen: Any, report: Any) -> None:
    _legacy_raw(native, text, seen, report)
    if seen is None or not hasattr(seen, "pool_rows"):
        return
    selection = report.get("poolSelection", {})
    rows: list[dict[str, Any]] = []
    for index, values in enumerate(seen.pool_rows, 1):
        row = {
            "step": index,
            "combined": old._hash(native, values),
            "negative": old._hash(native, values[:1]),
            "positive": old._hash(native, values[1:]),
        }
        if selection:
            row.update(
                negativeHashMatchesExpected=row["negative"] == selection["expectedNegative"],
                positiveHashMatchesExpected=row["positive"] == selection["expectedPositive"],
            )
        rows.append(row)
    report["nativePooledRows"] = rows
    if text is not None:
        report["actualSignedStreams"] = [
            {
                "positiveText": row.parameters.positive_prompt,
                "negativeText": row.parameters.negative_prompt,
                **{field: old._hash(native, getattr(row.result, field)) for field in old.FIELDS},
            }
            for row in text.pairs
        ]


def _assert_text(native: Any, case: Any, text: Any, assembly: Any, report: Any) -> Any:
    """Derive all four pairs from fixed intended literals, never forwarded input."""
    torch, p = native.torch, native.pipeline
    literals = (
        [_global_text(case.global_choice)]
        + ([old.RIGHT, old.LEFT] if case.variant == "swapped" else [old.LEFT, old.RIGHT])
        + [FULL]
    )
    pairs = [old._literal_pair(native, literal) for literal in literals]
    context = torch.cat(
        (torch.cat([pair[1] for pair in pairs], 1), torch.cat([pair[0] for pair in pairs], 1))
    )
    negative_pool, positive_pool = pairs[0][3], pairs[3][2]
    pools = torch.cat((negative_pool, positive_pool))
    times = torch.tensor(
        [[1024, 1024, 0, 0, 1024, 1024]], device="cuda:0", dtype=torch.float16
    ).repeat(2, 1)
    report["assembly"] = cast(dict[str, Any], vars(assembly)).copy()
    report["expected"] = {
        "context": old._hash(native, context),
        "pools": old._hash(native, pools),
        "timeIds": old._hash(native, times),
        "masks": {str(f): old._hash(native, _permissions(native, case, f)) for f in (2, 4)},
        "streams": [
            {field: old._hash(native, value) for field, value in zip(old.FIELDS, pair, strict=True)}
            for pair in pairs
        ],
        "sourceTexts": literals,
        "negativeTexts": [""] * 4,
        "negativeAllZero": True,
        "rowsPerStream": 77,
        "tailPaddingRows": 0,
        "keys": 308,
    }
    report["poolSelection"] = {
        "index": 3,
        "intendedSourceId": case.recipe["regions"][2]["regionId"],
        "effectiveSourceId": case.args["positive_pooled_source_id"],
        "carrierText": FULL,
        "carrierHasNoPermittedKeys": True,
        "expectedNegative": old._hash(native, negative_pool),
        "expectedPositive": old._hash(native, positive_pool),
        "literalValuesEqualPerStep": [
            {
                "negative": torch.equal(row[:1], negative_pool),
                "positive": torch.equal(row[1:], positive_pool),
            }
            for row in native.composition_pool_rows
        ],
    }
    assert torch.count_nonzero(context[0]) == torch.count_nonzero(negative_pool) == 0
    assert len(text.pairs) == len(pairs) == 4
    for index, (actual, literal, expected) in enumerate(
        zip(text.pairs, literals, pairs, strict=True)
    ):
        assert actual.pipeline is p
        assert (
            actual.parameters.positive_prompt == literal and actual.parameters.negative_prompt == ""
        ), (
            "global text differs after PNG publication (literal conditioning)"
            if index == 0
            else "regional or carrier text differs after PNG publication"
        )
        assert actual.inputs.prompts == (literal, "") and actual.inputs.managers == (None, None)
        for field, value in zip(old.FIELDS, expected, strict=True):
            assert torch.equal(getattr(actual.result, field), value), (
                f"literal stream {index} {field} differs"
            )
        assert actual.result.positive_length == actual.result.negative_length == 77
    assert text.plans == [None] and not text.loads and text.resizes == 0
    assert Counter(id(row.encoder) for row in text.encoder_calls) == Counter(
        {id(p.text_encoder): 4, id(p.text_encoder_2): 8}
    )
    assert all(not row.alias_ids and row.rows.numel() == 0 for row in text.encoder_calls)
    bindings = [
        [identity, 77]
        for identity in [
            "current-canvas",
            *(region["regionId"] for region in case.recipe["regions"]),
        ]
    ]
    assert assembly.encodes == [
        {"keys": 308, "negative": bindings, "positive": bindings, "strategy": "shared-readonly"}
    ]
    assert assembly.assemblies == [
        {
            "context": old._hash(native, context),
            "pools": old._hash(native, pools),
            "keys": 308,
            "signs": ["negative", "positive"],
        }
    ]
    rows = report["poolSelection"]["literalValuesEqualPerStep"]
    assert len(rows) == 30 and all(row["negative"] and row["positive"] for row in rows)
    return context


def _expected(settings: Any, name: str) -> Any:
    assert settings.expected and settings.expected_sha, "own pinned healthy record is required"
    raw = Path(settings.expected.format(case=name)).read_bytes()
    digest = (
        json.loads(settings.expected_sha)[name]
        if settings.expected_sha.startswith("{")
        else settings.expected_sha
    )
    assert old._sha(raw) == digest
    row = json.loads(raw)
    if "cases" in row:
        row = row["cases"][name]
    assert row["schema"] == SCHEMA and row["case"] == name and row["base"] == BASE
    assert row["status"] == row["mechanicalStatus"] == "passed" and row["visualStatus"] == "pending"
    assert row["mutation"] is None and row["actualPublicationCompleted"] is True
    assert row["sourceStateStorageGraphTokenizersRngReservationsPreserved"] is True
    assert row["assembly"]["originalCallSlotsRestored"] is True
    assert row["recipeFileSha256"] == settings.sha256
    assert row["experimentContractSha256"] == settings.contract_sha
    assert row["harnessSha256"] == settings.harness_sha
    assert row["qualificationManifestSha256"] == settings.qualification_sha
    assert row["checkpointSha256"] == old.trained.SOURCE_SHA
    assert row["checkpointBytes"] == old.trained.SOURCE_BYTES
    assert row["loadingJournalSourceSha256"] == old.JOURNAL_SHA
    old._equal(row["sourceSha256"], settings.sources, "own healthy source drift")
    return row


def _compare(settings: Any, name: str, report: Any) -> None:
    primary = TARGET if name == REPEAT else name
    pinned = settings.pinned.get(primary)
    if pinned is None and name == REPEAT:
        pinned = settings.records.get(TARGET)
    if pinned is None:
        return
    old._equal(report["frameworkSourceSha256"], pinned["frameworkSourceSha256"], "framework drift")
    report["healthyComparison"] = {
        "predictionsSame": report["predictions"] == pinned["predictions"],
        "nativeImageSame": report["nativeImage"] == pinned["nativeImage"],
        "rgbSame": report["rgb"] == pinned["rgb"],
    }
    for key in (*old.EXACT_FIELDS, "nativePooledRows", "actualSignedStreams", "poolSelection"):
        old._equal(report[key], pinned[key], f"own healthy/restored result differs: {key}")


def _header(settings: Any, name: str) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "status": "incomplete",
        "mechanicalStatus": "incomplete",
        "visualStatus": "pending",
        "case": name,
        "selector": name,
        "base": BASE,
        "experimentContractSha256": settings.contract_sha,
        "harnessSha256": settings.harness_sha,
        "qualificationManifestSha256": settings.qualification_sha,
        "checkpointSha256": old.trained.SOURCE_SHA,
        "checkpointBytes": old.trained.SOURCE_BYTES,
        "loadingJournalSourceSha256": old.JOURNAL_SHA,
        "recipeFile": str(settings.path),
        "recipeFileSha256": settings.sha256,
        "sourceSha256": settings.sources,
        "mainSourcePins": settings.data["sourcePins"],
        "mainCheckpointResolution": settings.resolved,
        "mode": settings.mode,
        "mutation": settings.mutation,
        "bbox": old.BBOX,
        "latent": [128, 128],
        "intendedGlobalChoice": _identity(name)[2] if name != "recorded-matrix" else None,
        "globalTokenSupport": {"negative": "everywhere", "positive": "everywhere"},
        "limits": [
            "mechanical private PNG only",
            "visual pending",
            "K308,carrier keys all masked",
            "no production or public readiness change",
        ],
    }


@pytest.fixture(scope="module")
def composition_native(composition_settings: Any) -> Iterator[Any]:
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(old, "RUN", RUN)
        patch.setattr(old, "_permissions", _permissions)
        patch.setattr(old, "_inputs_unchanged", _inputs_unchanged)
        patch.setattr(old.sampling, "_native_observer", _native_observer)
        iterator = old.visual.__wrapped__(composition_settings)
        native = next(iterator)
        try:
            yield native
        finally:
            try:
                next(iterator)
            except StopIteration:
                pass
            else:
                raise AssertionError("native loader fixture yielded more than once")


def _run_case(native: Any, name: str, monkeypatch: Any) -> Any:
    settings, started = native.main, time.monotonic()
    report = _header(settings, name)
    report["frameworkSourceSha256"] = native.framework_sources
    case = text = seen = assembly = None
    native.composition_pool_rows = cast(list[Any], [])
    native.torch.cuda.reset_peak_memory_stats(0)
    try:
        primary = TARGET if name == REPEAT else name
        if settings.mode == "verify" or (name == REPEAT and TARGET not in settings.records):
            settings.pinned[primary] = _expected(settings, primary)
        report["healthyExpectationVerifiedBeforeNative"] = primary in settings.pinned
        case = _case(native, name)
        report.update(
            variant=case.variant,
            seed=case.command.seed,
            steps=30,
            denoisingProfile=case.args["denoising_profile"],
            callerNoisePolicy=dataclasses.asdict(case.command.noise_profile),
            outputPath=str(case.command.output_path),
            plannedNativeCalls=1,
            intendedInput=primary,
            effectiveInput=case.effective_name,
            intendedDocument={key: case.recipe[key] for key in ("documentId", "documentRevision")},
            effectiveDocument={
                key: case.effective_recipe[key] for key in ("documentId", "documentRevision")
            },
            intendedGlobalText=case.command.positive_prompt,
            effectiveGlobalText=case.effective_command.positive_prompt,
            effectiveTargetSha256=case.effective_command.target_sha256,
        )
        before = copy.deepcopy(
            (case.recipe, case.command, case.effective_recipe, case.effective_command)
        )
        target_before = case.target.read_bytes()
        try:
            with old._original_preserved(native, report):
                try:
                    with old._original_observers(native, case, monkeypatch) as observations:
                        text, seen, assembly = observations
                        receipt = native.output.generate_current_canvas_regional_txt2img(
                            case.effective_recipe, command=case.effective_command, **case.args
                        )
                    _raw(native, text, seen, report)
                    old.sampling._png(native, case, seen, receipt, report)
                    report["actualPublicationCompleted"] = True
                    report["publicationBeforeSemanticAssertions"] = True
                    report["actualNativeCalls"] = len(seen.calls)
                    if settings.mutation and case.global_choice == "scene":
                        healthy = settings.pinned[primary]
                        report["faultComparison"] = {
                            "predictionsSameAsHealthyScene": report["predictions"]
                            == healthy["predictions"],
                            "nativeImageSameAsHealthyScene": report["nativeImage"]
                            == healthy["nativeImage"],
                            "rgbSameAsHealthyScene": report["rgb"] == healthy["rgb"],
                        }
                    _assert_text(native, case, text, assembly, report)
                    report["literalTimeline"] = vars(old.sampling._literal_schedule(native, case))
                    _raw(native, text, seen, report)
                    _compare(settings, name, report)
                    old._assert_native(native, case, seen, report)
                finally:
                    old._equal(
                        (case.recipe, case.command, case.effective_recipe, case.effective_command),
                        before,
                        "complete intended/effective Main inputs mutated",
                    )
                    old._equal(case.target.read_bytes(), target_before, "local target mutated")
        finally:
            _inputs_unchanged(settings)
            old._equal(
                old._framework_sources(native), native.framework_sources, "framework changed"
            )
        assert time.monotonic() - started < 600
        report.update(
            status="passed", mechanicalStatus="passed", outcome="mechanical passed, visual pending"
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
            _raw(native, text, seen, report)
            report["actualNativeCalls"] = 0 if seen is None else len(seen.calls)
            if assembly is not None:
                report["assembly"] = cast(dict[str, Any], vars(assembly)).copy()
            native.torch.cuda.synchronize(0)
            report["cudaPeakAllocatedBytes"] = native.torch.cuda.max_memory_allocated(0)
            report["cudaPeakReservedBytes"] = native.torch.cuda.max_memory_reserved(0)
        finally:
            old._finish(settings, name, report, started)
        if text is not None:
            cast(dict[str, Any], vars(text)).clear()
        if seen is not None:
            cast(dict[str, Any], vars(seen)).clear()
        native.composition_pool_rows.clear()
        del native.composition_pool_rows
        case = text = seen = assembly = None
        gc.collect()


@pytest.mark.parametrize("name", CASES)
def test_composition_matrix(composition_native: Any, monkeypatch: Any, name: str) -> None:
    _run_case(composition_native, name, monkeypatch)


def test_composition_repeat(composition_native: Any, monkeypatch: Any) -> None:
    assert composition_native.main.mutation is None
    _run_case(composition_native, REPEAT, monkeypatch)


def test_composition_recorded_matrix(composition_settings: Any) -> None:
    """No native requests: verify separately pinned records and causal invariants."""
    settings = composition_settings
    assert settings.mutation is None
    records = {
        name: settings.records[name] if name in settings.records else _expected(settings, name)
        for name in (*CASES, REPEAT)
    }
    for seed in (123, 124):
        for association in ("assignment", "swapped"):
            full, scene = (
                records[f"seed{seed}-{association}-global-{choice}"] for choice in ("full", "scene")
            )
            a, b = full["expected"], scene["expected"]
            assert a["keys"] == b["keys"] == 308
            for key in (
                "pools",
                "timeIds",
                "masks",
                "negativeTexts",
                "negativeAllZero",
                "rowsPerStream",
                "tailPaddingRows",
            ):
                old._equal(a[key], b[key], f"global text contrast changed {key}")
            old._equal(
                a["streams"][1:],
                b["streams"][1:],
                "global text contrast changed a regional/carrier pair",
            )
            assert a["streams"][0]["positive"] != b["streams"][0]["positive"]
            assert a["streams"][0]["negative"] == b["streams"][0]["negative"]
            assert a["streams"][0] == a["streams"][3]
            old._equal(full["encodingCounts"], scene["encodingCounts"], "encoding count changed")
            old._equal(full["literalTimeline"], scene["literalTimeline"], "sampling changed")
            old._equal(
                full["nativePooledRows"],
                scene["nativePooledRows"],
                "consumed selected pools changed",
            )
            assert full["steps"][0]["sample"] == scene["steps"][0]["sample"]
        for choice in ("full", "scene"):
            a, b = (
                records[f"seed{seed}-{association}-global-{choice}"]["expected"]
                for association in ("assignment", "swapped")
            )
            assert a["masks"] == b["masks"] and a["pools"] == b["pools"]
            assert a["streams"][0] == b["streams"][0] and a["streams"][3] == b["streams"][3]
            assert a["streams"][1] == b["streams"][2] and a["streams"][2] == b["streams"][1]
    for key in (*old.EXACT_FIELDS, "nativePooledRows", "actualSignedStreams", "poolSelection"):
        old._equal(records[REPEAT][key], records[TARGET][key], f"exact repeat differs: {key}")
    # Record-only selections do not enter the native fixture's RUN scope.
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(old, "RUN", RUN)
        _inputs_unchanged(settings)
