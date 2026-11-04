"""ROOT-only signed positive pooled-source comparison over genuine visual inputs.

Use existing private positive_pooled_source_id only: global, left owner or right
owner. Both token coverages stay Everywhere and the negative pool stays global.
A selected regional positive pool still conditions the whole image; this is not
pool neutralization. No production owner, native diffusion loop, or legacy test
is changed. This filename is outside the legacy source glob and is independently
pinned by pool-contract.json and every record.

IGS_REGIONAL_POOLS_RUN must equal RUN; LABEL is fresh ASCII <=64; MODE is
record|verify; CONTRACT_SHA256 pins pool-contract.json before generation.
EXPECTED (optional {case}) and EXPECTED_SHA256 (scalar or JSON case:digest) pin
own healthy/restored records or a separately executed repeat. MUTATION must be
absent or ignored-positive-pool (verify-only). This controlled test-call fault
forwards current-canvas instead of the intended regional pool. An independent
literal-pool oracle must refuse it after actual PNG publication, with an exact
global control and restoration. This is not production-source mutation evidence.

Nine matrix cases plus one repeat make ten initial native calls. Fault/control
and restored target/control add four. Visual status always remains pending.
The original native observer is supplemented by bounded original-calling UNet
argument capture: 30 x [2,1280] FP16 = 153,600 owned bytes, no model/table snapshot.
Only hashes/booleans are serialized. The reused per-case finally clears captures.
Author validation is AST/Ruff only; ROOT owns all target execution and typing.
"""

from __future__ import annotations

import importlib
import inspect
import json
import os
import re
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
    / ".codex/artifacts/imagegen-studio/runs/regional-guidance-pools/20261031-signed-source"
)
OLD_RUN: Path = old.RUN
BASE = "33c5619caf474879eb77e56a535db4824d9ef087"
SELF = Path(__file__).resolve()
PREFIX = "IGS_REGIONAL_POOLS_"
SCHEMA = "regional-pooled-sources-v1"
MAIN_SHA = "f0af0349fe67b259772b5375da970d2b75c9b02d3ae65b888072af9863d62375"
CASES = ("seed123-assignment-pool-global",) + tuple(
    f"seed{seed}-{variant}-pool-{choice}"
    for seed in (123, 124)
    for variant in ("assignment", "swapped")
    for choice in ("left", "right")
)
REPEAT = "seed123-assignment-pool-left-repeat"
TARGET = "seed123-assignment-pool-left"
PRIMARIES = tuple(
    f"seed{seed}-{variant}" for seed in (123, 124) for variant in ("assignment", "swapped")
)

_legacy_case: Any = old._case
_legacy_header: Any = old._header
_legacy_inputs: Any = old._inputs_unchanged
_legacy_native_observer: Any = old.sampling._native_observer
_legacy_raw: Any = old.sampling._raw


def _identity(name: str) -> tuple[str, str]:
    assert name in (*CASES, REPEAT), "unknown finite pooled-source case"
    primary = "-".join(name.split("-")[:2])
    return primary, "left" if name == REPEAT else name.rsplit("-", 1)[1]


def _source_ids(recipe: Any) -> list[str]:
    assert len(recipe["regions"]) == 2
    return ["current-canvas", *(region["regionId"] for region in recipe["regions"])]


def _pool_index(choice: str) -> int:
    assert choice in ("global", "left", "right")
    return ("global", "left", "right").index(choice)


def _old_record(settings: Any, primary: str) -> Any:
    descriptor = settings.pool.contract["priorRecords"][primary]
    path = Path(descriptor["path"])
    assert path.is_absolute() and path.parent == OLD_RUN and path.suffix == ".json"
    raw = path.read_bytes()
    assert old._sha(raw) == descriptor["sha256"]
    row = json.loads(raw)
    assert row["case"] == primary and row["schema"] == old.SCHEMA
    assert row["status"] == row["mechanicalStatus"] == "passed"
    assert row["visualStatus"] == "pending" and row["actualPublicationCompleted"] is True
    assert row["sourceStateStorageGraphTokenizersRngReservationsPreserved"] is True
    assert row["assembly"]["originalCallSlotsRestored"] is True
    assert row["base"] == old.BASE and row["experimentContractSha256"] == old.CONTRACT_SHA
    assert row["recipeFileSha256"] == settings.sha256 == MAIN_SHA
    assert row["checkpointSha256"] == old.trained.SOURCE_SHA
    assert row["checkpointBytes"] == old.trained.SOURCE_BYTES
    assert row["loadingJournalSourceSha256"] == old.JOURNAL_SHA
    old._equal(row["sourceSha256"], settings.sources, "historical owner/source drift")
    settings.pool.prior_raw[path] = raw
    return row


@pytest.fixture(scope="module")
def pool_settings() -> Any:
    requested = os.environ.get(PREFIX + "RUN")
    if requested is None:
        pytest.skip("ROOT opt-in: IGS_REGIONAL_POOLS_RUN=<exact RUN>")
    assert requested == str(RUN)
    label, mode = os.environ.get(PREFIX + "LABEL", ""), os.environ.get(PREFIX + "MODE")
    assert re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", label)
    assert mode in ("record", "verify")
    mutation = os.environ.get(PREFIX + "MUTATION")
    assert mutation in (None, "ignored-positive-pool")
    assert mutation is None or mode == "verify", "a fault cannot create healthy expected records"
    contract_raw = (RUN / "pool-contract.json").read_bytes()
    contract_sha = os.environ.get(PREFIX + "CONTRACT_SHA256", "")
    assert re.fullmatch(r"[0-9a-f]{64}", contract_sha)
    assert old._sha(contract_raw) == contract_sha
    contract = json.loads(contract_raw)
    assert contract["schema"] == "regional-pooled-source-contract-v1"
    assert contract["base"] == BASE and contract["fixedBeforeNativeExecution"] is True
    assert contract["inheritedContractSha256"] == old.CONTRACT_SHA
    assert contract["mainSha256"] == MAIN_SHA
    assert set(contract["priorRecords"]) == set(PRIMARIES)
    harness_sha = old._sha(SELF.read_bytes())
    assert contract["harnessSha256"] == harness_sha
    # Run the complete existing Main/target/contract/source validators unchanged.
    with pytest.MonkeyPatch.context() as patch:
        patch.setenv(old.PREFIX + "RUN", str(OLD_RUN))
        patch.setenv(old.PREFIX + "LABEL", label)
        patch.setenv(old.PREFIX + "MODE", "record")
        patch.setenv(old.PREFIX + "MAIN", str(OLD_RUN / "main-natural/main-natural-recipes.json"))
        patch.delenv(old.PREFIX + "MUTATION", raising=False)
        settings = old.settings.__wrapped__()
    assert settings.sha256 == MAIN_SHA
    settings.pool = SimpleNamespace(
        label=label,
        mode=mode,
        mutation=mutation,
        contract=contract,
        contract_raw=contract_raw,
        contract_sha=contract_sha,
        harness_sha=harness_sha,
        prior_raw={},
        prior={},
        verified_cases=set(),
        expected=os.environ.get(PREFIX + "EXPECTED"),
        expected_sha=os.environ.get(PREFIX + "EXPECTED_SHA256"),
    )
    settings.pool.prior = {primary: _old_record(settings, primary) for primary in PRIMARIES}
    if mode == "verify":
        assert settings.pool.expected and settings.pool.expected_sha
    # The inherited file is an explicit byte-exact dependency, not this experiment's contract.
    assert (RUN / "experiment-contract.json").read_bytes() == settings.contract_raw
    return settings


def _inputs_unchanged(settings: Any) -> None:
    _legacy_inputs(settings)
    support = settings.pool
    old._equal(
        (RUN / "pool-contract.json").read_bytes(),
        support.contract_raw,
        "pooled-source contract changed",
    )
    assert old._sha(SELF.read_bytes()) == support.harness_sha, "pooled-source harness changed"
    for path, raw in support.prior_raw.items():
        old._equal(path.read_bytes(), raw, "historical healthy record changed")


def _case(native: Any, name: str) -> Any:
    primary, choice = _identity(name)
    settings = native.main
    label = settings.label
    # Only operational paths/request IDs change alongside the explicit pool ID.
    settings.label = label[:32] + "-" + old._sha(f"{label}:{name}".encode())[:16]
    try:
        case = _legacy_case(native, primary)
    finally:
        settings.label = label
    attention = importlib.import_module("imagegen_worker.illustrious_regional_attention")
    assert type(case.args["global_negative_coverage"]) is attention.Everywhere
    assert type(case.args["global_positive_coverage"]) is attention.Everywhere
    assert case.args["negative_pooled_source_id"] == "current-canvas"
    assert case.args["positive_pooled_source_id"] == "current-canvas"
    case.pool_index = _pool_index(choice)
    case.pool_choice = choice
    case.intended_positive_pool_id = _source_ids(case.recipe)[case.pool_index]
    case.args["positive_pooled_source_id"] = case.intended_positive_pool_id
    if settings.pool.mutation and case.pool_index:
        case.args["positive_pooled_source_id"] = "current-canvas"
    return case


def _header(settings: Any, name: str) -> Any:
    report = _legacy_header(settings, name)
    primary, choice = _identity(name)
    selected = _source_ids(settings.variants[primary]["recipe"])[_pool_index(choice)]
    report.update(
        schema=SCHEMA,
        base=BASE,
        inputBase=old.BASE,
        experimentContractSha256=settings.pool.contract_sha,
        inheritedExperimentContractSha256=old.CONTRACT_SHA,
        harnessSha256=settings.pool.harness_sha,
        mode=settings.pool.mode,
        mutation=settings.pool.mutation,
        primaryInput=primary,
        positivePoolChoice=choice,
        intendedPooledSources={"negative": "current-canvas", "positive": selected},
        globalTokenSupport={"negative": "everywhere", "positive": "everywhere"},
        sourceCaseSha256=settings.pool.contract["priorRecords"][primary]["sha256"],
        healthyExpectationVerifiedBeforeNative=name in settings.pool.verified_cases,
        additionalLimits=[
            "only positive pooled-source selection changes",
            "a regional positive pool still conditions the whole image",
            "controlled test-call forwarding fault, not production source-mutation qualification",
        ],
    )
    return report


def _expected(settings: Any, name: str) -> Any:
    support = settings.pool
    assert support.expected and support.expected_sha, "pinned own healthy record is required"
    raw = Path(support.expected.format(case=name)).read_bytes()
    digest = (
        json.loads(support.expected_sha)[name]
        if support.expected_sha.startswith("{")
        else support.expected_sha
    )
    assert old._sha(raw) == digest
    row = json.loads(raw)
    if "cases" in row:
        row = row["cases"][name]
    assert row["schema"] == SCHEMA and row["case"] == name and row["base"] == BASE
    assert row["status"] == row["mechanicalStatus"] == "passed"
    assert row["mutation"] is None and row["visualStatus"] == "pending"
    assert row["actualPublicationCompleted"] is True
    assert row["sourceStateStorageGraphTokenizersRngReservationsPreserved"] is True
    assert row["assembly"]["originalCallSlotsRestored"] is True
    assert row["experimentContractSha256"] == support.contract_sha
    assert row["inheritedExperimentContractSha256"] == old.CONTRACT_SHA
    assert row["harnessSha256"] == support.harness_sha
    assert row["recipeFileSha256"] == settings.sha256
    assert row["checkpointSha256"] == old.trained.SOURCE_SHA
    assert row["checkpointBytes"] == old.trained.SOURCE_BYTES
    assert row["loadingJournalSourceSha256"] == old.JOURNAL_SHA
    old._equal(row["sourceSha256"], settings.sources, "own healthy source drift")
    return row


def _compare(native: Any, name: str, report: Any) -> None:
    settings = native.main
    primary, choice = _identity(name)
    prior = settings.pool.prior[primary]
    old._equal(report["frameworkSourceSha256"], prior["frameworkSourceSha256"], "framework drift")
    for key in (
        "context",
        "timeIds",
        "masks",
        "streams",
        "sourceTexts",
        "negativeTexts",
        "negativeAllZero",
        "rowsPerStream",
        "tailPaddingRows",
        "keys",
    ):
        old._equal(report["expected"][key], prior["expected"][key], f"unchanged {key} differs")
    for key in ("encodingCounts", "actualClipAliases", "literalTimeline"):
        old._equal(report[key], prior[key], f"unchanged {key} differs")
    for key in ("encodes", "originalCallSlotsRestored"):
        old._equal(report["assembly"][key], prior["assembly"][key], f"assembly {key} differs")
    assert len(report["assembly"]["assemblies"]) == len(prior["assembly"]["assemblies"]) == 1
    actual_assembly, prior_assembly = (
        report["assembly"]["assemblies"][0],
        prior["assembly"]["assemblies"][0],
    )
    assert set(actual_assembly) == set(prior_assembly) == {"context", "pools", "keys", "signs"}
    for key in ("context", "keys", "signs"):
        old._equal(actual_assembly[key], prior_assembly[key], f"unchanged assembly {key} differs")
    # The omitted pool key is checked against literal Compel values in _assert_text
    # and at every original UNet argument; it is not exempt from validation.
    assert report["steps"][0]["sample"] == prior["steps"][0]["sample"]
    assert report["roots"][0]["sample"] == prior["roots"][0]["sample"]
    report["historicalComparison"] = {
        "initialLatentSame": True,
        "contextsMasksScheduleSame": True,
        "poolsSame": report["expected"]["pools"] == prior["expected"]["pools"],
        "predictionsSame": report["predictions"] == prior["predictions"],
        "nativeImageSame": report["nativeImage"] == prior["nativeImage"],
        "rgbSame": report["rgb"] == prior["rgb"],
    }
    if choice == "global":
        for key in old.EXACT_FIELDS:
            old._equal(report[key], prior[key], f"fresh global-pool control differs: {key}")
    else:
        assert not report["historicalComparison"]["poolsSame"], (
            "regional pool is not discriminating"
        )
    pinned = None
    if settings.pool.mode == "verify":
        pinned = _expected(settings, TARGET if name == REPEAT else name)
    elif name == REPEAT:
        pinned = settings.records.get(TARGET)
        if pinned is None:
            pinned = _expected(settings, TARGET)
    if pinned is not None:
        old._equal(
            report["frameworkSourceSha256"], pinned["frameworkSourceSha256"], "own framework drift"
        )
        report["healthyComparison"] = {
            "predictionsSame": report["predictions"] == pinned["predictions"],
            "nativeImageSame": report["nativeImage"] == pinned["nativeImage"],
            "rgbSame": report["rgb"] == pinned["rgb"],
        }
        for key in old.EXACT_FIELDS:
            old._equal(report[key], pinned[key], f"own healthy/restored result differs: {key}")


@contextmanager
def _native_observer(native: Any, case: Any, monkeypatch: Any) -> Generator[Any, None, None]:
    """Supplement original observers with bounded exact signed UNet pool values."""
    torch, p = native.torch, native.pipeline
    with _legacy_native_observer(native, case, monkeypatch) as seen:
        owner: Any = cast(Any, type(p.unet))
        forward = owner.forward
        signature = inspect.signature(forward)
        seen.pool_rows = cast(list[Any], [])
        native.pool_case_rows = seen.pool_rows

        @wraps(forward)
        def consumed(current: Any, *args: Any, **kwargs: Any) -> Any:
            if current is p.unet:
                values = signature.bind(current, *args, **kwargs).arguments
                pools = values["added_cond_kwargs"]["text_embeds"]
                assert tuple(pools.shape) == (2, 1280)
                assert pools.dtype == torch.float16 and pools.device == torch.device("cuda:0")
                assert len(seen.pool_rows) < 30, "bounded native pool capture exhausted"
                seen.pool_rows.append(pools.detach().clone())
            return forward(current, *args, **kwargs)

        with monkeypatch.context() as patch:
            patch.setattr(owner, "forward", consumed)
            yield seen
    # Keep owned rows until post-publication assertions. The unchanged _run_case
    # finally clears seen.__dict__ after serialization, releasing all 153,600B.


def _raw(native: Any, text: Any, seen: Any, report: Any) -> None:
    _legacy_raw(native, text, seen, report)
    if seen is None or not hasattr(seen, "pool_rows"):
        return
    expected = report.get("poolSelection", {})
    rows: list[dict[str, Any]] = []
    for index, actual in enumerate(seen.pool_rows, 1):
        row = {
            "step": index,
            "combined": old._hash(native, actual),
            "negative": old._hash(native, actual[:1]),
            "positive": old._hash(native, actual[1:]),
        }
        if expected:
            row.update(
                negativeHashMatchesExpected=row["negative"] == expected["expectedNegative"],
                positiveHashMatchesExpected=row["positive"] == expected["expectedPositive"],
            )
        rows.append(row)
    report["nativePooledRows"] = rows
    if report.get("predictions") is not None:
        prior = native.main.pool.prior[report["primaryInput"]]
        report["rawHistoricalComparison"] = {
            "predictionsSame": report["predictions"] == prior["predictions"],
            "nativeImageSame": report["nativeImage"] == prior["nativeImage"],
            "rgbSame": None if "rgb" not in report else report["rgb"] == prior["rgb"],
        }


def _assert_text(native: Any, case: Any, text: Any, assembly: Any, report: Any) -> Any:
    """Independent literal conditioning, varying only the selected positive pool."""
    torch, p = native.torch, native.pipeline
    literals = [old.GLOBAL] + (
        [old.RIGHT, old.LEFT] if case.variant == "swapped" else [old.LEFT, old.RIGHT]
    )
    pairs = [old._literal_pair(native, literal) for literal in literals]
    assert len(text.pairs) == len(pairs) == 3
    for actual, literal, expected in zip(text.pairs, literals, pairs, strict=True):
        assert actual.pipeline is p
        assert (
            actual.parameters.positive_prompt == literal and actual.parameters.negative_prompt == ""
        )
        assert actual.inputs.prompts == (literal, "") and actual.inputs.managers == (None, None)
        for field, value in zip(old.FIELDS, expected, strict=True):
            assert torch.equal(getattr(actual.result, field), value), f"literal {field} differs"
        assert actual.result.positive_length == actual.result.negative_length == 77
    assert text.plans == [None]
    assert not text.loads and text.resizes == 0, "no TI installation/resizing is allowed"
    assert Counter(id(row.encoder) for row in text.encoder_calls) == Counter(
        {id(p.text_encoder): 3, id(p.text_encoder_2): 6}
    )
    assert all(not row.alias_ids and row.rows.numel() == 0 for row in text.encoder_calls)
    expected_bindings = [[identity, 77] for identity in _source_ids(case.recipe)]
    assert assembly.encodes == [
        {
            "keys": 231,
            "negative": expected_bindings,
            "positive": expected_bindings,
            "strategy": "shared-readonly",
        }
    ], "one encoding must retain all original ordered signed bindings"
    context = torch.cat(
        (
            torch.cat([pair[1] for pair in pairs], dim=1),
            torch.cat([pair[0] for pair in pairs], dim=1),
        )
    )
    negative_pool, positive_pool = pairs[0][3], pairs[case.pool_index][2]
    pools = torch.cat((negative_pool, positive_pool))
    assert torch.count_nonzero(context[0]) == 0 and torch.count_nonzero(negative_pool) == 0
    positive_hashes = [old._hash(native, pair[2]) for pair in pairs]
    report["poolSelection"] = {
        "choice": case.pool_choice,
        "index": case.pool_index,
        "intendedSourceId": case.intended_positive_pool_id,
        "effectiveSourceId": case.args["positive_pooled_source_id"],
        "expectedNegative": old._hash(native, negative_pool),
        "expectedPositive": old._hash(native, positive_pool),
        "literalPositivePools": positive_hashes,
        "literalPoolsAllDistinct": all(
            not torch.equal(pairs[i][2], pairs[j][2]) for i in range(3) for j in range(i + 1, 3)
        ),
        "literalValuesEqualPerStep": [
            {
                "negative": torch.equal(actual[:1], negative_pool),
                "positive": torch.equal(actual[1:], positive_pool),
            }
            for actual in native.pool_case_rows
        ],
    }
    times = torch.tensor(
        [[1024, 1024, 0, 0, 1024, 1024]], device="cuda:0", dtype=torch.float16
    ).repeat(2, 1)
    report["assembly"] = cast(dict[str, Any], vars(assembly)).copy()
    report["expected"] = {
        "context": old._hash(native, context),
        "pools": old._hash(native, pools),
        "timeIds": old._hash(native, times),
        "masks": {str(f): old._hash(native, old._permissions(native, case, f)) for f in (2, 4)},
        "streams": [
            {field: old._hash(native, value) for field, value in zip(old.FIELDS, pair, strict=True)}
            for pair in pairs
        ],
        "sourceTexts": literals,
        "negativeTexts": [""] * 3,
        "negativeAllZero": True,
        "rowsPerStream": 77,
        "tailPaddingRows": 0,
        "keys": 231,
    }
    assert report["poolSelection"]["literalPoolsAllDistinct"], (
        "literal pool choices are not discriminating"
    )
    assert assembly.assemblies == [
        {
            "context": old._hash(native, context),
            "pools": old._hash(native, pools),
            "keys": 231,
            "signs": ["negative", "positive"],
        }
    ], "positive pooled source differs after PNG publication (owned assembly)"
    rows = report["poolSelection"]["literalValuesEqualPerStep"]
    assert len(rows) == 30 and all(row["negative"] for row in rows)
    assert all(row["positive"] for row in rows), (
        "positive pooled source differs after PNG publication (native UNet)"
    )
    return context


@pytest.fixture(scope="module")
def pool_native(pool_settings: Any) -> Iterator[Any]:
    settings = pool_settings
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(old, "RUN", RUN)
        patch.setattr(old, "_case", _case)
        patch.setattr(old, "_header", _header)
        patch.setattr(old, "_assert_text", _assert_text)
        patch.setattr(old.sampling, "_native_observer", _native_observer)
        patch.setattr(old.sampling, "_raw", _raw)
        patch.setattr(old, "_compare", _compare)
        patch.setattr(old, "_inputs_unchanged", _inputs_unchanged)
        iterator = old.visual.__wrapped__(settings)
        native = next(iterator)
        try:
            yield native
        finally:
            try:
                next(iterator)
            except StopIteration:
                pass
            else:
                raise AssertionError("legacy loader fixture yielded more than once")


def _run_case(native: Any, name: str, monkeypatch: Any) -> None:
    settings = native.main
    if settings.pool.mode == "verify" or (name == REPEAT and TARGET not in settings.records):
        # The intentional fault fails in _assert_text before _compare. Validate
        # own healthy gold first so that a bad pin cannot hide behind that RED.
        _expected(settings, TARGET if name == REPEAT else name)
        settings.pool.verified_cases.add(name)
    native.pool_case_rows = cast(list[Any], [])
    try:
        old._run_case(native, name, monkeypatch)
    finally:
        # Captures are owned conditioning, never borrowed model state. The old
        # per-case finally also clears seen before this explicit release.
        native.pool_case_rows.clear()
        del native.pool_case_rows


@pytest.mark.parametrize("name", CASES)
def test_pooled_source_matrix(pool_native: Any, monkeypatch: Any, name: str) -> None:
    _run_case(pool_native, name, monkeypatch)


def test_pooled_source_repeat(pool_native: Any, monkeypatch: Any) -> None:
    assert pool_native.main.pool.mutation is None
    _run_case(pool_native, REPEAT, monkeypatch)
