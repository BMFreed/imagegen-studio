"""ROOT-only fixed global-token support comparison over the genuine visual inputs.

This file intentionally falls outside the legacy ``test_illustrious_regional*``
source census; its own exact bytes are separately pinned by support-contract.json
and every report. No legacy source validation is weakened or copied native loop
introduced. The existing visual loader, preservation, original-calling observers,
literal conditioning, Euler and PNG assertions remain the execution owners.

IGS_REGIONAL_SUPPORT_RUN must equal RUN, LABEL is fresh ASCII <=64 characters,
MODE is record|verify, and CONTRACT_SHA256 pins support-contract.json before ML.
EXPECTED (optional {case}) and EXPECTED_SHA256 (scalar or JSON case:digest) pin
own healthy records for verify/restoration or a repeat in a separate unit.
MUTATION=ignored-positive-support is verify-only: it injects a valid Everywhere
input instead of the intended zero positive coverage. Actual publication occurs
before the unchanged native mask oracle reports that forwarding fault. The
Everywhere selector is its unaffected control. This is an input-forwarding fault
in the test call, not a newly discovered production defect or source mutation.

Five matrix cases and one exact repeat make six initial native calls. A fault
target/control and restored target/control add four, with no ordinary or TI call.
Mechanical PASS always leaves visualStatus=pending; ROOT assesses originals.
Author checks are AST and scoped Ruff only; ROOT owns all target execution.
"""

from __future__ import annotations

import importlib
import json
import os
import re
from collections.abc import Iterator
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest

import test_illustrious_regional_visual_acceptance as _visual_helpers

old: Any = cast(Any, _visual_helpers)
RUN = Path(
    "/home/user/.codex/artifacts/imagegen-studio/runs/regional-guidance-support/20261030-global-tokens"
)
OLD_RUN: Path = old.RUN
BASE = "b6b2cba1d3799a51da163b2151262f8ae26f3b51"
SELF = Path(__file__).resolve()
PREFIX = "IGS_REGIONAL_SUPPORT_"
SCHEMA = "regional-global-support-v1"
MAIN_SHA = "f0af0349fe67b259772b5375da970d2b75c9b02d3ae65b888072af9863d62375"
CASES = (
    "seed123-assignment-everywhere",
    "seed123-assignment-regional-only",
    "seed123-swapped-regional-only",
    "seed124-assignment-regional-only",
    "seed124-swapped-regional-only",
)
REPEAT = "seed123-assignment-regional-only-repeat"
TARGET = "seed123-assignment-regional-only"
PRIMARIES = tuple(
    f"seed{seed}-{variant}" for seed in (123, 124) for variant in ("assignment", "swapped")
)

_legacy_case: Any = old._case
_legacy_permissions: Any = old._permissions
_legacy_header: Any = old._header
_legacy_inputs: Any = old._inputs_unchanged


def _identity(name: str) -> tuple[str, bool]:
    assert name in (*CASES, REPEAT), "unknown finite support case"
    primary = "-".join(name.split("-")[:2])
    return primary, "-regional-only" in name


def _old_record(settings: Any, primary: str) -> Any:
    descriptor = settings.support.contract["priorRecords"][primary]
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
    settings.support.prior_raw[path] = raw
    return row


@pytest.fixture(scope="module")
def support_settings() -> Any:
    requested = os.environ.get(PREFIX + "RUN")
    if requested is None:
        pytest.skip("ROOT opt-in: IGS_REGIONAL_SUPPORT_RUN=<exact RUN>")
    assert requested == str(RUN)
    label, mode = os.environ.get(PREFIX + "LABEL", ""), os.environ.get(PREFIX + "MODE")
    assert re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", label)
    assert mode in ("record", "verify")
    mutation = os.environ.get(PREFIX + "MUTATION")
    assert mutation in (None, "ignored-positive-support")
    assert mutation is None or mode == "verify", "a fault cannot create healthy expected records"
    contract_raw = (RUN / "support-contract.json").read_bytes()
    contract_sha = os.environ.get(PREFIX + "CONTRACT_SHA256", "")
    assert re.fullmatch(r"[0-9a-f]{64}", contract_sha)
    assert old._sha(contract_raw) == contract_sha
    contract = json.loads(contract_raw)
    assert contract["schema"] == "regional-global-support-contract-v1"
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
    settings.support = SimpleNamespace(
        label=label,
        mode=mode,
        mutation=mutation,
        contract=contract,
        contract_raw=contract_raw,
        contract_sha=contract_sha,
        harness_sha=harness_sha,
        prior_raw={},
        prior={},
        expected=os.environ.get(PREFIX + "EXPECTED"),
        expected_sha=os.environ.get(PREFIX + "EXPECTED_SHA256"),
    )
    settings.support.prior = {primary: _old_record(settings, primary) for primary in PRIMARIES}
    if mode == "verify":
        assert settings.support.expected and settings.support.expected_sha
    # The inherited file is an explicit byte-exact dependency, not this experiment's contract.
    assert (RUN / "experiment-contract.json").read_bytes() == settings.contract_raw
    return settings


def _inputs_unchanged(settings: Any) -> None:
    _legacy_inputs(settings)
    support = settings.support
    old._equal(
        (RUN / "support-contract.json").read_bytes(),
        support.contract_raw,
        "support contract changed",
    )
    assert old._sha(SELF.read_bytes()) == support.harness_sha, "support harness changed"
    for path, raw in support.prior_raw.items():
        old._equal(path.read_bytes(), raw, "historical healthy record changed")


def _case(native: Any, name: str) -> Any:
    primary, regional_only = _identity(name)
    settings = native.main
    label = settings.label
    # Operational paths/request IDs are unique; no numerical command field changes.
    settings.label = label[:32] + "-" + old._sha(f"{label}:{name}".encode())[:16]
    try:
        case = _legacy_case(native, primary)
    finally:
        settings.label = label
    assert len(case.recipe["regions"]) == 2
    attention = importlib.import_module("imagegen_worker.illustrious_regional_attention")
    assert type(case.args["global_negative_coverage"]) is attention.Everywhere
    assert type(case.args["global_positive_coverage"]) is attention.Everywhere
    assert case.args["negative_pooled_source_id"] == "current-canvas"
    assert case.args["positive_pooled_source_id"] == "current-canvas"
    case.support_regional_only = regional_only
    case.support_case = name
    if regional_only:
        case.args["global_positive_coverage"] = attention.Alpha8(
            attention.Shape(128, 128), bytes(128 * 128)
        )
        if settings.support.mutation:
            case.args["global_positive_coverage"] = attention.Everywhere()
    return case


def _permissions(native: Any, case: Any, factor: int) -> Any:
    """Literal independent permission rule; never derived from a produced plan/mask."""
    result = _legacy_permissions(native, case, factor)
    assert tuple(result.shape) == (2, (128 // factor) ** 2, 231)
    if case.support_regional_only:
        result[1, :, :77] = False
    assert native.torch.all(result.any(dim=-1)), "both literal signs retain support at every query"
    return result


def _header(settings: Any, name: str) -> Any:
    report = _legacy_header(settings, name)
    primary, regional_only = _identity(name)
    report.update(
        schema=SCHEMA,
        base=BASE,
        inputBase=old.BASE,
        experimentContractSha256=settings.support.contract_sha,
        inheritedExperimentContractSha256=old.CONTRACT_SHA,
        harnessSha256=settings.support.harness_sha,
        mode=settings.support.mode,
        mutation=settings.support.mutation,
        primaryInput=primary,
        intendedGlobalPositiveSupport="none" if regional_only else "everywhere",
        negativeSupport="everywhere",
        pooledSources={"negative": "current-canvas", "positive": "current-canvas"},
        sourceCaseSha256=settings.support.contract["priorRecords"][primary]["sha256"],
        additionalLimits=[
            "only global-positive text-token eligibility changes",
            "global pooled conditioning remains unchanged",
            "a controlled forwarding fault is not production source-mutation qualification",
        ],
    )
    return report


def _expected(settings: Any, name: str) -> Any:
    support = settings.support
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
    primary, regional_only = _identity(name)
    prior = settings.support.prior[primary]
    old._equal(report["frameworkSourceSha256"], prior["frameworkSourceSha256"], "framework drift")
    for key in ("context", "pools", "timeIds", "streams", "sourceTexts", "negativeTexts"):
        old._equal(report["expected"][key], prior["expected"][key], f"unchanged {key} differs")
    for key in ("assembly", "encodingCounts", "actualClipAliases", "literalTimeline"):
        old._equal(report[key], prior[key], f"unchanged {key} differs")
    assert report["steps"][0]["sample"] == prior["steps"][0]["sample"]
    assert report["roots"][0]["sample"] == prior["roots"][0]["sample"]
    report["historicalComparison"] = {
        "initialLatentSame": True,
        "conditioningPoolsScheduleSame": True,
        "predictionsSame": report["predictions"] == prior["predictions"],
        "nativeImageSame": report["nativeImage"] == prior["nativeImage"],
        "rgbSame": report["rgb"] == prior["rgb"],
    }
    # Everywhere is a fresh exact control, not a history-only substitute.
    if not regional_only:
        for key in old.EXACT_FIELDS:
            old._equal(report[key], prior[key], f"fresh Everywhere control differs: {key}")
    pinned = None
    if settings.support.mode == "verify":
        pinned = _expected(settings, TARGET if name == REPEAT else name)
    elif name == REPEAT:
        pinned = settings.records.get(TARGET)
        if pinned is None:
            pinned = _expected(settings, TARGET)
    if pinned is not None:
        old._equal(
            report["frameworkSourceSha256"], pinned["frameworkSourceSha256"], "own framework drift"
        )
        comparison = {
            "predictionsSame": report["predictions"] == pinned["predictions"],
            "nativeImageSame": report["nativeImage"] == pinned["nativeImage"],
            "rgbSame": report["rgb"] == pinned["rgb"],
        }
        report["healthyComparison"] = comparison
        if settings.support.mutation and regional_only:
            report["forwardingFaultReturnedToEverywhere"] = report["historicalComparison"].copy()
            # Preserve completion and raw comparisons; the native mask assertion below
            # must report the intended-vs-effective forwarding fault after publication.
            return
        for key in old.EXACT_FIELDS:
            old._equal(report[key], pinned[key], f"own healthy/restored result differs: {key}")


@pytest.fixture(scope="module")
def support_native(support_settings: Any) -> Iterator[Any]:
    settings = support_settings
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(old, "RUN", RUN)
        patch.setattr(old, "_case", _case)
        patch.setattr(old, "_permissions", _permissions)
        patch.setattr(old, "_header", _header)
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


@pytest.mark.parametrize("name", CASES)
def test_global_token_support(support_native: Any, monkeypatch: Any, name: str) -> None:
    old._run_case(support_native, name, monkeypatch)


def test_global_token_support_repeat(support_native: Any, monkeypatch: Any) -> None:
    assert support_native.main.support.mutation is None
    old._run_case(support_native, REPEAT, monkeypatch)
