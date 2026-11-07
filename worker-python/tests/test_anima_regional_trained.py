"""Opt-in original-Anima trained regional mechanics; ROOT owns native execution.

The current Invoke a61ac4fb regional_prompting/conditioning_data and the caller in
app/invocations/anima/anima_denoise.py define the mask/stream contract. This suite
uses the existing Studio loader, Euler loop, native Cosmos processors and Wan.
It does not implement a sampler or classify visual quality. A loading witness
compares every unchanged native converter output with its installed live value;
it does not independently requalify the converter's mapping algorithm.

IGS_ANIMA_TRAINED_RUN enables this suite. BUNDLE defaults to RUN/bundle-input.json.
MODE is record or verify; LABEL is a fresh ASCII label. Verify requires EXPECTED
(supports {case}) and EXPECTED_SHA256 (scalar or JSON case-to-digest map).
MUTATION=association permits only anima_regional.py to differ from pinned source.
ROOT supplies a short TMPDIR and serial 12 GiB/zero-swap/600-second units. Nothing
here provisions, copies, downloads, repairs or discovers model weights.
"""

from __future__ import annotations

import copy
import hashlib
import importlib
import json
import math
import os
import re
import subprocess
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from functools import wraps
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

import pytest
from PIL import Image

_ROOT = Path(__file__).resolve().parents[2]
_PREFIX = "IGS_ANIMA_TRAINED_"
_LIMIT = 1_048_576
_COUNTS = {"transformer": 567, "text_conditioner": 118, "qwen3_encoder": 310, "vae": 194}
_SOURCE_FILES = (
    "worker-python/tests/test_anima_regional_trained.py",
    "worker-python/src/imagegen_worker/anima_regional.py",
    "worker-python/src/imagegen_worker/anima_conditioning.py",
    "worker-python/src/imagegen_worker/anima_euler.py",
    "worker-python/src/imagegen_worker/anima_flow_sampling.py",
    "worker-python/src/imagegen_worker/inference_anima.py",
    "worker-python/src/imagegen_worker/anima_tokenizers.py",
    "worker-python/src/imagegen_worker/generation_artifacts.py",
    "src/main/projects/test-fixtures/anima-regional-input.ts",
    "src/main/projects/project-current-canvas-anima-regional-input.ts",
    "src/main/projects/project-current-canvas-regional-recipe.ts",
    "src/shared/projects/anima-prompt-weighting.ts",
    "src/shared/projects/anima-flow-sampling-plan.ts",
)
_CASES = ("pilot", "base", "swapped", "zero", "repeat", "changed-seed")


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _file_sha(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        while block := stream.read(2 * 1024 * 1024):
            result.update(block)
    return result.hexdigest()


def _write_json(path: Path, value: Any) -> None:
    with path.open("x") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")


def _tensor_chunks(value: Any) -> Iterator[Any]:
    """Bound conversion scratch even for a converter's noncontiguous view."""
    if value.is_contiguous():
        flat = value.detach().view(-1)
        for start in range(0, flat.numel(), _LIMIT):
            yield flat[start : start + _LIMIT]
    elif value.numel() <= _LIMIT:
        yield value.detach().contiguous().view(-1)
    else:
        assert value.ndim > 0
        for row in value:
            yield from _tensor_chunks(row)


def _tensor_sha(value: Any, torch: Any, *, dtype: Any = None) -> str:
    result = hashlib.sha256()
    for chunk in _tensor_chunks(value):
        cpu = chunk.to(device="cpu", dtype=value.dtype if dtype is None else dtype)
        raw = cpu.contiguous().view(torch.uint8).numpy()
        result.update(memoryview(raw))
    return result.hexdigest()


def _tensor_record(value: Any, torch: Any, *, dtype: Any = None) -> dict[str, Any]:
    return {
        "shape": list(value.shape),
        "dtype": str(value.dtype if dtype is None else dtype),
        "sha256": _tensor_sha(value, torch, dtype=dtype),
    }


def _pins() -> dict[str, str]:
    return {name: _file_sha(_ROOT / name) for name in _SOURCE_FILES}


@dataclass
class _Session:
    run: Path
    label: str
    mode: str
    files: dict[str, dict[str, Any]]
    torch: Any
    diffusers: Any
    models: Any
    tokenizers: Any
    runtime: Any
    bundle: Any
    loading: dict[str, Any]
    handoffs: dict[str, dict[str, Any]] = field(default_factory=dict)

    def report_path(self, case: str) -> Path:
        return self.run / f"{self.label}-{case}.json"


@pytest.fixture(scope="module")
def trained() -> Generator[_Session]:
    enabled = os.environ.get(_PREFIX + "RUN")
    if not enabled:
        pytest.skip("Opt-in trained Anima requires ROOT's exact bundle and resource envelope.")
    run = Path(enabled)
    assert run.is_absolute() and run.resolve() == run and run.is_dir()
    label = os.environ.get(_PREFIX + "LABEL", "record")
    assert re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", label)
    mode = os.environ.get(_PREFIX + "MODE", "record")
    assert mode in ("record", "verify")
    assert os.environ.get(_PREFIX + "MUTATION", "") in ("", "association")
    bundle_path = Path(os.environ.get(_PREFIX + "BUNDLE", str(run / "bundle-input.json")))
    files = cast(dict[str, dict[str, Any]], json.loads(bundle_path.read_text()))
    assert set(files) == {"checkpoint", "qwen3Encoder", "vae"}
    for value in files.values():
        assert set(value) >= {"path", "sha256", "byteSize"}
        path = Path(value["path"])
        assert path.is_absolute() and path.resolve() == path and not path.is_symlink()
        assert path.stat().st_size == value["byteSize"]
    torch = pytest.importorskip("torch")
    diffusers = pytest.importorskip("diffusers")
    assert torch.cuda.is_available() and torch.cuda.is_bf16_supported(including_emulation=False)
    torch.set_num_threads(2)
    torch.cuda.set_per_process_memory_fraction(0.75, 0)
    loader = importlib.import_module("imagegen_worker.inference_anima")
    tokenizer_module = importlib.import_module("imagegen_worker.anima_tokenizers")
    inference = importlib.import_module("imagegen_worker.inference")

    def model_file(key: str) -> Any:
        entry = files[key]
        return loader.AnimaModelFile(Path(entry["path"]), entry["sha256"], entry["byteSize"])

    bundle = loader.AnimaModelBundle(
        model_file("checkpoint"), model_file("qwen3Encoder"), model_file("vae")
    )
    original = loader._convert_state
    expected: dict[str, dict[str, Any]] = {}
    source_counts: dict[str, int] = {}

    @wraps(original)
    def converted(role: str, state: dict[str, Any], converters: Any) -> Any:
        actual = original(role, state, converters)
        first = next(iter(state.values()))
        if torch.is_tensor(first):
            source_counts[role] = len(state)
            for component, tensors in actual.items():
                assert component not in expected
                assert len(tensors) == _COUNTS[component]
                expected[component] = {
                    key: _tensor_record(tensor, torch, dtype=torch.bfloat16)
                    for key, tensor in tensors.items()
                }
        return actual

    # Only the existing converter boundary is observed; original results are returned.
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(loader, "_convert_state", converted)
        models = loader.load_anima_models(bundle, device="cuda:0", dtype=torch.bfloat16)
    assert set(expected) == set(_COUNTS)
    live: dict[str, dict[str, Any]] = {}
    for component, count in _COUNTS.items():
        model = getattr(models, component)
        state = model.state_dict()
        assert len(state) == count and set(state) == set(expected[component])
        live[component] = {}
        for key, tensor in state.items():
            assert tensor.device == torch.device("cuda:0") and tensor.dtype == torch.bfloat16
            observed = _tensor_record(tensor, torch)
            assert observed == expected[component][key], (component, key)
            live[component][key] = observed
    assert len(models.transformer.transformer_blocks) == 28
    assert models.transformer.config.num_attention_heads == 16
    assert models.transformer.config.attention_head_dim == 128
    loading = {
        "claim": "All unchanged native converter destinations are installed exactly",
        "sourceCounts": source_counts,
        "destinationCounts": _COUNTS,
        "expectedConverted": expected,
        "liveInstalled": live,
        "bundle": files,
        "trainedQuality": "not-qualified",
    }
    _write_json(run / f"{label}-loading.json", loading)
    session = _Session(
        run,
        label,
        mode,
        files,
        torch,
        diffusers,
        models,
        tokenizer_module.load_anima_tokenizers(),
        inference.MLRuntime(torch, diffusers, None),
        bundle,
        loading,
    )
    yield session


def _handoff(session: _Session, case: str) -> dict[str, Any]:
    variant = "base" if case in ("pilot", "base", "repeat", "changed-seed") else case
    width, height, steps = (104, 72, 2) if case == "pilot" else (512, 512, 20)
    seed = 124 if case == "changed-seed" else 123
    key = f"{variant}-{width}-{height}-{seed}"
    if key not in session.handoffs:
        root = session.run / "payloads" / f"{session.label}-main-{key}"
        options = {
            "variant": variant,
            "seed": seed,
            "width": width,
            "height": height,
            "steps": steps,
            "guidanceScale": 4,
            "trainedBundle": {
                role: {key: value[key] for key in ("path", "sha256", "byteSize")}
                for role, value in session.files.items()
            },
        }
        source = (
            "import {produceAnimaRegionalInputFixture as produce} from "
            "'./src/main/projects/test-fixtures/anima-regional-input.ts';"
            "void produce("
            + json.dumps(str(root))
            + ","
            + json.dumps(options)
            + ").then(x=>process.stdout.write(JSON.stringify(x)))"
            ".catch(e=>{console.error(e);process.exitCode=1});"
        )
        value = json.loads(
            subprocess.check_output(
                [str(_ROOT / "node_modules/.bin/tsx"), "-e", source], cwd=_ROOT, text=True
            )
        )
        assert value["durablePreservation"]["modelMetadataOnly"] is False
        verified = value["verifiedBundle"]
        assert verified["architecture"] == "anima-base-1.0"
        saved = value["authoredDocument"]["generationDraft"]["model"]
        assert verified["checkpoint"]["reference"] == saved
        assert saved["fileSha256"] == session.files["checkpoint"]["sha256"]
        assert (saved["civitaiModelId"], saved["civitaiVersionId"], saved["civitaiFileId"]) == (
            1147756,
            3120487,
            3000817,
        )
        for role in session.files:
            expected = session.files[role]
            actual = verified[role]
            assert actual["managedPath"] == expected["path"]
            assert actual["byteSize"] == expected["byteSize"]
            assert (
                actual["reference"]["fileSha256"] if role == "checkpoint" else actual["sha256"]
            ) == expected["sha256"]
        assert value["sampling"]["steps"] == steps
        assert value["sampling"]["guidanceScale"] == 4
        assert value["sampling"]["seed"] == seed
        assert value["recipe"]["family"] == "anima"
        assert len(value["recipe"]["regions"]) == (0 if variant == "zero" else 2)
        session.handoffs[key] = value
    return copy.deepcopy(session.handoffs[key])


def _command(session: _Session, handoff: dict[str, Any], name: str) -> Any:
    protocol = importlib.import_module("imagegen_worker.protocol")
    conditioning = importlib.import_module("imagegen_worker.anima_conditioning")
    sampling = importlib.import_module("imagegen_worker.anima_flow_sampling")
    derivatives = importlib.import_module("imagegen_worker.derivatives")
    root = session.run / "payloads" / f"{session.label}-{name}-output"
    root.mkdir(parents=True, mode=0o700, exist_ok=False)
    bbox = copy.deepcopy(handoff["recipe"]["bbox"])
    target = root / "target.png"
    Image.new("RGBA", (bbox["width"], bbox["height"]), (17, 53, 91, 0)).save(
        target, format="PNG", icc_profile=derivatives.SRGB_ICC_PROFILE
    )
    prompts = handoff["compiledPrompts"]
    return protocol.GenerateAnimaTxt2ImgCommand(
        bundle=session.bundle,
        positive_prompt=conditioning.validate_compiled_anima_prompt(prompts[0]["prompt"]),
        negative_prompt=conditioning.validate_compiled_anima_prompt(prompts[1]["prompt"]),
        sampling=sampling.validate_anima_flow_sampling_plan(handoff["sampling"]),
        loras=(),
        request_id=str(uuid4()),
        target_path=target,
        target_sha256=_file_sha(target),
        target_byte_size=target.stat().st_size,
        width=bbox["width"],
        height=bbox["height"],
        bbox=bbox,
        staging_root=root,
        output_path=root / "output.png",
    )


def _modules(session: _Session) -> Iterator[tuple[str, Any]]:
    for role in _COUNTS:
        yield from (
            (f"{role}.{name}", module)
            for name, module in getattr(session.models, role).named_modules()
        )


def _metadata(session: _Session) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for name, module in _modules(session):
        state = cast(dict[str, Any], vars(module))
        result[name] = {
            "moduleId": id(module),
            "keys": sorted(state),
            "training": module.training,
            "registries": {
                kind: (id(registry), tuple((key, id(value)) for key, value in registry.items()))
                for kind in ("_modules", "_parameters", "_buffers")
                for registry in (getattr(module, kind),)
            },
            "hooks": {
                key: (id(cast(dict[str, Any], value)), tuple(cast(dict[str, Any], value).items()))
                for key, value in state.items()
                if key.startswith(("_forward_", "_backward_")) and isinstance(value, dict)
            },
            "processorId": id(getattr(module, "processor", None)),
            "forwardClassId": id(cast(Any, type(module)).forward),
        }
    for role in _COUNTS:
        config = getattr(session.models, role).config
        result[role + ".config"] = copy.deepcopy(
            config.to_dict() if hasattr(config, "to_dict") else dict(config)
        )
    result["tokenizers"] = [
        {
            "wrapperId": id(tokenizer),
            "backendId": id(tokenizer.backend_tokenizer),
            "backend": tokenizer.backend_tokenizer.to_str(),
            "keys": sorted(cast(dict[str, Any], vars(tokenizer))),
            "init": copy.deepcopy(tokenizer.init_kwargs),
            "special": copy.deepcopy(tokenizer.special_tokens_map),
        }
        for tokenizer in (session.tokenizers.qwen3, session.tokenizers.t5)
    ]
    vae = session.models.vae
    result["wan"] = {
        name: (
            id(cast(dict[str, Any], vars(vae))[name]),
            repr(cast(dict[str, Any], vars(vae))[name]),
        )
        for name in (
            "_conv_num",
            "_conv_idx",
            "_feat_map",
            "_enc_conv_num",
            "_enc_conv_idx",
            "_enc_feat_map",
        )
        if name in vars(vae)
    }
    result["tiling"] = vae.use_tiling
    regional = importlib.import_module("imagegen_worker.anima_regional")
    result["modelOwners"] = set(regional._MODEL_OWNERS)
    result["attentionOwners"] = set(regional._ATTENTION_OWNERS)
    return result


def _registered_state(session: _Session) -> dict[str, Any]:
    state: dict[str, Any] = {}
    for name, module in _modules(session):
        for kind in ("_parameters", "_buffers"):
            for key, value in getattr(module, kind).items():
                if value is None:
                    continue
                state[f"{name}.{kind}.{key}"] = {
                    "id": id(value),
                    "storage": value.untyped_storage().data_ptr(),
                    "offset": value.storage_offset(),
                    "stride": tuple(value.stride()),
                    "device": str(value.device),
                    "requiresGrad": value.requires_grad,
                    **_tensor_record(value, session.torch),
                }
    return state


@contextmanager
def _preserved(session: _Session, evidence: dict[str, Any]) -> Generator[None]:
    torch = session.torch
    before = _registered_state(session)
    metadata = _metadata(session)
    cpu_rng = _tensor_sha(torch.random.get_rng_state(), torch)
    cuda_rng = _tensor_sha(torch.cuda.get_rng_state(0), torch)
    try:
        yield
    finally:
        after = _registered_state(session)
        assert before == after, "Borrowed trained registered values/storage/metadata changed"
        assert metadata == _metadata(session), "Borrowed native ownership/config/tokenizer changed"
        assert cpu_rng == _tensor_sha(torch.random.get_rng_state(), torch)
        assert cuda_rng == _tensor_sha(torch.cuda.get_rng_state(0), torch)
        evidence["borrowedPreserved"] = True
        framed = hashlib.sha256()
        for key, value in sorted(before.items()):
            framed.update(key.encode() + b"\0" + value["sha256"].encode() + b"\n")
        evidence["registeredStateSha256"] = framed.hexdigest()
        evidence["registeredTensors"] = len(before)


def _active_regions(handoff: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        region
        for region in handoff["recipe"]["regions"]
        if region["positive"] is not None and region["positive"]["text"] != ""
    ]


def _mask_oracle(handoff: dict[str, Any], torch: Any) -> Any:
    regions = _active_regions(handoff)
    if not regions:
        return None
    bbox = handoff["recipe"]["bbox"]
    width, height = bbox["width"], bbox["height"]
    grid_w, grid_h = math.ceil(width / 16), math.ceil(height / 16)
    # Integer source indexing independently specifies tensor NEAREST, not PIL.
    rows: list[list[bool]] = []
    for y in range(grid_h):
        for x in range(grid_w):
            source = (y * height // grid_h) * width + x * width // grid_w
            eligible = [region["coverage"]["alpha"][source] >= 128 for region in regions]
            row = [not any(eligible)] * 512
            for value in eligible:
                row.extend([value] * 512)
            rows.append(row)
    return torch.tensor(rows, dtype=torch.bool, device="cuda:0").view(
        1, 1, grid_h * grid_w, 512 * (1 + len(regions))
    )


def _context_oracle(session: _Session, handoff: dict[str, Any]) -> tuple[Any, Any]:
    module = importlib.import_module("imagegen_worker.anima_conditioning")
    tokenizer_module = importlib.import_module("imagegen_worker.anima_tokenizers")
    tokenizers = tokenizer_module.load_anima_tokenizers()
    prompts = handoff["compiledPrompts"]
    pair = module.encode_anima_conditioning_pair(
        prompts[0]["prompt"], prompts[1]["prompt"], session.models, tokenizers=tokenizers
    )
    contexts = [pair.positive.embeddings]
    owners = {region["regionId"] for region in _active_regions(handoff)}
    for record in prompts[2:]:
        if record["sourceId"] in owners:
            contexts.append(
                module.encode_anima_prompt(
                    record["prompt"], session.models, tokenizers=tokenizers
                ).embeddings
            )
    assert all(tuple(context.shape) == (1, 512, 1024) for context in contexts)
    return session.torch.cat(contexts, dim=1), pair.negative.embeddings


class _Sentinel(RuntimeError):
    pass


@dataclass
class _Observation:
    passes: list[dict[str, Any]] = field(default_factory=list)
    sites: list[dict[str, Any]] = field(default_factory=list)
    dispatch: list[dict[str, Any]] = field(default_factory=list)
    sdpa: list[dict[str, Any]] = field(default_factory=list)
    qwen: int = 0
    conditioner: int = 0
    tokenizer_calls: int = 0
    borrowed_tokenizer_used: bool = False
    decoded: Any = None
    decode_input_sha256: str | None = None
    terminal_sha256: str | None = None
    numerical_mismatches: list[str] = field(default_factory=list)
    sentinel: _Sentinel = field(default_factory=lambda: _Sentinel("trained controlled failure"))


@contextmanager
def _observed(
    session: _Session,
    handoff: dict[str, Any],
    command: Any,
    expected_contexts: tuple[Any, Any],
    *,
    fault: str | None = None,
) -> Generator[_Observation]:
    torch = session.torch
    models = session.models
    cosmos = importlib.import_module("diffusers.models.transformers.transformer_cosmos")
    regional = importlib.import_module("imagegen_worker.anima_regional")
    expected_mask = _mask_oracle(handoff, torch)
    expected_mask_sha = None if expected_mask is None else _tensor_sha(expected_mask, torch)
    observed = _Observation()
    active: int | None = None
    tag: tuple[int, str] | None = None
    sites = {
        id(getattr(block, kind)): (index, "cross" if kind == "attn2" else "self")
        for index, block in enumerate(models.transformer.transformer_blocks)
        for kind in ("attn1", "attn2")
    }
    original_transformer: Any = cast(Any, type(models.transformer)).forward
    original_qwen: Any = cast(Any, type(models.qwen3_encoder)).forward
    original_conditioner: Any = cast(Any, type(models.text_conditioner)).forward
    original_processor = cosmos.CosmosAttnProcessor2_0.__call__
    original_dispatch = cosmos.dispatch_attention_fn
    original_sdpa = torch.nn.functional.scaled_dot_product_attention
    original_decode: Any = cast(Any, type(models.vae)).decode
    original_publish = regional.publish_generation_image
    sigmas = command.sampling.sigmas
    height, width = command.height // 8, command.width // 8
    generator = torch.Generator(device="cpu").manual_seed(command.sampling.seed)
    next_latent = torch.randn(
        (1, 16, 1, height, width), generator=generator, device="cpu", dtype=torch.float32
    ).to(dtype=torch.bfloat16)
    current_latent: Any = None
    conditional: Any = None
    context_hashes = [_tensor_sha(value, torch) for value in expected_contexts]

    def mask_record(mask: Any, *, expected: Any) -> dict[str, Any]:
        if mask is None:
            return {"sha256": None, "exact": expected is None}
        # Current native Cosmos receives Boolean regional masks. Preserve every
        # native byte's digest, while comparing with an independent permission.
        return {
            "sha256": _tensor_sha(mask, torch),
            "exact": expected is not None
            and mask.dtype == torch.bool
            and tuple(mask.shape) == tuple(expected.shape)
            and bool(torch.equal(mask, expected)),
        }

    def expected_at_site() -> Any:
        assert active is not None and tag is not None
        positive = active % 2 == 0
        return expected_mask if positive and tag[1] == "cross" and tag[0] % 2 == 0 else None

    @wraps(original_qwen)
    def qwen(self: Any, *args: Any, **kwargs: Any) -> Any:
        if self is models.qwen3_encoder:
            observed.qwen += 1
        return original_qwen(self, *args, **kwargs)

    @wraps(original_conditioner)
    def conditioner(self: Any, *args: Any, **kwargs: Any) -> Any:
        if self is models.text_conditioner:
            observed.conditioner += 1
        return original_conditioner(self, *args, **kwargs)

    @wraps(original_transformer)
    def transformer(self: Any, *args: Any, **kwargs: Any) -> Any:
        nonlocal active, next_latent, current_latent, conditional
        if self is not models.transformer:
            return original_transformer(self, *args, **kwargs)
        previous = active
        active = len(observed.passes)
        positive, step = active % 2 == 0, active // 2
        latent = kwargs["hidden_states"].detach().cpu()[..., :height, :width].contiguous()
        timestep = float(kwargs["timestep"][0].item())
        expected_timestep = float(torch.tensor(sigmas[step], dtype=torch.bfloat16).item())
        context_sha = _tensor_sha(kwargs["encoder_hidden_states"], torch)
        record: dict[str, Any] = {
            "step": step + 1,
            "role": "positive" if positive else "negative",
            "sigma": timestep,
            "inputLatentSha256": _tensor_sha(latent, torch),
            "contextSha256": context_sha,
            "contextExact": context_sha == context_hashes[0 if positive else 1],
        }
        observed.passes.append(record)
        if timestep != expected_timestep:
            observed.numerical_mismatches.append(f"sigma:{active}")
        if not bool(torch.equal(latent, next_latent if positive else current_latent)):
            observed.numerical_mismatches.append(f"Euler input:{active}")
        try:
            actual = original_transformer(self, *args, **kwargs)
            prediction = actual.sample.detach().cpu()[..., :height, :width].contiguous()
            record["predictionSha256"] = _tensor_sha(prediction, torch)
            if positive:
                current_latent, conditional = latent, prediction.float()
            else:
                guided = prediction.float() + command.sampling.guidance_scale * (
                    conditional - prediction.float()
                )
                next_latent = (
                    current_latent.float() + (sigmas[step + 1] - sigmas[step]) * guided
                ).to(dtype=torch.bfloat16)
                record["expectedNextLatentSha256"] = _tensor_sha(next_latent, torch)
                observed.terminal_sha256 = record["expectedNextLatentSha256"]
            if fault == "late-step" and positive and step == 14:
                raise observed.sentinel
            return actual
        finally:
            active = previous

    @wraps(original_processor)
    def processor(
        self: Any,
        attention: Any,
        hidden_states: Any,
        encoder_hidden_states: Any = None,
        attention_mask: Any = None,
        image_rotary_emb: Any = None,
    ) -> Any:
        nonlocal tag
        previous = tag
        tag = sites.get(id(attention))
        if tag is not None:
            expected = expected_at_site()
            observed.sites.append(
                {
                    "pass": active,
                    "block": tag[0],
                    "kind": tag[1],
                    "keys": hidden_states.shape[1]
                    if encoder_hidden_states is None
                    else encoder_hidden_states.shape[1],
                    "mask": mask_record(attention_mask, expected=expected),
                    "expectedMaskSha256": expected_mask_sha if expected is not None else None,
                }
            )
        try:
            return original_processor(
                self,
                attention,
                hidden_states,
                encoder_hidden_states=encoder_hidden_states,
                attention_mask=attention_mask,
                image_rotary_emb=image_rotary_emb,
            )
        finally:
            tag = previous

    @wraps(original_dispatch)
    def dispatch(query: Any, key: Any, value: Any, *args: Any, **kwargs: Any) -> Any:
        actual = original_dispatch(query, key, value, *args, **kwargs)
        if tag is not None:
            mask = kwargs.get("attn_mask", args[0] if args else None)
            entry: dict[str, Any] = {
                "pass": active,
                "block": tag[0],
                "kind": tag[1],
                "queryShape": list(query.shape),
                "keyShape": list(key.shape),
                "mask": mask_record(mask, expected=expected_at_site()),
            }
            # Three heads/queries on first/middle/last cross blocks only at step1.
            # The reference uses original projected Q/K/V and exact native mask;
            # independent mask agreement is a separate post-publication oracle.
            if active in (0, 1) and tag in ((0, "cross"), (14, "cross"), (27, "cross")):
                heads = [0, 8, 15]
                keys = key[:, :, heads].float()
                values = value[:, :, heads].float()
                errors, magnitudes = cast(tuple[list[float], list[float]], ([], []))
                for index in (0, query.shape[1] // 2, query.shape[1] - 1):
                    q = query[:, index, heads].float()
                    logits = torch.einsum("bhd,bkhd->bhk", q, keys) / math.sqrt(q.shape[-1])
                    if mask is not None:
                        permitted = mask[..., index, :]
                        if permitted.dtype == torch.bool:
                            logits = logits.masked_fill(~permitted, -math.inf)
                        else:
                            logits = logits + permitted
                    expected = torch.einsum("bhk,bkhd->bhd", logits.softmax(-1), values)
                    measured = actual[:, index, heads].float()
                    errors.append(float((measured - expected).abs().max().item()))
                    magnitudes.append(float(expected.abs().max().item()))
                entry["denseMaxError"] = max(errors)
                entry["denseMagnitude"] = max(magnitudes)
            observed.dispatch.append(entry)
        return actual

    @wraps(original_sdpa)
    def sdpa(*args: Any, **kwargs: Any) -> Any:
        if tag is not None:
            mask = kwargs.get("attn_mask", args[3] if len(args) > 3 else None)
            observed.sdpa.append(
                {
                    "pass": active,
                    "block": tag[0],
                    "kind": tag[1],
                    "mask": mask_record(mask, expected=expected_at_site()),
                }
            )
        return original_sdpa(*args, **kwargs)

    @wraps(original_decode)
    def decode(self: Any, *args: Any, **kwargs: Any) -> Any:
        if self is models.vae:
            latent = args[0] if args else kwargs["z"]
            observed.decode_input_sha256 = _tensor_sha(latent, torch)
            mean = torch.tensor(self.config.latents_mean, dtype=torch.bfloat16).view(1, 16, 1, 1, 1)
            std = torch.tensor(self.config.latents_std, dtype=torch.bfloat16).view(1, 16, 1, 1, 1)
            expected_raw = next_latent * std + mean
            if _tensor_sha(expected_raw, torch) != observed.decode_input_sha256:
                observed.numerical_mismatches.append("terminal Wan input")
        actual = original_decode(self, *args, **kwargs)
        if self is models.vae:
            observed.decoded = actual.sample.detach().cpu().clone()
            if fault == "decode":
                raise observed.sentinel
        return actual

    @wraps(original_publish)
    def publish(*args: Any, **kwargs: Any) -> Any:
        if fault == "publication":
            raise observed.sentinel
        return original_publish(*args, **kwargs)

    with pytest.MonkeyPatch.context() as patch:
        original_ids = {id(x) for x in (session.tokenizers.qwen3, session.tokenizers.t5)}
        for tokenizer_class in {
            cast(Any, type(session.tokenizers.qwen3)),
            cast(Any, type(session.tokenizers.t5)),
        }:
            original_tokenize = tokenizer_class.__call__

            def tokenize(
                self: Any, *args: Any, _original: Any = original_tokenize, **kwargs: Any
            ) -> Any:
                observed.tokenizer_calls += 1
                observed.borrowed_tokenizer_used |= id(self) in original_ids
                return _original(self, *args, **kwargs)

            patch.setattr(tokenizer_class, "__call__", tokenize)
        patch.setattr(cast(Any, type(models.qwen3_encoder)), "forward", qwen)
        patch.setattr(cast(Any, type(models.text_conditioner)), "forward", conditioner)
        patch.setattr(cast(Any, type(models.transformer)), "forward", transformer)
        patch.setattr(cosmos.CosmosAttnProcessor2_0, "__call__", processor)
        patch.setattr(cosmos, "dispatch_attention_fn", dispatch)
        patch.setattr(torch.nn.functional, "scaled_dot_product_attention", sdpa)
        patch.setattr(cast(Any, type(models.vae)), "decode", decode)
        patch.setattr(regional, "publish_generation_image", publish)
        yield observed


def _rgb(session: _Session, command: Any, done: dict[str, Any], observed: _Observation) -> bytes:
    derivatives = importlib.import_module("imagegen_worker.derivatives")
    assert done["type"] == "generation-done" and done["protocolVersion"] == "1"
    assert done["requestId"] == command.request_id
    assert done["outputPath"] == str(command.output_path)
    assert done["seed"] == command.sampling.seed
    assert _file_sha(command.target_path) == command.target_sha256
    assert observed.decoded is not None
    decoded = observed.decoded
    expected = (127.5 * (decoded[0, :, 0].float().clamp(-1, 1) + 1)).to(session.torch.uint8)
    expected_bytes = expected.permute(1, 2, 0).contiguous().numpy().tobytes()
    with Image.open(command.output_path) as image:
        image.load()
        assert image.format == "PNG" and image.mode == "RGB"
        assert image.size == (command.width, command.height) and cast(Any, image).n_frames == 1
        assert image.info.get("icc_profile") == derivatives.SRGB_ICC_PROFILE
        actual = image.tobytes()
    assert actual == expected_bytes, "Published RGB differs from original trained Wan output"
    return actual


def _association(session: _Session, handoff: dict[str, Any], command: Any, o: _Observation) -> None:
    encodes = 2 + len(_active_regions(handoff))
    assert o.qwen == o.conditioner == encodes
    assert o.tokenizer_calls == encodes * 4
    assert not o.borrowed_tokenizer_used
    assert len(o.passes) == command.sampling.total_steps * 2
    assert all(record["contextExact"] for record in o.passes), "Trained signed context association"
    expected_sites = len(o.passes) * 56
    assert len(o.sites) == len(o.dispatch) == len(o.sdpa) == expected_sites
    for collection in (o.sites, o.dispatch, o.sdpa):
        for record in collection:
            assert record["mask"]["exact"], "Native trained regional mask/range association"
    for index in range(len(o.passes)):
        sites = [item for item in o.sites if item["pass"] == index]
        assert {(item["block"], item["kind"]) for item in sites} == {
            (block, kind) for block in range(28) for kind in ("self", "cross")
        }
        assert len(sites) == 56
    assert not o.numerical_mismatches, o.numerical_mismatches
    epsilon = float(session.torch.finfo(session.torch.bfloat16).eps)
    dense = [item for item in o.dispatch if "denseMaxError" in item]
    assert len(dense) == 6
    for item in dense:
        assert item["denseMaxError"] <= 4 * epsilon * (1 + item["denseMagnitude"])


def _record(
    session: _Session,
    case: str,
    handoff: dict[str, Any],
    command: Any,
    observed: _Observation,
    evidence: dict[str, Any],
    rgb: bytes | None,
    failure: BaseException | None,
) -> dict[str, Any]:
    derivatives = importlib.import_module("imagegen_worker.derivatives")
    return {
        "schema": "anima-trained-regional-native-v1",
        "case": case,
        "sourcePins": _pins(),
        "bundle": session.files,
        "mainHandoffSha256": _file_sha(Path(handoff["paths"]["handoff"])),
        "savedCheckpointExact": handoff["verifiedBundle"]["checkpoint"]["reference"]
        == handoff["authoredDocument"]["generationDraft"]["model"],
        "signature": {
            "width": command.width,
            "height": command.height,
            "steps": command.sampling.steps,
            "seed": command.sampling.seed,
            "guidanceScale": command.sampling.guidance_scale,
            "compiledPrompts": handoff["compiledPrompts"],
            "coverageSha256": [
                _sha(bytes(region["coverage"]["alpha"])) for region in handoff["recipe"]["regions"]
            ],
        },
        "passes": observed.passes,
        "processorSites": observed.sites,
        "dispatchSites": observed.dispatch,
        "sdpaSites": observed.sdpa,
        "numericalMismatches": observed.numerical_mismatches,
        "encoding": {
            "qwen": observed.qwen,
            "conditioner": observed.conditioner,
            "tokenizerCalls": observed.tokenizer_calls,
            "borrowedTokenizerUsed": observed.borrowed_tokenizer_used,
        },
        "terminalLatentSha256": observed.terminal_sha256,
        "decodeInputSha256": observed.decode_input_sha256,
        "decodedSha256": None
        if observed.decoded is None
        else _tensor_sha(observed.decoded, session.torch),
        "rgbSha256": None if rgb is None else _sha(rgb),
        "pngSha256": _file_sha(command.output_path) if command.output_path.exists() else None,
        "outputPath": str(command.output_path),
        "iccSha256": _sha(derivatives.SRGB_ICC_PROFILE),
        "evidence": evidence,
        "failure": None
        if failure is None
        else {"class": type(failure).__name__, "message": str(failure)},
        "visualStatus": "not-evaluated",
        "publicReadiness": "not-qualified",
    }


def _expected(session: _Session, case: str) -> dict[str, Any]:
    template = os.environ.get(_PREFIX + "EXPECTED")
    pin = os.environ.get(_PREFIX + "EXPECTED_SHA256")
    assert template and pin, "Verify requires a separately pinned healthy record"
    path = Path(template.format(case=case))
    pins = json.loads(pin) if pin.startswith("{") else pin
    digest: str = cast(dict[str, str], pins)[case] if isinstance(pins, dict) else pins
    assert re.fullmatch(r"[0-9a-f]{64}", digest) and _file_sha(path) == digest
    return cast(dict[str, Any], json.loads(path.read_text()))


def _stable(record: dict[str, Any]) -> dict[str, Any]:
    return {
        key: record[key]
        for key in (
            "signature",
            "passes",
            "processorSites",
            "dispatchSites",
            "sdpaSites",
            "numericalMismatches",
            "encoding",
            "terminalLatentSha256",
            "decodeInputSha256",
            "decodedSha256",
            "rgbSha256",
            "pngSha256",
            "iccSha256",
        )
    }


def _verify(session: _Session, case: str, record: dict[str, Any]) -> None:
    expected = _expected(session, case)
    differences = {
        name
        for name, digest in record["sourcePins"].items()
        if expected["sourcePins"].get(name) != digest
    }
    mutation = os.environ.get(_PREFIX + "MUTATION", "")
    assert differences <= (
        {"worker-python/src/imagegen_worker/anima_regional.py"} if mutation else set()
    ), differences
    assert record["bundle"] == expected["bundle"]
    assert _stable(record) == _stable(expected), "Trained pinned native/RGB witness changed"


def _run(
    session: _Session,
    case: str,
    *,
    output_case: str | None = None,
    fault: str | None = None,
) -> tuple[dict[str, Any], _Observation]:
    name = case if output_case is None else output_case
    handoff = _handoff(session, case)
    command = _command(session, handoff, name)
    regional = importlib.import_module("imagegen_worker.anima_regional")
    contexts = _context_oracle(session, handoff)
    evidence: dict[str, Any] = {}
    rgb: bytes | None = None
    failure: BaseException | None = None
    observed = _Observation()
    try:
        with (
            _preserved(session, evidence),
            _observed(session, handoff, command, contexts, fault=fault) as observed,
        ):
            if fault is None:
                done = regional.generate_current_canvas_regional_anima_txt2img(
                    handoff["recipe"],
                    command=command,
                    compiled_prompts=handoff["compiledPrompts"],
                    models=session.models,
                    runtime=session.runtime,
                    profile="cuda-bfloat16-v1",
                    tokenizers=session.tokenizers,
                )
                rgb = _rgb(session, command, done, observed)
            else:
                derivatives = importlib.import_module("imagegen_worker.derivatives")
                expected_error = (
                    _Sentinel if fault == "publication" else derivatives.DerivativeError
                )
                with pytest.raises(expected_error) as caught:
                    regional.generate_current_canvas_regional_anima_txt2img(
                        handoff["recipe"],
                        command=command,
                        compiled_prompts=handoff["compiledPrompts"],
                        models=session.models,
                        runtime=session.runtime,
                        profile="cuda-bfloat16-v1",
                        tokenizers=session.tokenizers,
                    )
                if fault == "publication":
                    assert caught.value is observed.sentinel
                else:
                    assert cast(Any, caught.value).code == "GENERATION_WORKER_FAILED"
                    assert caught.value.__cause__ is observed.sentinel
                assert not command.output_path.exists()
                assert _file_sha(command.target_path) == command.target_sha256
                evidence["controlledFailure"] = fault
        # All semantic assertions occur after the original PNG and preservation.
        if fault is None:
            record = _record(session, name, handoff, command, observed, evidence, rgb, None)
            _write_json(session.report_path(name), record)
            _association(session, handoff, command, observed)
            if session.mode == "verify":
                _verify(session, case, record)
            return record, observed
        record = _record(session, name, handoff, command, observed, evidence, None, None)
        _write_json(session.report_path(name), record)
        return record, observed
    except BaseException as error:
        failure = error
        raise
    finally:
        path = session.report_path(name)
        if not path.exists():
            _write_json(
                path, _record(session, name, handoff, command, observed, evidence, rgb, failure)
            )


def _ordinary(session: _Session, handoff: dict[str, Any]) -> dict[str, str]:
    flow = importlib.import_module("imagegen_worker.anima_flow_sampling")
    regional = importlib.import_module("imagegen_worker.anima_regional")
    prompts = handoff["compiledPrompts"]
    tokenizer_module = importlib.import_module("imagegen_worker.anima_tokenizers")
    original_decode: Any = cast(Any, type(session.models.vae)).decode
    decoded_hashes: list[str] = []

    @wraps(original_decode)
    def decode(self: Any, *args: Any, **kwargs: Any) -> Any:
        actual = original_decode(self, *args, **kwargs)
        if self is session.models.vae:
            decoded_hashes.append(_tensor_sha(actual.sample, session.torch))
        return actual

    # Ordinary execution owns native Wan caches. Explicit preparation scope ends
    # before the private request's preservation baseline, with no borrowed repair.
    with (
        regional._vae_cache_scope(session.models.vae),
        pytest.MonkeyPatch.context() as patch,
    ):
        patch.setattr(cast(Any, type(session.models.vae)), "decode", decode)
        result = flow.generate_anima_flow_sampling(
            handoff["sampling"],
            prompts[0]["prompt"],
            prompts[1]["prompt"],
            session.models,
            tokenizers=tokenizer_module.load_anima_tokenizers(),
        )
    assert len(decoded_hashes) == 1
    witness = {
        "rgbSha256": _sha(result.image.tobytes()),
        "terminalLatentSha256": _tensor_sha(result.latents, session.torch),
        "decodedSha256": decoded_hashes[0],
    }
    _write_json(session.run / f"{session.label}-ordinary-zero.json", witness)
    return witness


@pytest.mark.parametrize("case", _CASES)
def test_anima_trained_matrix(trained: _Session, case: str) -> None:
    ordinary = _ordinary(trained, _handoff(trained, case)) if case == "zero" else None
    actual, _observed_result = _run(trained, case)
    if ordinary is not None:
        assert actual["rgbSha256"] == ordinary["rgbSha256"]
        assert actual["terminalLatentSha256"] == ordinary["terminalLatentSha256"]
        assert actual["decodedSha256"] == ordinary["decodedSha256"]
    if case in ("repeat", "swapped", "changed-seed") and trained.mode == "record":
        base = json.loads(trained.report_path("base").read_text())
        if case == "repeat":
            assert _stable(actual) == _stable(base), "Trained same-seed repeat changed"
        else:
            assert actual["rgbSha256"] != base["rgbSha256"], "Trained contrast lost in RGB"
            assert actual["passes"][0]["predictionSha256"] != base["passes"][0]["predictionSha256"]
            if case == "swapped":
                assert actual["signature"]["coverageSha256"] == base["signature"]["coverageSha256"]
                for left, right in zip(actual["passes"], base["passes"], strict=True):
                    if left["role"] == "negative":
                        assert left["contextSha256"] == right["contextSha256"]


def test_anima_trained_association_mutation_red(trained: _Session) -> None:
    _run(trained, "base", output_case="association-target")


def test_anima_trained_zero_control_green(trained: _Session) -> None:
    _run(trained, "zero", output_case="zero-control")


@pytest.mark.parametrize("fault", ("late-step", "decode", "publication"))
def test_anima_trained_failure_recovery(trained: _Session, fault: str) -> None:
    failed, observation = _run(trained, "base", output_case=f"failure-{fault}", fault=fault)
    assert failed["evidence"]["borrowedPreserved"]
    if fault == "late-step":
        assert len(observation.passes) == 29 and observation.decoded is None
    else:
        assert len(observation.passes) == 40 and observation.decoded is not None
    recovered, _ = _run(trained, "base", output_case=f"recovery-{fault}")
    base = (
        _expected(trained, "base")
        if trained.mode == "verify"
        else json.loads(trained.report_path("base").read_text())
    )
    assert _stable(recovered) == _stable(base), "Fresh trained recovery differs from healthy base"
