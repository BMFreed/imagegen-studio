"""ROOT-only matched trained pair for original Invoke regional operators.

Two native requests maximum: ``ours`` and ``invoke-source`` consume the same
historical genuine Main seed124-swapped handoff, exact checkpoint, native
Diffusers loop, CPU-half initial noise, scheduler and provisional PNG owner.
This is source-pinned Invoke operators in the common ImageGen runtime, NOT an
installed Invoke 0.41 application or visual-quality qualification.

The source lane replaces only the test call's attention-scope factory. Original
model admission, reservations, encoding/assembly, late value guards, Euler/VAE
and publication remain their existing owners. Original Invoke concat/padding/
region operators consume actual encoded pairs. Its graph has global negative
only; its padding bias is transported inside source processor calls while the
unchanged ImageGen root encoder mask remains None. All 140 self/cross processors
are restored exactly. No attention formula or denoising loop is copied here.

Opt in with IGS_REGIONAL_INVOKE_RUN=<exact RUN>, LABEL=fresh ASCII <=64,
MODE=record|verify, CONTRACT_SHA256 and QUALIFICATION_SHA256. The source snapshot
uses IGS_INVOKE_REFERENCE_ROOT and IGS_INVOKE_REFERENCE_SHA256. EXPECTED plus
EXPECTED_SHA256 pin complete own GREEN records (optional {case}, bundle cases
or case-to-digest JSON) for verification / zero-model aggregate selections.
No subject import, collection, typing or native execution is author evidence.
"""

from __future__ import annotations

import copy
import gc
import hashlib
import importlib
import json
import os
import re
import sys
import time
from collections import Counter
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest

import test_illustrious_regional_visual_acceptance as _visual_helpers

old: Any = cast(Any, _visual_helpers)
RUN = Path(
    "/home/user/.codex/artifacts/imagegen-studio/runs/"
    "regional-guidance-invoke-parity/20261031-source-operators"
)
OLD_RUN = old.RUN
BASE = "a88a58321ce5a9261024d50369d3056fb6388c07"
INVOKE_REVISION = "a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd"
MAIN_SHA = "f0af0349fe67b259772b5375da970d2b75c9b02d3ae65b888072af9863d62375"
PRIMARY = "seed124-swapped"
LANES = ("ours", "invoke-source")
PREFIX = "IGS_REGIONAL_INVOKE_"
SCHEMA = "trained-invoke-regional-operator-pair-v1"
SELF = Path(__file__).resolve()
HELPER = "worker-python/tests/invoke_operator_reference.py"
_legacy_inputs: Any = old._inputs_unchanged


def _pinned_json(path: Path, digest: str) -> tuple[bytes, Any]:
    assert re.fullmatch(r"[0-9a-f]{64}", digest)
    binary = path.read_bytes()
    assert old._sha(binary) == digest, f"pinned bytes differ: {path.name}"
    return binary, json.loads(binary)


@pytest.fixture(scope="module")
def invoke_settings() -> Any:
    requested = os.environ.get(PREFIX + "RUN")
    if requested is None:
        pytest.skip("ROOT opt-in: IGS_REGIONAL_INVOKE_RUN=<exact RUN>")
    assert requested == str(RUN)
    label, mode = os.environ.get(PREFIX + "LABEL", ""), os.environ.get(PREFIX + "MODE")
    assert re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", label)
    assert mode in ("record", "verify")
    assert not os.environ.get(PREFIX + "MUTATION"), "this pair contains no source mutation"
    contract_sha = os.environ.get(PREFIX + "CONTRACT_SHA256", "")
    contract_raw, contract = _pinned_json(RUN / "invoke-parity-contract.json", contract_sha)
    for key, value in {
        "schema": "invoke-regional-parity-experiment-v1",
        "base": BASE,
        "invokeRevision": INVOKE_REVISION,
        "trainedCase": PRIMARY,
        "trainedNativeCallCeiling": 2,
        "sharedRuntimeOnly": True,
    }.items():
        old._equal(contract[key], value, f"fixed trained reference contract differs: {key}")
    qualification_sha = os.environ.get(PREFIX + "QUALIFICATION_SHA256", "")
    qualification_raw, qualification = _pinned_json(
        RUN / "qualification-r1.manifest.json", qualification_sha
    )
    assert qualification["base"] == BASE
    own = "worker-python/tests/test_regional_guidance_invoke_trained.py"
    for name in (own, HELPER):
        assert qualification["files"][name]["sha256"] == old._sha(
            (old.trained.REPO / name).read_bytes()
        ), f"new reference owner changed: {name}"
    reference_root = Path(os.environ.get("IGS_INVOKE_REFERENCE_ROOT", ""))
    assert reference_root.is_absolute() and reference_root.resolve() == reference_root
    reference_sha = os.environ.get("IGS_INVOKE_REFERENCE_SHA256", "")
    reference_raw, reference_manifest = _pinned_json(
        reference_root / "invoke-reference.manifest.json", reference_sha
    )
    assert reference_manifest["schema"] == "invoke-regional-source-reference-v1"
    assert reference_manifest["revision"] == INVOKE_REVISION
    assert contract["referenceManifestSha256"] == reference_sha
    # Run the old complete six-handoff validator against its actual historical
    # contracts and sources. There is no reconstructed Python Main recipe.
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(old, "RUN", OLD_RUN)
        patch.setenv(old.PREFIX + "RUN", str(OLD_RUN))
        patch.setenv(old.PREFIX + "LABEL", label)
        patch.setenv(old.PREFIX + "MODE", "record")
        patch.setenv(old.PREFIX + "MAIN", str(OLD_RUN / "main-natural/main-natural-recipes.json"))
        patch.delenv(old.PREFIX + "MUTATION", raising=False)
        settings = old.settings.__wrapped__()
    assert settings.sha256 == MAIN_SHA
    assert (RUN / "experiment-contract.json").read_bytes() == settings.contract_raw
    settings.mode = mode
    settings.reference = SimpleNamespace(
        contract_raw=contract_raw,
        contract_sha=contract_sha,
        qualification_raw=qualification_raw,
        qualification_sha=qualification_sha,
        root=reference_root,
        manifest_raw=reference_raw,
        manifest_sha=reference_sha,
        manifest=reference_manifest,
        own_sha=qualification["files"][own]["sha256"],
        helper_sha=qualification["files"][HELPER]["sha256"],
        expected=os.environ.get(PREFIX + "EXPECTED"),
        expected_sha=os.environ.get(PREFIX + "EXPECTED_SHA256"),
        records={},
    )
    if mode == "verify":
        assert settings.reference.expected and settings.reference.expected_sha
    return settings


def _inputs_unchanged(settings: Any) -> None:
    # Standalone metadata selections do not enter the native fixture's scope.
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(old, "RUN", RUN)
        _legacy_inputs(settings)
    ref = settings.reference
    old._equal((RUN / "invoke-parity-contract.json").read_bytes(), ref.contract_raw, "contract")
    old._equal(
        (RUN / "qualification-r1.manifest.json").read_bytes(),
        ref.qualification_raw,
        "qualification changed",
    )
    old._equal(
        (ref.root / "invoke-reference.manifest.json").read_bytes(),
        ref.manifest_raw,
        "source manifest changed",
    )
    assert old._sha(SELF.read_bytes()) == ref.own_sha
    assert old._sha((old.trained.REPO / HELPER).read_bytes()) == ref.helper_sha
    for name, metadata in ref.manifest["files"].items():
        binary = (ref.root / name).read_bytes()
        assert len(binary) == metadata["bytes"] and old._sha(binary) == metadata["sha256"]


@pytest.fixture(scope="module")
def invoke_native(invoke_settings: Any) -> Generator[Any, None, None]:
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(old, "RUN", RUN)
        patch.setattr(old, "_inputs_unchanged", _inputs_unchanged)
        builder = old.visual.__wrapped__(invoke_settings)
        native = next(builder)
        try:
            reference_loader = importlib.import_module("invoke_operator_reference")
            selected = invoke_settings.reference
            with reference_loader.load_reference(
                native.torch, native.diffusers, selected.root, selected.manifest_sha
            ) as source:
                native.invoke_source = source
                try:
                    yield native
                finally:
                    del native.invoke_source
        finally:
            try:
                next(builder)
            except StopIteration:
                pass
            else:
                raise AssertionError("the native fixture yielded twice")


def _case(native: Any, lane: str) -> Any:
    assert lane in LANES
    settings = native.main
    label = settings.label
    settings.label = f"{label[:32]}-{lane}"
    try:
        case = old._case(native, PRIMARY)
    finally:
        settings.label = label
    case.lane = lane
    assert case.command.seed == 124 and case.command.steps == 30
    assert len(case.recipe["regions"]) == 2 and case.variant == "swapped"
    assert case.args["positive_pooled_source_id"] == "current-canvas"
    assert case.args["negative_pooled_source_id"] == "current-canvas"
    assert case.command.positive_prompt == old.GLOBAL and case.command.negative_prompt == ""
    return case


def _literal_permissions(native: Any, case: Any, factor: int, *, source: bool) -> Any:
    mask = old._permissions(native, case, factor)
    assert tuple(mask.shape) == (2, (128 // factor) ** 2, 231)
    if source:
        mask[0, :, 77:] = False
    return mask


def _reference_graph(native: Any, case: Any, text: Any) -> Any:
    """Actual Invoke concat/pad/pool operators on real observed encoded pairs."""
    torch, ref = native.torch, native.invoke_source
    assert len(text.pairs) == 3
    times = torch.tensor([[1024, 1024, 0, 0, 1024, 1024]], device="cuda:0", dtype=torch.float16)
    negatives: list[Any] = []
    positives: list[Any] = []
    masks: list[Any] = [None]
    image_type = importlib.import_module("PIL.Image")
    for index, pair in enumerate(text.pairs):
        value = pair.result
        assert value.positive_length == value.negative_length == 77
        positives.append(ref.SDXLConditioningInfo(value.positive, value.positive_pooled, times))
        if index == 0:
            negatives.append(ref.SDXLConditioningInfo(value.negative, value.negative_pooled, times))
        else:
            alpha = case.recipe["regions"][index - 1]["coverage"]["alpha"]
            assert len(alpha) == 1024 * 1024 and set(alpha) == {0, 255}
            image = image_type.new("RGBA", (1024, 1024), (255, 255, 255, 0))
            image.putalpha(image_type.frombytes("L", (1024, 1024), alpha))
            actual_mask = ref.canvas_mask(image)
            assert actual_mask.dtype == torch.bool
            assert tuple(actual_mask.shape) == (1, 1024, 1024)
            literal = torch.tensor(list(alpha), dtype=torch.uint8).reshape(1, 1024, 1024) > 0
            assert torch.equal(actual_mask.cpu(), literal)
            masks.append(actual_mask)
    concat = ref.DenoiseLatentsInvocation._concat_regional_text_embeddings
    positive, positive_regions = concat(positives, masks, 128, 128, torch.float16)
    negative, negative_regions = concat(negatives, [None], 128, 128, torch.float16)
    assert positive_regions is not None and negative_regions is None
    conditioning = ref.TextConditioningData(
        uncond_text=negative,
        cond_text=positive,
        uncond_regions=negative_regions,
        cond_regions=positive_regions,
        guidance_scale=5.0,
        guidance_rescale_multiplier=0,
    )
    root = ref.UNetKwargs(
        sample=torch.zeros((2, 4, 128, 128), device="cuda:0", dtype=torch.float16),
        timestep=0,
        encoder_hidden_states=torch.empty(0, device="cuda:0", dtype=torch.float16),
    )
    conditioning.to_unet_kwargs(root, ref.ConditioningMode.Both)
    assert tuple(root.encoder_hidden_states.shape) == (2, 231, 2048)
    expected_context = torch.cat(
        (
            torch.cat([pair.result.negative for pair in text.pairs], dim=1),
            torch.cat([pair.result.positive for pair in text.pairs], dim=1),
        )
    )
    expected_pools = torch.cat(
        (text.pairs[0].result.negative_pooled, text.pairs[0].result.positive_pooled)
    )
    assert torch.equal(root.encoder_hidden_states, expected_context)
    assert torch.equal(root.added_cond_kwargs["text_embeds"], expected_pools)
    assert torch.equal(root.added_cond_kwargs["time_ids"], times.repeat(2, 1))
    padding = root.encoder_attention_mask
    assert tuple(padding.shape) == (2, 231)
    assert torch.all(padding[0, :77] == 1) and torch.count_nonzero(padding[0, 77:]) == 0
    assert torch.all(padding[1] == 1)
    # The native UNet performs precisely this binary-mask-to-bias transport.
    # Keeping it internal preserves the original ImageGen root mask/value guard.
    padding_bias = ((1 - padding.to(torch.float16)) * -10000.0).unsqueeze(1)
    data = root.cross_attention_kwargs["regional_prompt_data"]
    observed: dict[int, Any] = {}
    for factor in (2, 4):
        query = (128 // factor) ** 2
        combined = data.get_cross_attn_mask(query, 231) + padding_bias
        literal = _literal_permissions(native, case, factor, source=True)
        assert torch.equal(combined == 0, literal)
        observed[factor] = {
            "permissions": old._hash(native, literal),
            "bias": old._hash(native, combined),
            "queries": query,
            "keys": 231,
        }
    return SimpleNamespace(
        data=data,
        padding_bias=padding_bias,
        context=expected_context,
        pools=expected_pools,
        times=times.repeat(2, 1),
        masks=observed,
        serialized={
            "positiveGraphStreams": 3,
            "negativeGraphStreams": 1,
            "imagegenNegativeStreams": 3,
            "sourceNegativePaddingRows": 154,
            "sourceGlobalPooledSelected": True,
            "context": old._hash(native, expected_context),
            "pools": old._hash(native, expected_pools),
            "timeIds": old._hash(native, times.repeat(2, 1)),
            "sourcePaddingMask": old._hash(native, padding),
            "internalPaddingBias": old._hash(native, padding_bias),
            "rootEncoderAttentionMaskRemainsNone": True,
            "masks": {str(key): value for key, value in observed.items()},
            "maximumExpandedMaskElements": 2 * 10 * 4096 * 231,
            "sourceExpandedFp16MaskBytes": 2 * 10 * 4096 * 231 * 2,
            "sourceDefinitionHashes": ref.source_definitions,
        },
    )


def _observe_mask(native: Any, value: Any, expected: Any, heads: int) -> dict[str, Any]:
    # Called only on source SDPA masks, after original regional+padding assembly.
    torch = native.torch
    batch, queries, keys = expected.shape
    assert value is not None and value.dtype == torch.float16
    if value.ndim == 3:
        value = value.reshape(batch, heads, value.shape[-2], keys)
    value = value.expand(batch, heads, queries, keys)
    matches, identical = True, True
    for start in range(0, queries, 64):
        block = value[:, :, start : start + 64]
        allowed = block == 0
        matches &= torch.equal(allowed, expected[:, None, start : start + 64].expand_as(allowed))
        identical &= torch.equal(allowed, allowed[:, :1].expand_as(allowed))
        assert torch.all((block == 0) | (block == -10000.0))
    return {
        "firstHead": old._hash(native, value[:, 0] == 0),
        "matches": matches,
        "headsIdentical": identical,
        "dtype": str(value.dtype),
        "shape": list(value.shape),
    }


@contextmanager
def _source_scope(
    native: Any, case: Any, text: Any, seen: Any, state: Any, root: Any, **kwargs: Any
) -> Generator[None, None, None]:
    """Install original source processors, with transport/observation only."""
    torch, ref = native.torch, native.invoke_source
    assert root is native.pipeline.unet
    assert kwargs["tensor_profile"] == "cuda-float16-v1"
    assert kwargs["bindings"] == native.bindings and kwargs["plan"].key_length == 231
    graph = _reference_graph(native, case, text)
    state.graph = graph
    originals = dict(root.attn_processors)
    assert len(originals) == 140
    sites = native.sites
    active: list[Any] = []
    original_sdpa = torch.nn.functional.scaled_dot_product_attention
    self_names = {name for name in originals if name.endswith("attn1.processor")}
    cross_names = {name for name in originals if name.endswith("attn2.processor")}
    assert len(self_names) == len(cross_names) == 70
    expected_masks = {
        factor: _literal_permissions(native, case, factor, source=True) for factor in (2, 4)
    }

    class SourceProcessor:
        def __init__(self, name: str):
            self.name = name
            self.original = ref.CustomAttnProcessor2_0()

        def __call__(
            self,
            attention: Any,
            hidden_states: Any,
            encoder_hidden_states: Any = None,
            attention_mask: Any = None,
            temb: Any = None,
            **extra: Any,
        ) -> Any:
            assert not extra
            assert attention_mask is None, "unchanged native root must retain its None mask"
            cross = encoder_hidden_states is not None
            assert cross == (self.name in cross_names)
            record: dict[str, Any] = {
                "step": len(seen.roots),
                "processor": self.name,
                "kind": "cross" if cross else "self",
                "sdpaCalls": 0,
                "sourceOriginal": type(self.original) is ref.CustomAttnProcessor2_0,
            }
            site = sites.get(id(attention))
            if cross:
                assert site is not None
                record.update(
                    site=site.name,
                    factor=site.factor,
                    heads=attention.heads,
                    queries=hidden_states.shape[1],
                    keys=encoder_hidden_states.shape[1],
                    context=old._hash(native, encoder_hidden_states),
                    internalPadding=old._hash(native, graph.padding_bias),
                )
            state.calls.append(record)
            frame = SimpleNamespace(
                record=record, site=site, hidden=hidden_states, context=encoder_hidden_states
            )
            active.append(frame)
            try:
                result = self.original(
                    attention,
                    hidden_states,
                    encoder_hidden_states=encoder_hidden_states,
                    attention_mask=graph.padding_bias if cross else None,
                    temb=temb,
                    regional_prompt_data=graph.data if cross else None,
                    percent_through=0.0,
                )
            finally:
                assert active.pop() is frame
            if cross:
                record["output"] = old._hash(native, result)
            return result

    def attended(*args: Any, **options: Any) -> Any:
        if active:
            frame = active[-1]
            record = frame.record
            record["sdpaCalls"] += 1
            if frame.site is not None:
                q, k, v = args[:3]
                mask = args[3] if len(args) > 3 else options.get("attn_mask")
                record["sdpaMask"] = _observe_mask(
                    native, mask, expected_masks[frame.site.factor], frame.site.attention.heads
                )
                matches: list[bool] = []
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
                    matches.append(
                        all(
                            torch.equal(
                                actual[:, :, start : start + 64],
                                projected[:, :, start : start + 64],
                            )
                            for start in range(0, actual.shape[2], 64)
                        )
                    )
                    del projected
                record["qkvMatches"] = matches
                record["nativePolicy"] = {
                    "dtype": all(value.dtype == torch.float16 for value in (q, k, v)),
                    "device": all(value.device == torch.device("cuda:0") for value in (q, k, v)),
                    "dropout": args[4] if len(args) > 4 else options.get("dropout_p", 0.0),
                    "causal": args[5] if len(args) > 5 else options.get("is_causal", False),
                }
        return original_sdpa(*args, **options)

    replaced = {name: SourceProcessor(name) for name in originals}
    try:
        with pytest.MonkeyPatch.context() as patch:
            patch.setattr(torch.nn.functional, "scaled_dot_product_attention", attended)
            root.set_attn_processor(replaced.copy())
            state.installed = len(replaced)
            yield
    finally:
        root.set_attn_processor(originals.copy())
        state.restored = root.attn_processors.keys() == originals.keys() and all(
            root.attn_processors[name] is value for name, value in originals.items()
        )
        assert state.restored, "source processor identities were not restored"
        assert torch.nn.functional.scaled_dot_product_attention is original_sdpa
        assert not active


def _assert_source(native: Any, case: Any, state: Any, seen: Any, report: Any) -> None:
    assert state.installed == 140 and state.restored
    assert len(seen.sites) == 0, "source lane must not invoke native processor substitutes"
    calls = state.calls
    assert len(calls) == 4200
    for step in range(1, 31):
        rows = [row for row in calls if row["step"] == step]
        assert Counter(row["kind"] for row in rows) == {"self": 70, "cross": 70}
        assert len({row["processor"] for row in rows}) == 140
        assert all(row["sourceOriginal"] and row["sdpaCalls"] == 1 for row in rows)
    cross = [row for row in calls if row["kind"] == "cross"]
    names = Counter({site.name: 1 for site in native.sites.values()})
    for step in range(1, 31):
        assert Counter(row["site"] for row in cross if row["step"] == step) == names
    for row in cross:
        assert row["context"] == report["expected"]["context"]
        assert row["qkvMatches"] == [True, True, True]
        assert row["sdpaMask"]["matches"] and row["sdpaMask"]["headsIdentical"]
        assert row["sdpaMask"]["firstHead"] == state.graph.masks[row["factor"]]["permissions"]
        assert row["queries"] == (128 // row["factor"]) ** 2 and row["keys"] == 231
        assert row["nativePolicy"] == {
            "dtype": True,
            "device": True,
            "dropout": 0.0,
            "causal": False,
        }
    report["sourceProcessors"] = list(calls)
    report["sourceProcessorRestoration"] = {
        "installed": state.installed,
        "restored": state.restored,
        "crossCalls": len(cross),
        "selfCalls": len(calls) - len(cross),
    }


def _assert_common(native: Any, case: Any, seen: Any, report: Any) -> None:
    # Reuse the complete literal native-loop checks. Source processor rows are
    # validated independently; the common call/scale/Euler/decode trace stays real.
    sites = seen.sites
    if case.lane == "invoke-source":
        # The inherited validator's loop is only the original-native-processor
        # mask oracle. Source rows have a different negative-padding contract,
        # so validate the common trace directly instead of manufacturing rows.
        schedule = old.sampling._literal_schedule(native, case)
        report["literalTimeline"] = vars(schedule)
        assert schedule.grid == list(range(958, 0, -33))
        assert len(seen.calls) == len(seen.decodes) == 1
        assert len(seen.roots) == len(seen.scales) == len(seen.steps) == 30
        assert seen.events == [item for _ in range(30) for item in ("scale", "unet", "step")] + [
            "decode"
        ]
        call = seen.calls[0]
        assert not call["borrowed"] and not call["schedulerBorrowed"]
        assert call["unetSame"] and call["vaeSame"]
        assert call["seed"] == 124 and call["generatorDevice"] == "cpu"
        assert call["timesteps"] == schedule.grid and call["sigmas"] == schedule.sigmas
        assert call["betaHash"] == schedule.beta and call["alphaHash"] == schedule.alpha
        assert seen.steps[0]["sample"] == schedule.initial
        for index, (root, scale, step) in enumerate(
            zip(seen.roots, seen.scales, seen.steps, strict=True)
        ):
            assert root["timestep"] == scale["timestep"] == step["timestep"] == schedule.grid[index]
            assert step["sigma"] == scale["sigma"] == schedule.sigmas[index]
            assert step["nextSigma"] == schedule.sigmas[index + 1]
            assert step["batch"] == scale["input"] and scale["output"] == root["sample"]
            assert all(step[k] for k in ("literalEuler", "cfgAssociation", "previousAssociation"))
            assert scale["literalScale"] and step["sChurn"] == 0
            assert all(root[k] == report["expected"][k] for k in ("context", "pools", "timeIds"))
        decode = seen.decodes[0]
        assert (
            decode["reserved"] and decode["regionalInstalled"] and decode["lastSampleAssociation"]
        )
        assert decode["shape"] == [1, 4, 128, 128]
        assert not sites
    else:
        old._assert_native(native, case, seen, report)


def _header(settings: Any, lane: str) -> dict[str, Any]:
    own = settings.reference
    return {
        "schema": SCHEMA,
        "base": BASE,
        "status": "incomplete",
        "mechanicalStatus": "incomplete",
        "visualStatus": "pending",
        "case": lane,
        "mainCase": PRIMARY,
        "harnessSha256": own.own_sha,
        "helperSha256": own.helper_sha,
        "qualificationManifestSha256": own.qualification_sha,
        "experimentContractSha256": own.contract_sha,
        "inheritedExperimentContractSha256": old.CONTRACT_SHA,
        "referenceManifestSha256": own.manifest_sha,
        "invokeRevision": INVOKE_REVISION,
        "recipeFileSha256": MAIN_SHA,
        "checkpointSha256": old.trained.SOURCE_SHA,
        "checkpointBytes": old.trained.SOURCE_BYTES,
        "loadingJournalSourceSha256": old.JOURNAL_SHA,
        "sourceSha256": settings.sources,
        "mainInputReuse": "historical genuine Main handoff, not a fresh producer",
        "normalization": {
            "runtime": "shared ImageGen Torch/Diffusers, not installed Invoke",
            "nativeLoop": "unchanged original Diffusers SDXL",
            "noise": "common seeded CPU float16 draw and native init_noise_sigma",
            "policy": "common explicit Main false-ZTSNR/leading",
            "microConditioning": "common 1024 original/target size, crop0",
            "rootEncoderAttentionMask": None,
            "sourcePaddingTransport": "internal native additive bias inside source processors",
            "referenceNegativeGraph": "global only, skips empty regional negatives",
            "autoNegative": False,
        },
    }


def _expected(settings: Any, lane: str) -> Any:
    selected = settings.reference
    assert selected.expected and selected.expected_sha
    raw = Path(selected.expected.format(case=lane)).read_bytes()
    digest = (
        json.loads(selected.expected_sha)[lane]
        if selected.expected_sha.startswith("{")
        else selected.expected_sha
    )
    assert old._sha(raw) == digest
    row = json.loads(raw)
    if "cases" in row:
        row = row["cases"][lane]
    assert row["schema"] == SCHEMA and row["case"] == lane and row["status"] == "passed"
    assert row["mechanicalStatus"] == "passed" and row["actualPublicationCompleted"] is True
    assert row["sourceStateStorageGraphTokenizersRngReservationsPreserved"] is True
    assert row["harnessSha256"] == selected.own_sha and row["helperSha256"] == selected.helper_sha
    assert row["qualificationManifestSha256"] == selected.qualification_sha
    assert row["experimentContractSha256"] == selected.contract_sha
    assert row["referenceManifestSha256"] == selected.manifest_sha
    assert row["recipeFileSha256"] == settings.sha256 == MAIN_SHA
    assert row["checkpointSha256"] == old.trained.SOURCE_SHA
    old._equal(row["sourceSha256"], settings.sources, "own source drift")
    return row


def _finish(settings: Any, lane: str, report: Any, started: float) -> None:
    report["elapsedSeconds"] = round(time.monotonic() - started, 6)
    with (RUN / f"{settings.label}-{lane}.json").open("x") as stream:
        json.dump(report, stream, indent=2, allow_nan=False)
        stream.write("\n")


def _snapshot_image(native: Any, case: Any, seen: Any, report: Any) -> None:
    """Retain only the small original output, in bounded contiguous row reads."""
    tensor = seen.result.images
    assert tuple(tensor.shape) == (1, 3, 1024, 1024)
    assert tensor.dtype == native.torch.float16
    assert sys.byteorder == "little", "the fixed raw snapshot format is little endian"
    path = case.root / "native-image.f16"
    digest = hashlib.sha256()
    count = 0
    with path.open("xb") as stream:
        for channel in range(3):
            for row in range(0, 1024, 128):
                chunk = tensor[0, channel, row : row + 128, :].detach().to("cpu").contiguous()
                binary = chunk.view(native.torch.uint8).numpy().tobytes()
                assert len(binary) <= 262144
                assert stream.write(binary) == len(binary)
                digest.update(binary)
                count += len(binary)
    assert count == 6291456 and digest.hexdigest() == seen.image_hash
    report["nativeImageSnapshot"] = {
        "path": str(path),
        "sha256": digest.hexdigest(),
        "bytes": count,
        "dtype": "float16-little-endian",
        "shape": [1, 3, 1024, 1024],
        "maxWriteChunkBytes": 262144,
    }


def _run_case(native: Any, lane: str, monkeypatch: Any) -> Any:
    settings, started = native.main, time.monotonic()
    report = _header(settings, lane)
    report["frameworkSourceSha256"] = native.framework_sources
    case = text = seen = assembly = graph = None
    source_state = SimpleNamespace(calls=[], installed=0, restored=False, graph=None)
    native.torch.cuda.reset_peak_memory_stats(0)
    try:
        if settings.mode == "verify":
            _expected(settings, lane)
            report["healthyExpectationVerifiedBeforeNative"] = True
        case = _case(native, lane)
        report.update(
            seed=case.command.seed,
            stepsRequested=30,
            outputPath=str(case.command.output_path),
            sourceScopeUsed=lane == "invoke-source",
        )
        recipe_before, command_before = copy.deepcopy(case.recipe), copy.deepcopy(case.command)
        target_before = case.target.read_bytes()
        try:
            with old._original_preserved(native, report):
                try:
                    with old._original_observers(native, case, monkeypatch) as observations:
                        text, seen, assembly = observations
                        if lane == "invoke-source":

                            @contextmanager
                            def source_scope(
                                root: Any, **kwargs: Any
                            ) -> Generator[None, None, None]:
                                with _source_scope(
                                    native, case, text, seen, source_state, root, **kwargs
                                ):
                                    yield

                            with monkeypatch.context() as patch:
                                patch.setattr(
                                    native.denoising,
                                    "scoped_illustrious_regional_attention",
                                    source_scope,
                                )
                                receipt = native.output.generate_current_canvas_regional_txt2img(
                                    case.recipe, command=case.command, **case.args
                                )
                        else:
                            receipt = native.output.generate_current_canvas_regional_txt2img(
                                case.recipe, command=case.command, **case.args
                            )
                    old.sampling._raw(native, text, seen, report)
                    old.sampling._png(native, case, seen, receipt, report)
                    _snapshot_image(native, case, seen, report)
                    report["actualPublicationCompleted"] = True
                    report["actualNativeCalls"] = len(seen.calls)
                    old._assert_text(native, case, text, assembly, report)
                    report["expectedRole"] = (
                        "unchanged ImageGen encoding/assembly/plan; "
                        "actual source masks are verified separately against sourceGraph"
                    )
                    graph = source_state.graph or _reference_graph(native, case, text)
                    report["sourceGraph"] = graph.serialized
                    assert all(
                        row["context"] == graph.serialized["context"]
                        and row["pools"] == graph.serialized["pools"]
                        and row["timeIds"] == graph.serialized["timeIds"]
                        for row in seen.roots
                    )
                    _assert_common(native, case, seen, report)
                    if lane == "invoke-source":
                        _assert_source(native, case, source_state, seen, report)
                    if settings.mode == "verify":
                        previous = _expected(settings, lane)
                        for key in (
                            "roots",
                            "scales",
                            "steps",
                            "decodes",
                            "predictions",
                            "nativeImage",
                            "rgb",
                        ):
                            old._equal(report[key], previous[key], f"own replay differs: {key}")
                finally:
                    old._equal(case.recipe, recipe_before, "complete Main recipe changed")
                    assert case.command == command_before
                    old._equal(case.target.read_bytes(), target_before, "target changed")
        finally:
            _inputs_unchanged(settings)
            old._equal(old._framework_sources(native), native.framework_sources, "framework drift")
        report.update(
            status="passed", mechanicalStatus="passed", outcome="pair lane complete; visual pending"
        )
        settings.reference.records[lane] = report
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
            old.sampling._raw(native, text, seen, report)
            report["actualNativeCalls"] = 0 if seen is None else len(seen.calls)
            if assembly is not None:
                report["assembly"] = cast(dict[str, Any], vars(assembly)).copy()
            if source_state.graph is not None:
                report["sourceGraph"] = source_state.graph.serialized
            if source_state.calls:
                report["sourceProcessors"] = list(source_state.calls)
                report.setdefault("sourceProcessorRestoration", {}).update(
                    installed=source_state.installed, restored=source_state.restored
                )
            native.torch.cuda.synchronize(0)
            report["cudaPeakAllocatedBytes"] = native.torch.cuda.max_memory_allocated(0)
            report["cudaPeakReservedBytes"] = native.torch.cuda.max_memory_reserved(0)
        finally:
            _finish(settings, lane, report, started)
        if text is not None:
            cast(dict[str, Any], vars(text)).clear()
        if seen is not None:
            cast(dict[str, Any], vars(seen)).clear()
        source_state.graph = None
        source_state.calls.clear()
        case = text = seen = assembly = graph = None
        gc.collect()


@pytest.mark.parametrize("lane", LANES)
def test_trained_invoke_pair(invoke_native: Any, monkeypatch: Any, lane: str) -> None:
    _run_case(invoke_native, lane, monkeypatch)


def test_recorded_trained_invoke_pair(invoke_settings: Any) -> None:
    """Zero-model comparison; numerical differences are measurements, not false PASS."""
    settings = invoke_settings
    rows = {
        lane: settings.reference.records[lane]
        if lane in settings.reference.records
        else _expected(settings, lane)
        for lane in LANES
    }
    ours, source = rows["ours"], rows["invoke-source"]
    for key in ("sourceGraph", "expected", "encodingCounts", "literalTimeline"):
        old._equal(ours[key], source[key], f"matched trained inputs differ: {key}")
    for key in (
        "config",
        "options",
        "timesteps",
        "sigmas",
        "betaHash",
        "alphaHash",
        "generatorDevice",
        "seed",
        "borrowed",
        "schedulerBorrowed",
        "unetSame",
        "vaeSame",
    ):
        old._equal(
            ours["calls"][0][key], source["calls"][0][key], f"matched native call differs: {key}"
        )
    assert ours["steps"][0]["sample"] == source["steps"][0]["sample"]
    assert ours["roots"][0]["sample"] == source["roots"][0]["sample"]
    assert ours["roots"][0]["context"] == source["roots"][0]["context"]
    assert ours["roots"][0]["pools"] == source["roots"][0]["pools"]
    assert ours["roots"][0]["timeIds"] == source["roots"][0]["timeIds"]
    image_type = importlib.import_module("PIL.Image")
    np = importlib.import_module("numpy")
    images: list[Any] = []
    outputs: list[Any] = []
    for row in (ours, source):
        path = Path(row["outputPath"])
        assert old._sha(path.read_bytes()) == row["png"]
        with image_type.open(path) as image:
            image.load()
            assert image.mode == "RGB" and image.size == (1024, 1024)
            assert old._sha(image.tobytes()) == row["rgb"]
            images.append(np.array(image))
        snapshot = row["nativeImageSnapshot"]
        native_path = Path(snapshot["path"])
        assert native_path == path.parent / "native-image.f16"
        binary = native_path.read_bytes()
        assert len(binary) == snapshot["bytes"] == 6291456
        assert old._sha(binary) == snapshot["sha256"] == row["nativeImage"]
        assert snapshot["shape"] == [1, 3, 1024, 1024]
        outputs.append(np.frombuffer(binary, dtype="<f2").astype(np.float32))
    rgb_delta = images[1].astype(np.int16) - images[0].astype(np.int16)
    output_delta = outputs[1] - outputs[0]
    different_steps = [
        step
        for step, (a, b) in enumerate(
            zip(ours["predictions"], source["predictions"], strict=True), 1
        )
        if a != b
    ]
    summary = {
        "schema": "trained-invoke-pair-comparison-v1",
        "status": "measured",
        "scope": "source operators/common native runtime and loop; not installed Invoke app",
        "initialLatentExact": True,
        "contextsPoolsMicroconditioningExact": True,
        "scheduleExact": True,
        "predictionsExact": ours["predictions"] == source["predictions"],
        "nativeImageExact": ours["nativeImage"] == source["nativeImage"],
        "rgbExact": ours["rgb"] == source["rgb"],
        "firstDifferingPredictionStep": different_steps[0] if different_steps else None,
        "differentPredictionSteps": different_steps,
        "nativeImageDifference": {
            "changedValues": int(np.count_nonzero(output_delta)),
            "maximumAbsolute": float(np.abs(output_delta).max()),
            "meanAbsolute": float(np.abs(output_delta).mean(dtype=np.float64)),
            "rms": float(np.sqrt(np.square(output_delta.astype(np.float64)).mean())),
        },
        "rgbDifference": {
            "changedChannels": int(np.count_nonzero(rgb_delta)),
            "changedPixels": int(np.count_nonzero(np.any(rgb_delta != 0, axis=2))),
            "maximumAbsolute": int(np.abs(rgb_delta).max()),
            "meanAbsolute": float(np.abs(rgb_delta).mean(dtype=np.float64)),
            "rms": float(np.sqrt(np.square(rgb_delta.astype(np.float64)).mean())),
        },
        "processorGraphDifference": "source skips local-empty negatives and uses additive masks",
        "visualStatus": "pending",
        "actualNativeCallsThisSelection": 0,
    }
    with (RUN / f"{settings.label}-pair-comparison.json").open("x") as stream:
        json.dump(summary, stream, indent=2, allow_nan=False)
        stream.write("\n")
    _inputs_unchanged(settings)
