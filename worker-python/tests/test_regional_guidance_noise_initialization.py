"""ROOT-only fixed noise-draw/initialization experiment; no production changes.

IGS_REGIONAL_NOISE_RUN must equal RUN. LABEL is fresh ASCII <=64, MODE is
record|verify, and CONTRACT_SHA256 / QUALIFICATION_SHA256 pin the ROOT freeze.
Six fresh trained selectors plus two explicitly historical controls form eight
matrix cells. The aggregate loads no model. EXPECTED / EXPECTED_SHA256 support
pinned per-case records (optional {case}, JSON case:digest map) for verification.

Small selectors execute original native prepare_latents and Euler primitives
with minimal state owners, without CLIP/UNet/VAE construction. Original selected
Invoke AST bodies are unchanged. All trained conditioning, attention, Euler,
VAE, PNG and preservation checks reuse existing owners. No diffusion loop is
copied. Mechanical PASS leaves the anonymous visual assessment pending.
"""

from __future__ import annotations

import ast
import copy
import gc
import importlib
import inspect
import json
import os
import re
import sys
import time
from collections.abc import Generator
from contextlib import contextmanager
from functools import wraps
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest

import test_illustrious_regional_visual_acceptance as _visual
import test_regional_guidance_invoke_trained as _previous

old: Any = cast(Any, _visual)
previous: Any = cast(Any, _previous)
RUN = Path(
    "/home/user/.codex/artifacts/imagegen-studio/runs/regional-guidance-noise/20261031-factorial"
)
OLD_RUN = old.RUN
BASE = "4f1088aa90d7547d6e5a46b2b93f987303769b94"
PREFIX = "IGS_REGIONAL_NOISE_"
SELF = "worker-python/tests/test_regional_guidance_noise_initialization.py"
SCHEMA = "regional-noise-initialization-mechanical-v1"
FACTORS = (("fp16", "native"), ("fp32", "native"), ("fp16", "invoke"), ("fp32", "invoke"))
FRESH = tuple(
    f"seed{seed}-{draw}-{initialization}"
    for seed in (123, 124)
    for draw, initialization in FACTORS
    if (draw, initialization) != ("fp16", "native")
)
_legacy_inputs: Any = old._inputs_unchanged
_literal_schedule: Any = old.sampling._literal_schedule


def _json(path: Path, digest: str) -> tuple[bytes, Any]:
    assert re.fullmatch(r"[0-9a-f]{64}", digest)
    binary = path.read_bytes()
    assert old._sha(binary) == digest, f"pinned bytes differ: {path}"
    return binary, json.loads(binary)


@pytest.fixture(scope="module")
def noise_settings() -> Any:
    requested = os.environ.get(PREFIX + "RUN")
    if requested is None:
        pytest.skip("ROOT opt-in: IGS_REGIONAL_NOISE_RUN=<exact RUN>")
    assert requested == str(RUN)
    label, mode = os.environ.get(PREFIX + "LABEL", ""), os.environ.get(PREFIX + "MODE")
    assert re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", label)
    assert mode in ("record", "verify") and not os.environ.get(PREFIX + "MUTATION")
    contract_raw, contract = _json(
        RUN / "noise-contract.json", os.environ.get(PREFIX + "CONTRACT_SHA256", "")
    )
    for key, value in {
        "schema": "regional-noise-initialization-factorial-v1",
        "base": BASE,
        "fixedBeforeNativeExecution": True,
        "seeds": [123, 124],
        "variant": "swapped",
        "draws": ["fp16", "fp32"],
        "initializations": ["native", "invoke"],
        "freshNativeCallCeiling": 6,
        "matrixCells": 8,
        "productionChanges": False,
        "publicReadinessChange": False,
    }.items():
        old._equal(contract[key], value, f"fixed noise contract differs: {key}")
    qualification_raw, qualification = _json(
        RUN / "qualification-r1.manifest.json",
        os.environ.get(PREFIX + "QUALIFICATION_SHA256", ""),
    )
    assert qualification["base"] == BASE
    owners = (
        SELF,
        "worker-python/tests/test_regional_guidance_invoke_trained.py",
        "worker-python/tests/test_illustrious_regional_visual_acceptance.py",
        "worker-python/tests/test_illustrious_regional_sampling_trained.py",
    )
    pinned = {name: qualification["files"][name]["sha256"] for name in owners}
    for name, digest in pinned.items():
        assert old._sha((old.trained.REPO / name).read_bytes()) == digest
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(old, "RUN", OLD_RUN)
        for key, value in {
            "RUN": str(OLD_RUN),
            "LABEL": label,
            "MODE": "record",
            "MAIN": contract["mainJson"],
        }.items():
            patch.setenv(old.PREFIX + key, value)
        patch.delenv(old.PREFIX + "MUTATION", raising=False)
        settings = old.settings.__wrapped__()
    assert settings.sha256 == contract["mainSha256"]
    assert (RUN / "experiment-contract.json").read_bytes() == settings.contract_raw
    reference_root = Path(contract["referenceRoot"])
    assert reference_root.is_absolute() and reference_root.resolve() == reference_root
    reference_raw, reference = _json(
        reference_root / "invoke-reference.manifest.json", contract["referenceManifestSha256"]
    )
    assert reference["revision"] == contract["referenceRevision"]
    baselines: dict[str, Any] = {}
    baseline_bytes: dict[str, bytes] = {}
    for seed in ("123", "124"):
        descriptor = contract["historicalBaselines"][seed]
        binary, row = _json(Path(descriptor["record"]), descriptor["recordSha256"])
        assert old._sha(Path(descriptor["png"]).read_bytes()) == descriptor["pngSha256"]
        assert row["status"] == row["mechanicalStatus"] == "passed"
        assert row["sourceStateStorageGraphTokenizersRngReservationsPreserved"] is True
        assert row["recipeFileSha256"] == settings.sha256
        assert row["rgb"] == descriptor["rgbSha256"] and row["png"] == descriptor["pngSha256"]
        assert row["seed"] == int(seed) and len(row["roots"]) == len(row["steps"]) == 30
        old._equal(row["sourceSha256"], settings.sources, "historical source pins differ")
        baselines[seed], baseline_bytes[seed] = row, binary
    old._equal(
        baselines["123"]["frameworkSourceSha256"],
        baselines["124"]["frameworkSourceSha256"],
        "historical runtime/config source pins differ",
    )
    settings.mode = mode
    settings.noise = SimpleNamespace(
        contract=contract,
        contract_raw=contract_raw,
        qualification_raw=qualification_raw,
        pinned=pinned,
        reference_root=reference_root,
        reference_raw=reference_raw,
        reference=reference,
        baselines=baselines,
        baseline_bytes=baseline_bytes,
        records={},
        fresh_calls=0,
        expected=os.environ.get(PREFIX + "EXPECTED"),
        expected_sha=os.environ.get(PREFIX + "EXPECTED_SHA256"),
    )
    return settings


def _inputs_unchanged(settings: Any) -> None:
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(old, "RUN", RUN)
        _legacy_inputs(settings)
    selected = settings.noise
    for name, binary in (
        ("noise-contract.json", selected.contract_raw),
        ("qualification-r1.manifest.json", selected.qualification_raw),
    ):
        old._equal((RUN / name).read_bytes(), binary, f"noise input changed: {name}")
    for name, digest in selected.pinned.items():
        assert old._sha((old.trained.REPO / name).read_bytes()) == digest
    old._equal(
        (selected.reference_root / "invoke-reference.manifest.json").read_bytes(),
        selected.reference_raw,
        "Invoke manifest changed",
    )
    for name, metadata in selected.reference["files"].items():
        binary = (selected.reference_root / name).read_bytes()
        assert len(binary) == metadata["bytes"] and old._sha(binary) == metadata["sha256"]
    for seed, descriptor in selected.contract["historicalBaselines"].items():
        assert Path(descriptor["record"]).read_bytes() == selected.baseline_bytes[seed]
        assert old._sha(Path(descriptor["png"]).read_bytes()) == descriptor["pngSha256"]


def _reference(torch: Any, settings: Any) -> Any:
    """Compile unchanged original definitions; only dependency/IO bindings are supplied."""
    selected = settings.noise
    definitions: dict[str, str] = {}

    def source(name: str) -> Any:
        binary = (selected.reference_root / name).read_bytes()
        metadata = selected.reference["files"][name]
        assert len(binary) == metadata["bytes"] and old._sha(binary) == metadata["sha256"]
        return ast.parse(binary)

    def find(tree: Any, qualified: str) -> Any:
        node = tree
        for name in qualified.split("."):
            candidates = [
                child
                for child in node.body
                if isinstance(child, (ast.FunctionDef, ast.ClassDef)) and child.name == name
            ]
            assert len(candidates) == 1
            node = candidates[0]
        definitions[qualified] = old._sha(ast.dump(node, include_attributes=False).encode())
        return node

    noise = source("invokeai/app/invocations/latent_noise.py")
    devices = source("invokeai/backend/util/devices.py")
    pipeline = source("invokeai/backend/stable_diffusion/diffusers_pipeline.py")
    config_tree = source("invokeai/app/services/config/config_default.py")
    constants = source("invokeai/app/invocations/constants.py")
    default: Any = next(
        node
        for node in ast.walk(config_tree)
        if isinstance(node, ast.AnnAssign)
        and isinstance(node.target, ast.Name)
        and node.target.id == "noise_dtype"
    )
    assert next(item.value.value for item in default.value.keywords if item.arg == "default") == (
        "float32"
    )
    scale = next(
        cast(Any, node.value).value
        for node in constants.body
        if isinstance(node, ast.Assign)
        and any(
            isinstance(target, ast.Name) and target.id == "LATENT_SCALE_FACTOR"
            for target in node.targets
        )
    )
    assert scale == 8
    configuration = SimpleNamespace(noise_dtype="float32")
    namespace: dict[str, Any] = {
        "__name__": "_regional_noise_original_source",
        "torch": torch,
        "get_config": lambda: configuration,
        "LATENT_SCALE_FACTOR": scale,
    }
    container = ast.ClassDef(
        name="TorchDevice",
        bases=[],
        keywords=[],
        body=[find(devices, "TorchDevice.choose_noise_dtype")],
        decorator_list=[],
        type_params=[],
    )
    functions = [
        find(noise, name)
        for name in (
            "validate_noise_dimensions",
            "get_expected_noise_shape",
            "generate_noise_tensor",
        )
    ]
    module = ast.fix_missing_locations(
        ast.Module(
            body=[
                ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0),
                container,
                *functions,
            ],
            type_ignores=[],
        )
    )
    exec(compile(module, "original-invoke-noise-definitions", "exec"), namespace)
    initialization = find(pipeline, "StableDiffusionGeneratorPipeline.latents_from_embeddings")
    assignments: list[ast.stmt] = [
        node
        for node in ast.walk(initialization)
        if isinstance(node, ast.Assign)
        and isinstance(node.value, ast.Call)
        and isinstance(node.value.func, ast.Attribute)
        and node.value.func.attr == "add_noise"
        and any(isinstance(target, ast.Name) and target.id == "latents" for target in node.targets)
    ]
    assert len(assignments) == 1
    definitions["initialNoiseAssignment"] = old._sha(
        ast.dump(assignments[0], include_attributes=False).encode()
    )
    code = compile(
        ast.fix_missing_locations(ast.Module(body=assignments, type_ignores=[])),
        "original-invoke-initial-noise-assignment",
        "exec",
    )
    return SimpleNamespace(
        configuration=configuration, namespace=namespace, initial_code=code, definitions=definitions
    )


def _independent_noise(torch: Any, seed: int, draw: str, height: int, width: int) -> Any:
    dtype = torch.float32 if draw == "fp32" else torch.float16
    return torch.randn(
        (1, 4, height // 8, width // 8),
        generator=torch.Generator(device="cpu").manual_seed(seed),
        device="cpu",
        dtype=dtype,
    ).to(torch.float16)


def _source_noise(
    reference: Any, draw: str, seed: int, device: Any, height: int, width: int
) -> Any:
    """ROOT model-free draw-mutation seam; ordinary source bodies stay unchanged."""
    reference.configuration.noise_dtype = "float32" if draw == "fp32" else "float16"
    return reference.namespace["generate_noise_tensor"](
        "SD", width, height, seed, device, reference.namespace["torch"].float16, use_cpu=True
    )


def _source_add_noise(reference: Any, scheduler: Any, raw: Any) -> Any:
    """ROOT model-free scaling-mutation seam; execute the original assignment."""
    namespace = {
        "self": SimpleNamespace(scheduler=scheduler),
        "latents": reference.namespace["torch"].zeros_like(raw),
        "noise": raw,
        "batched_init_timestep": scheduler.timesteps[:1].expand(1),
    }
    exec(reference.initial_code, namespace)
    return namespace["latents"]


def _expected_initial(
    torch: Any,
    sigmas: Any,
    seed: int,
    draw: str,
    initialization: str,
    device: Any,
    height: int,
    width: int,
) -> Any:
    raw = _independent_noise(torch, seed, draw, height, width).to(device)
    if initialization == "invoke":
        # Euler.add_noise casts the sigma VECTOR before multiplying; the order matters in FP16.
        sigma = sigmas[:1].to(device=device, dtype=torch.float16).reshape(1, 1, 1, 1)
        return torch.zeros_like(raw) + raw * sigma
    return raw * (sigmas.max() ** 2 + 1) ** 0.5


def _scheduler_state(native: Any, scheduler: Any) -> Any:
    return (
        scheduler.step_index,
        scheduler.begin_index,
        old._hash(native, scheduler.timesteps),
        old._hash(native, scheduler.sigmas),
    )


def _select_initial(
    native: Any,
    reference: Any,
    original: Any,
    current: Any,
    values: Any,
    draw: str,
    initialization: str,
    record: Any,
) -> Any:
    torch = native.torch
    assert (draw, initialization) in FACTORS, "unsupported noise factor"
    assert current is not native.pipeline and type(current) is native.pipeline_class
    assert values["latents"] is None and values["batch_size"] == 1
    assert values["num_channels_latents"] == 4 and values["dtype"] == torch.float16
    height, width, device = values["height"], values["width"], torch.device(values["device"])
    assert type(height) is type(width) is int and min(height, width) >= 8
    assert height % 8 == width % 8 == 0 and max(height, width) <= 2048
    assert device in (torch.device("cpu"), torch.device("cuda:0"))
    generator = values["generator"]
    assert type(generator) is torch.Generator and generator.device.type == "cpu"
    seed = generator.initial_seed()
    assert seed in (123, 124)
    scheduler = current.scheduler
    state = _scheduler_state(native, scheduler)
    assert state[:2] == (None, None)
    native_candidate = original(current, **values)
    record["originalNativePreparationCalls"] = 1
    assert tuple(native_candidate.shape) == (1, 4, height // 8, width // 8)
    assert native_candidate.dtype == torch.float16 and native_candidate.device == device
    baseline_initials = getattr(native, "baseline_initials", None)
    if baseline_initials is not None:
        baseline = baseline_initials[str(seed)]
        assert old._hash(native, native_candidate) == baseline["sample"]
        assert (
            old._hash(native, torch.cat((native_candidate, native_candidate))) == baseline["batch"]
        )
        record["originalNativeCandidateMatchesReusedStartBeforeIntervention"] = True
    half_raw = _source_noise(reference, "fp16", seed, device, height, width)
    assert half_raw.device.type == "cpu" and half_raw.dtype == torch.float16
    assert torch.equal(half_raw, _independent_noise(torch, seed, "fp16", height, width))
    assert torch.equal(native_candidate, half_raw.to(device) * scheduler.init_noise_sigma)
    raw = (
        half_raw if draw == "fp16" else _source_noise(reference, draw, seed, device, height, width)
    )
    assert raw.device.type == "cpu" and raw.dtype == torch.float16
    assert torch.equal(raw, _independent_noise(torch, seed, draw, height, width)), (
        "source raw noise differs from independent requested-precision draw"
    )
    raw = raw.to(device)
    if initialization == "invoke":
        selected = _source_add_noise(reference, scheduler, raw)
    elif draw == "fp16":
        selected = native_candidate
    else:
        selected = original(current, **{**values, "latents": raw})
        record["originalNativePreparationCalls"] += 1
    independent_generator = torch.Generator(device="cpu").manual_seed(seed)
    torch.randn(
        (1, 4, height // 8, width // 8), generator=independent_generator, dtype=torch.float16
    )
    assert torch.equal(generator.get_state(), independent_generator.get_state()), (
        "actual private generator must advance by exactly one native FP16 draw in every cell"
    )
    assert _scheduler_state(native, scheduler) == state
    assert torch.equal(
        selected,
        _expected_initial(
            torch, scheduler.sigmas, seed, draw, initialization, device, height, width
        ),
    ), "selected initial latent differs from independent factor oracle"
    record.update(
        draw=draw,
        initialization=initialization,
        seed=seed,
        shape=list(selected.shape),
        device=str(device),
        dtype=str(selected.dtype),
        sourceDefinitions=reference.definitions,
        sourceRawNoise=old._hash(native, raw),
        sourceHalfNoise=old._hash(native, half_raw),
        originalNativeCandidate=old._hash(native, native_candidate),
        selected=old._hash(native, selected),
        selectedCfgBatch=old._hash(native, torch.cat((selected, selected))),
        firstTimestep=float(scheduler.timesteps[0].item()),
        firstSigma=float(scheduler.sigmas[0].item()),
        nativeInitNoiseSigma=float(scheduler.init_noise_sigma.item()),
        privateGeneratorPostState=old._hash(native, generator.get_state()),
        privateGeneratorExactlyOneHalfDraw=True,
        freshSchedulerStateUnchanged=True,
        originalNativeReturnedUnchanged=(selected is native_candidate),
    )
    return selected


@contextmanager
def _initialization_scope(
    native: Any, draw: str, initialization: str, observations: Any, monkeypatch: Any
) -> Generator[None, None, None]:
    assert (draw, initialization) in FACTORS, "unsupported noise factor"
    owner = native.pipeline_class
    original = owner.prepare_latents

    @wraps(original)
    def prepare(current: Any, *args: Any, **kwargs: Any) -> Any:
        bound = inspect.signature(original).bind(current, *args, **kwargs)
        bound.apply_defaults()
        values = dict(bound.arguments)
        assert values.pop("self") is current
        record: dict[str, Any] = {"entered": True}
        observations.append(record)
        assert len(observations) == 1, "one preparation owner per pipeline request"
        return _select_initial(
            native, native.noise_reference, original, current, values, draw, initialization, record
        )

    try:
        with monkeypatch.context() as patch:
            patch.setattr(owner, "prepare_latents", prepare)
            yield
    finally:
        assert owner.prepare_latents is original, "native prepare_latents slot was not restored"


@pytest.fixture
def noise_small(noise_settings: Any) -> Generator[Any, None, None]:
    torch = importlib.import_module("torch")
    diffusers = importlib.import_module("diffusers")
    assert torch.__version__.split("+")[0] == "2.7.1" and diffusers.__version__ == "0.40.0"
    assert torch.cuda.is_available(), "opted-in CUDA checks must not skip"
    previous_threads = torch.get_num_threads()
    torch.set_num_threads(1)
    try:
        with torch.random.fork_rng(devices=[0]), torch.inference_mode():
            yield SimpleNamespace(
                torch=torch,
                diffusers=diffusers,
                pipeline_class=diffusers.StableDiffusionXLPipeline,
                pipeline=object(),
                noise_reference=_reference(torch, noise_settings),
            )
    finally:
        torch.set_num_threads(previous_threads)
        _inputs_unchanged(noise_settings)


def _small_call(
    native: Any,
    device: str,
    seed: int,
    draw: str,
    initialization: str,
    monkeypatch: Any,
    *,
    overrides: Any = None,
) -> Any:
    torch = native.torch
    scheduler = native.diffusers.EulerDiscreteScheduler(
        num_train_timesteps=1000,
        beta_start=0.00085,
        beta_end=0.012,
        beta_schedule="scaled_linear",
        steps_offset=1,
        prediction_type="epsilon",
        rescale_betas_zero_snr=False,
        timestep_spacing="leading",
    )
    scheduler.set_timesteps(30, device=device)
    # Minimal state owner for the actual original method; no model is constructed.
    current = object.__new__(native.pipeline_class)
    object.__setattr__(current, "vae_scale_factor", 8)
    object.__setattr__(current, "scheduler", scheduler)
    values: dict[str, Any] = {
        "batch_size": 1,
        "num_channels_latents": 4,
        "height": 64,
        "width": 64,
        "dtype": torch.float16,
        "device": torch.device(device),
        "generator": torch.Generator(device="cpu").manual_seed(seed),
        "latents": None,
    }
    values.update(overrides or {})
    observations: list[Any] = []
    original = native.pipeline_class.prepare_latents
    cpu_before, cuda_before = torch.random.get_rng_state(), torch.cuda.get_rng_state(0)
    with _initialization_scope(native, draw, initialization, observations, monkeypatch):
        result = native.pipeline_class.prepare_latents(current, **values)
    assert native.pipeline_class.prepare_latents is original
    assert torch.equal(torch.random.get_rng_state(), cpu_before)
    assert torch.equal(torch.cuda.get_rng_state(0), cuda_before)
    assert len(observations) == 1 and observations[0]["privateGeneratorExactlyOneHalfDraw"]
    assert torch.equal(
        result,
        _expected_initial(
            torch, scheduler.sigmas, seed, draw, initialization, torch.device(device), 64, 64
        ),
    )
    if (draw, initialization) == ("fp16", "native"):
        assert observations[0]["originalNativeReturnedUnchanged"]
    return result


@pytest.mark.parametrize("device", ("cpu", "cuda:0"))
@pytest.mark.parametrize("seed", (123, 124))
@pytest.mark.parametrize(("draw", "initialization"), FACTORS)
def test_noise_initialization_matrix(
    noise_small: Any, monkeypatch: Any, device: str, seed: int, draw: str, initialization: str
) -> None:
    _small_call(noise_small, device, seed, draw, initialization, monkeypatch)


def test_noise_draw_reference_red(noise_small: Any, monkeypatch: Any) -> None:
    _small_call(noise_small, "cuda:0", 123, "fp32", "native", monkeypatch)


def test_noise_native_draw_control_green(noise_small: Any, monkeypatch: Any) -> None:
    _small_call(noise_small, "cuda:0", 123, "fp16", "native", monkeypatch)


def test_noise_initialization_reference_red(noise_small: Any, monkeypatch: Any) -> None:
    _small_call(noise_small, "cuda:0", 124, "fp16", "invoke", monkeypatch)


def test_noise_native_initialization_control_green(noise_small: Any, monkeypatch: Any) -> None:
    _small_call(noise_small, "cuda:0", 124, "fp16", "native", monkeypatch)


@pytest.mark.parametrize("bad", ("factor", "shape", "dtype", "latents", "batch"))
def test_noise_invalid_inputs_restore_before_consumption(
    noise_small: Any, monkeypatch: Any, bad: str
) -> None:
    native, torch = noise_small, noise_small.torch
    original = native.pipeline_class.prepare_latents
    changes = {
        "shape": {"height": 63},
        "dtype": {"dtype": torch.float32},
        "latents": {"latents": torch.zeros(1)},
        "batch": {"batch_size": 2},
    }
    cpu, cuda = torch.random.get_rng_state(), torch.cuda.get_rng_state(0)
    with pytest.raises(AssertionError):
        _small_call(
            native,
            "cuda:0",
            123,
            "bad" if bad == "factor" else "fp16",
            "native",
            monkeypatch,
            overrides=changes.get(bad),
        )
    assert native.pipeline_class.prepare_latents is original
    assert torch.equal(torch.random.get_rng_state(), cpu)
    assert torch.equal(torch.cuda.get_rng_state(0), cuda)
    _small_call(native, "cuda:0", 123, "fp16", "native", monkeypatch)


def test_noise_initializer_failure_restores_then_recovers(
    noise_small: Any, monkeypatch: Any
) -> None:
    native, torch = noise_small, noise_small.torch
    original = native.pipeline_class.prepare_latents
    cpu, cuda = torch.random.get_rng_state(), torch.cuda.get_rng_state(0)
    sentinel = RuntimeError("declared source initializer failure")

    def refused(*args: Any, **kwargs: Any) -> Any:
        raise sentinel

    with monkeypatch.context() as patch:
        patch.setattr(sys.modules[__name__], "_source_add_noise", refused)
        with pytest.raises(RuntimeError) as error:
            _small_call(native, "cuda:0", 123, "fp16", "invoke", monkeypatch)
        assert error.value is sentinel
    assert native.pipeline_class.prepare_latents is original
    assert torch.equal(torch.random.get_rng_state(), cpu)
    assert torch.equal(torch.cuda.get_rng_state(0), cuda)
    _small_call(native, "cuda:0", 123, "fp16", "invoke", monkeypatch)


@pytest.fixture(scope="module")
def noise_native(noise_settings: Any) -> Generator[Any, None, None]:
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(old, "RUN", RUN)
        patch.setattr(old, "_inputs_unchanged", _inputs_unchanged)
        builder = old.visual.__wrapped__(noise_settings)
        native = next(builder)
        try:
            native.pipeline_class = type(native.pipeline)
            native.noise_reference = _reference(native.torch, noise_settings)
            native.baseline_initials = {
                seed: {"sample": row["steps"][0]["sample"], "batch": row["scales"][0]["input"]}
                for seed, row in noise_settings.noise.baselines.items()
            }
            for baseline in noise_settings.noise.baselines.values():
                old._equal(
                    native.framework_sources,
                    baseline["frameworkSourceSha256"],
                    "current runtime/config differs from reused baseline",
                )
            yield native
        finally:
            del native.noise_reference
            try:
                next(builder)
            except StopIteration:
                pass
            else:
                raise AssertionError("the native fixture yielded twice")


def _expected_record(settings: Any, name: str) -> Any:
    selected = settings.noise
    assert selected.expected and selected.expected_sha
    digest = (
        json.loads(selected.expected_sha)[name]
        if selected.expected_sha.startswith("{")
        else selected.expected_sha
    )
    _, row = _json(Path(selected.expected.format(case=name)), digest)
    if "cases" in row:
        row = row["cases"][name]
    assert row["schema"] == SCHEMA and row["case"] == name and row["status"] == "passed"
    assert row["harnessSha256"] == selected.pinned[SELF]
    assert row["experimentContractSha256"] == old._sha(selected.contract_raw)
    assert row["qualificationManifestSha256"] == old._sha(selected.qualification_raw)
    return row


def _run_case(native: Any, name: str, monkeypatch: Any) -> None:
    assert name in FRESH
    settings, started = native.main, time.monotonic()
    seed_text, draw, initialization = name.split("-")
    seed = int(seed_text[4:])
    selected = settings.noise
    report: dict[str, Any] = {
        "schema": SCHEMA,
        "base": BASE,
        "case": name,
        "seed": seed,
        "draw": draw,
        "initialization": initialization,
        "status": "incomplete",
        "mechanicalStatus": "incomplete",
        "visualStatus": "pending",
        "harnessSha256": selected.pinned[SELF],
        "experimentContractSha256": old._sha(selected.contract_raw),
        "qualificationManifestSha256": old._sha(selected.qualification_raw),
        "recipeFileSha256": settings.sha256,
        "sourceSha256": settings.sources,
        "frameworkSourceSha256": native.framework_sources,
        "checkpointSha256": old.trained.SOURCE_SHA,
        "checkpointBytes": old.trained.SOURCE_BYTES,
        "mainInputReuse": "historical genuine full Main swapped handoff; not freshly produced",
        "baselineReuse": selected.contract["historicalBaselines"][str(seed)],
        "noiseInitialization": [],
    }
    case = text = seen = assembly = None
    native.torch.cuda.reset_peak_memory_stats(0)
    try:
        if settings.mode == "verify":
            _expected_record(settings, name)
        old_label = settings.label
        settings.label = f"{old_label[:32]}-{draw}-{initialization}"
        try:
            case = old._case(native, f"seed{seed}-swapped")
        finally:
            settings.label = old_label
        assert case.command.seed == seed and case.command.steps == 30
        assert case.variant == "swapped" and len(case.recipe["regions"]) == 2
        report["outputPath"] = str(case.command.output_path)
        recipe_before, command_before = copy.deepcopy(case.recipe), copy.deepcopy(case.command)
        target_before = case.target.read_bytes()

        def literal(current_native: Any, current_case: Any) -> Any:
            result = _literal_schedule(current_native, current_case)
            sigmas = native.torch.tensor(result.sigmas, dtype=native.torch.float32)
            expected = _expected_initial(
                native.torch,
                sigmas,
                seed,
                draw,
                initialization,
                native.torch.device("cuda:0"),
                1024,
                1024,
            )
            result.initial = old._hash(native, expected)
            return result

        with old._original_preserved(native, report):
            try:
                with old._original_observers(native, case, monkeypatch) as observations:
                    text, seen, assembly = observations
                    with (
                        monkeypatch.context() as patch,
                        _initialization_scope(
                            native, draw, initialization, report["noiseInitialization"], monkeypatch
                        ),
                    ):
                        patch.setattr(old.sampling, "_literal_schedule", literal)
                        assert selected.fresh_calls < 6
                        selected.fresh_calls += 1
                        receipt = native.output.generate_current_canvas_regional_txt2img(
                            case.recipe, command=case.command, **case.args
                        )
                old.sampling._raw(native, text, seen, report)
                old.sampling._png(native, case, seen, receipt, report)
                previous._snapshot_image(native, case, seen, report)
                report["actualPublicationCompleted"] = True
                old._assert_text(native, case, text, assembly, report)
                with monkeypatch.context() as patch:
                    patch.setattr(old.sampling, "_literal_schedule", literal)
                    old._assert_native(native, case, seen, report)
                assert len(report["noiseInitialization"]) == 1
                initial = report["noiseInitialization"][0]
                assert initial["selected"] == seen.steps[0]["sample"]
                assert initial["selectedCfgBatch"] == seen.scales[0]["input"]
                assert initial["originalNativeCandidateMatchesReusedStartBeforeIntervention"]
                baseline = selected.baselines[str(seed)]
                for field in ("expected", "encodingCounts", "actualClipAliases"):
                    old._equal(
                        report[field], baseline[field], f"fixed conditioning differs: {field}"
                    )
                for field in ("grid", "sigmas", "beta", "alpha"):
                    old._equal(
                        report["literalTimeline"][field],
                        baseline["literalTimeline"][field],
                        f"fixed schedule differs: {field}",
                    )
                assert initial["originalNativeCandidate"] == baseline["steps"][0]["sample"]
                report["nativePreparationSlotRestored"] = True
                if settings.mode == "verify":
                    expected_record = _expected_record(settings, name)
                    for field in (
                        "roots",
                        "scales",
                        "steps",
                        "sites",
                        "decodes",
                        "predictions",
                        "nativeImage",
                        "rgb",
                        "noiseInitialization",
                    ):
                        old._equal(
                            report[field], expected_record[field], f"own replay differs: {field}"
                        )
            finally:
                old._equal(case.recipe, recipe_before, "complete Main recipe changed")
                assert case.command == command_before
                old._equal(case.target.read_bytes(), target_before, "target changed")
        _inputs_unchanged(settings)
        old._equal(old._framework_sources(native), native.framework_sources, "framework changed")
        report.update(status="passed", mechanicalStatus="passed", actualNativeCalls=len(seen.calls))
        selected.records[name] = report
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
            report["elapsedSeconds"] = round(time.monotonic() - started, 6)
            native.torch.cuda.synchronize(0)
            report["cudaPeakAllocatedBytes"] = native.torch.cuda.max_memory_allocated(0)
            report["cudaPeakReservedBytes"] = native.torch.cuda.max_memory_reserved(0)
            with (RUN / f"{settings.label}-{name}.json").open("x") as stream:
                json.dump(report, stream, indent=2, allow_nan=False)
                stream.write("\n")
        finally:
            if text is not None:
                cast(dict[str, Any], vars(text)).clear()
            if seen is not None:
                cast(dict[str, Any], vars(seen)).clear()
            case = text = seen = assembly = None
            gc.collect()


@pytest.mark.parametrize("name", FRESH)
def test_trained_noise_initialization(noise_native: Any, monkeypatch: Any, name: str) -> None:
    _run_case(noise_native, name, monkeypatch)


def test_recorded_noise_initialization_matrix(noise_settings: Any) -> None:
    """Zero-model eight-cell comparison; historical controls are not fresh calls."""
    settings, selected = noise_settings, noise_settings.noise
    rows: dict[str, Any] = {
        name: selected.records.get(name) or _expected_record(settings, name) for name in FRESH
    }
    for seed, row in selected.baselines.items():
        rows[f"seed{seed}-fp16-native"] = row
    image_type = importlib.import_module("PIL.Image")
    np = importlib.import_module("numpy")
    rgb: dict[str, Any] = {}
    cells: dict[str, Any] = {}
    for seed in (123, 124):
        baseline = selected.baselines[str(seed)]
        for draw, initialization in FACTORS:
            name = f"seed{seed}-{draw}-{initialization}"
            row = rows[name]
            reused = (draw, initialization) == ("fp16", "native")
            descriptor = selected.contract["historicalBaselines"][str(seed)]
            path = Path(descriptor["png"] if reused else row["outputPath"])
            assert old._sha(path.read_bytes()) == row["png"]
            with image_type.open(path) as image:
                image.load()
                assert image.mode == "RGB" and image.size == (1024, 1024)
                assert old._sha(image.tobytes()) == row["rgb"]
                rgb[name] = np.array(image)
            for field in (
                "expected",
                "encodingCounts",
                "actualClipAliases",
                "frameworkSourceSha256",
            ):
                old._equal(
                    row[field], baseline[field], f"matrix fixed input differs: {name}/{field}"
                )
            for field in ("grid", "sigmas", "beta", "alpha"):
                old._equal(
                    row["literalTimeline"][field],
                    baseline["literalTimeline"][field],
                    f"matrix schedule differs: {name}/{field}",
                )
            cells[name] = {
                "seed": seed,
                "draw": draw,
                "initialization": initialization,
                "historicalReused": reused,
                "freshNativeCalls": 0 if reused else row["actualNativeCalls"],
                "outputPath": str(path),
                "png": row["png"],
                "rgb": row["rgb"],
                "nativeImage": row["nativeImage"],
                "initialLatent": row["steps"][0]["sample"],
                "nativePtRms": None,
                "nativePtRmsReason": (
                    "not inferred from hashes; seed123 baseline has no raw PT snapshot"
                ),
                "visualStatus": "pending",
            }
    contrasts: list[Any] = []
    for seed in (123, 124):
        pairs = [
            (f"seed{seed}-fp16-{initialization}", f"seed{seed}-fp32-{initialization}", "draw")
            for initialization in ("native", "invoke")
        ] + [
            (f"seed{seed}-{draw}-native", f"seed{seed}-{draw}-invoke", "initialization")
            for draw in ("fp16", "fp32")
        ]
        for left, right, factor in pairs:
            delta = rgb[right].astype(np.int16) - rgb[left].astype(np.int16)
            changed_steps = [
                index
                for index, (a, b) in enumerate(
                    zip(rows[left]["predictions"], rows[right]["predictions"], strict=True), 1
                )
                if a != b
            ]
            contrasts.append(
                {
                    "left": left,
                    "right": right,
                    "changedFactor": factor,
                    "firstDifferentPredictionStep": changed_steps[0] if changed_steps else None,
                    "changedPredictionSteps": changed_steps,
                    "changedRgbChannels": int(np.count_nonzero(delta)),
                    "changedRgbPixels": int(np.count_nonzero(np.any(delta != 0, axis=2))),
                    "rgbMaxAbs": int(np.abs(delta).max()),
                    "rgbMeanAbs": float(np.abs(delta).mean(dtype=np.float64)),
                    "rgbRms": float(np.sqrt(np.square(delta.astype(np.float64)).mean())),
                }
            )
    assert len(cells) == 8 and sum(row["freshNativeCalls"] for row in cells.values()) == 6
    summary = {
        "schema": "regional-noise-initialization-matrix-v1",
        "status": "measured",
        "harnessSha256": selected.pinned[SELF],
        "base": BASE,
        "experimentContractSha256": old._sha(selected.contract_raw),
        "cases": cells,
        "contrasts": contrasts,
        "freshNativeCalls": 6,
        "historicalBaselineCells": 2,
        "actualNativeCallsThisSelection": 0,
        "visualStatus": "pending",
        "scope": "fixed swapped inputs; no assignment-swapped or general quality qualification",
    }
    with (RUN / f"{settings.label}-matrix.json").open("x") as stream:
        json.dump(summary, stream, indent=2, allow_nan=False)
        stream.write("\n")
    _inputs_unchanged(settings)
