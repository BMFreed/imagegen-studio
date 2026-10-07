"""Actual compiled worker requests and native pixels, with explicit scaled CPU constructors."""

# pyright: reportPrivateUsage=false
# Only the existing private scaled architecture/fixture collaborator is used.

from __future__ import annotations

import copy
import hashlib
import json
import subprocess
from collections.abc import Callable
from dataclasses import replace
from functools import lru_cache
from pathlib import Path
from types import MappingProxyType, ModuleType, SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import anima_worker, generation_artifacts
from imagegen_worker.anima_flow_sampling import generate_anima_flow_sampling
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.inference import MLRuntime
from imagegen_worker.inference_anima import (
    ANIMA_BASE_ARCHITECTURE,
    AnimaModelBundle,
    _AnimaArchitecture,
    load_anima_models,
)
from imagegen_worker.inference_main import inference_ready_message, process_inference_request
from imagegen_worker.protocol import (
    GenerateAnimaImg2ImgCommand,
    GenerateAnimaTxt2ImgCommand,
    parse_request,
    process_request,
)
from test_anima_loader import _fixture as create_native_bundle
from test_anima_lora import create_native_lora_file, native_lora_state


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


@lru_cache(maxsize=128)
def compiled(source: str) -> dict[str, Any]:
    root = Path(__file__).resolve().parents[2]
    executable = root / "node_modules/.bin/tsx"
    if not executable.exists():
        pytest.skip("Real TS worker assembler requires repository pnpm dependencies.")
    program = (
        "import {buildAnimaWorkerRequest as build} "
        "from './src/shared/projects/anima-worker-request.ts';"
        "const value="
        + source
        + ";process.stdout.write(JSON.stringify(build(value.input,value.ready)))"
    )
    return cast(
        dict[str, Any],
        json.loads(subprocess.check_output([str(executable), "-e", program], cwd=root, text=True)),
    )


def request(
    root: Path,
    *,
    mode: str = "txt2img",
    scheduler: str = "euler",
    strength: float | None = None,
    steps: int = 3,
    seed: int = 0,
    positive: str = "(bright hair:2)",
    negative: str = "(dark blur)--",
    bundle: AnimaModelBundle | None = None,
    loras: list[dict[str, object]] | None = None,
) -> dict[str, Any]:
    root.mkdir(mode=0o700)
    target = root / "canvas.png"
    Image.new("RGBA", (64, 64), (90, 120, 180, 255 if mode == "img2img" else 0)).save(
        target, format="PNG", icc_profile=SRGB_ICC_PROFILE
    )
    content = target.read_bytes()
    if bundle is None:
        model: dict[str, Any] = {"architecture": "anima-base-1.0"}
        for role in ("checkpoint", "qwen3Encoder", "vae"):
            path = root / (role + ".safetensors")
            path.write_bytes(role.encode())
            model[role] = {
                "path": str(path),
                "sha256": digest(path.read_bytes()),
                "byteSize": path.stat().st_size,
            }
    else:
        model = {
            "architecture": "anima-base-1.0",
            **{
                role: {"path": str(file.path), "sha256": file.sha256, "byteSize": file.byte_size}
                for role, file in (
                    ("checkpoint", bundle.checkpoint),
                    ("qwen3Encoder", bundle.qwen3_encoder),
                    ("vae", bundle.vae),
                )
            },
        }
    authored = {
        "requestId": "anima-" + root.name,
        "mode": mode,
        "model": model,
        "bbox": {"x": -64, "y": 128, "width": 64, "height": 64},
        "target": {
            "path": str(target),
            "sha256": digest(content),
            "byteSize": len(content),
            "width": 64,
            "height": 64,
            "iccSha256": digest(SRGB_ICC_PROFILE),
        },
        "output": {"stagingRoot": str(root), "pngPath": str(root / "provisional.png")},
        "prompts": {"positive": positive, "negative": negative},
        "sampling": {
            "steps": steps,
            "seed": seed,
            "guidanceScale": 4,
            "strength": strength,
            "scheduler": scheduler,
        },
        "loras": loras or [],
    }
    return copy.deepcopy(
        compiled(json.dumps({"input": authored, "ready": inference_ready_message(fake_runtime())}))
    )


def fake_runtime(*, bf16: bool = True) -> MLRuntime:
    def supported(**kwargs: object) -> bool:
        assert kwargs == {"including_emulation": False}
        return bf16

    torch = ModuleType("controlled_torch")
    torch.__dict__.update(bfloat16=object(), cuda=SimpleNamespace(is_bf16_supported=supported))
    return MLRuntime(torch, ModuleType("unused_diffusers"), ModuleType("unused_compel"))


def record_load(calls: list[object]) -> Callable[..., None]:
    def record(*args: object, **_kwargs: object) -> None:
        calls.append(args)

    return record


def route(
    value: object, root: Path, runtime: MLRuntime | None = None, **options: Any
) -> dict[str, object]:
    return process_inference_request(
        value, config_dir=root, runtime=runtime or fake_runtime(), **options
    )


def test_parser_captures_real_ts_unicode_weights_signed_stack_and_detaches(tmp_path: Path) -> None:
    value = request(tmp_path / "capture", positive="(кот 😀:2)", negative="(blur)--")
    job = value["job"]
    job["loras"] = [
        {
            "path": str(tmp_path / f"lora-{index}"),
            "sha256": "a" * 64,
            "byteSize": 32,
            "weight": weight,
        }
        for index, weight in enumerate((0, -0.5, 0.7))
    ]
    command = parse_request(value)
    assert isinstance(command, GenerateAnimaTxt2ImgCommand)
    assert not isinstance(command, GenerateAnimaImg2ImgCommand)
    assert command.sampling.seed == command.sampling.step_seed == 0
    assert command.positive_prompt.cleaned_text == "кот 😀"
    assert command.positive_prompt.spans[0].end == 5
    assert command.positive_prompt.spans[0].weight == 2
    assert tuple(lora.weight for lora in command.loras) == (0, -0.5, 0.7)
    job["sampling"]["sigmas"][0] = 0
    job["prompts"]["positive"]["spans"][0]["weight"] = 100
    job["model"]["vae"]["sha256"] = "b" * 64
    job["loras"][1]["weight"] = 10
    assert command.sampling.sigmas[0] == 1
    assert command.positive_prompt.spans[0].weight == 2
    assert command.bundle.vae.sha256 != "b" * 64
    assert command.loras[1].weight == -0.5
    assert process_request(value)["code"] == "INVALID_REQUEST"  # Edited schedule remains invalid.
    assert process_request(request(tmp_path / "derivatives"))["code"] == "INFERENCE_UNAVAILABLE"


@pytest.mark.parametrize(
    "path,value",
    [
        (("job", "schemaVersion"), True),
        (("job", "cfgRescale"), 0),
        (("job", "clipSkip"), 0),
        (("job", "vaePrecision"), "Auto"),
        (("job", "embeddings"), []),
        (("job", "model", "architecture"), "anima-turbo"),
        (("job", "model", "vae", "byteSize"), 2**53),
        (("job", "model", "vae", "path"), "/tmp/./vae.safetensors"),
        (("job", "model", "vae", "path"), "/tmp//vae.safetensors"),
        (("job", "model", "vae", "path"), "/tmp/\ud800"),
        (("job", "target", "width"), 128),
        (("job", "bbox", "height"), 128),
        (("job", "sampling", "stepSeed"), 1),
        (("job", "sampling", "scheduler"), "unknown"),
        (("job", "sampling", "version"), "anima-euler-denoising-v1"),
        (("type",), "generate-anima-img2img"),
        (("job", "prompts", "positive", "version"), "raw-text"),
    ],
)
def test_forged_public_wire_refuses_before_io_and_model_load(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, path: tuple[str, ...], value: object
) -> None:
    wire = request(tmp_path / "forged")
    current = wire
    for key in path[:-1]:
        current = current[key]
    current[path[-1]] = value
    calls: list[object] = []
    monkeypatch.setattr(anima_worker, "load_anima_models", record_load(calls))
    response = route(wire, tmp_path)
    assert response["type"] == "error"
    assert response["requestId"] == wire["requestId"]
    assert response["code"] in ("INVALID_REQUEST", "GENERATION_PROMPT_UNSUPPORTED")
    assert not calls and not Path(wire["job"]["output"]["pngPath"]).exists()


def test_aliases_missing_companion_and_duplicate_loras_refuse(tmp_path: Path) -> None:
    baseline = request(tmp_path / "aliases")
    forged: list[dict[str, Any]] = []
    missing = copy.deepcopy(baseline)
    del missing["job"]["model"]["vae"]
    forged.append(missing)
    for resource in ("checkpoint", "qwen3Encoder", "vae"):
        alias = copy.deepcopy(baseline)
        alias["job"]["model"][resource]["path"] = alias["job"]["output"]["pngPath"]
        forged.append(alias)
    for resource in (
        baseline["job"]["model"]["checkpoint"]["path"],
        baseline["job"]["target"]["path"],
        str(tmp_path / "same"),
    ):
        alias = copy.deepcopy(baseline)
        lora = {"path": resource, "sha256": "a" * 64, "byteSize": 32, "weight": -1}
        alias["job"]["loras"] = [lora, dict(lora)]
        forged.append(alias)
    for wire in forged:
        with pytest.raises(DerivativeError):
            parse_request(wire)
    command = parse_request(baseline)
    assert isinstance(command, GenerateAnimaTxt2ImgCommand)
    assert command.output_path.name == "provisional.png"


def test_target_snapshot_size_is_verified_after_actual_file_interleaving(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    wire = request(tmp_path / "size-race")
    target = Path(wire["job"]["target"]["path"])
    old = target.read_bytes()
    changed = tmp_path / "changed.png"
    Image.new("RGBA", (64, 64), (10, 20, 30, 0)).save(
        changed, format="PNG", icc_profile=SRGB_ICC_PROFILE, compress_level=0
    )
    new = changed.read_bytes()
    assert len(old) != len(new)
    wire["job"]["target"]["sha256"] = digest(new)
    original_read = generation_artifacts.read_snapshot

    def replace_between_stat_and_open(path: Path, sha256: str) -> bytes:
        path.write_bytes(new)
        return original_read(path, sha256)

    calls: list[object] = []
    monkeypatch.setattr(generation_artifacts, "read_snapshot", replace_between_stat_and_open)
    monkeypatch.setattr(anima_worker, "load_anima_models", record_load(calls))
    response = route(wire, tmp_path)
    assert response["code"] == "GENERATION_INPUT_CHANGED"
    assert not calls and not Path(wire["job"]["output"]["pngPath"]).exists()


def test_same_size_valid_target_change_fails_hash_before_loading_models(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    wire = request(tmp_path / "hash-change")
    target = Path(wire["job"]["target"]["path"])
    Image.new("RGBA", (64, 64), (90, 120, 180, 0)).save(
        target, format="PNG", icc_profile=SRGB_ICC_PROFILE, compress_level=0
    )
    frozen = target.read_bytes()
    wire["job"]["target"].update(sha256=digest(frozen), byteSize=len(frozen))
    Image.new("RGBA", (64, 64), (30, 60, 90, 0)).save(
        target, format="PNG", icc_profile=SRGB_ICC_PROFILE, compress_level=0
    )
    assert target.stat().st_size == len(frozen) and digest(target.read_bytes()) != digest(frozen)
    calls: list[object] = []
    monkeypatch.setattr(anima_worker, "load_anima_models", record_load(calls))
    assert route(wire, tmp_path)["code"] == "INPUT_HASH_MISMATCH"
    assert not calls and not Path(wire["job"]["output"]["pngPath"]).exists()


def test_bf16_refusal_and_existing_output_preserve_target_and_model_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    wire = request(tmp_path / "compute")
    calls: list[object] = []
    monkeypatch.setattr(anima_worker, "load_anima_models", record_load(calls))
    assert route(wire, tmp_path, fake_runtime(bf16=False))["code"] == "INFERENCE_UNAVAILABLE"
    output = Path(wire["job"]["output"]["pngPath"])
    output.write_bytes(b"existing complete output")
    assert route(wire, tmp_path)["code"] == "OUTPUT_UNAVAILABLE"
    assert output.read_bytes() == b"existing complete output" and not calls


def test_actual_ready_composition_advertises_anima_only_on_native_bf16_hardware() -> None:
    yes = inference_ready_message(fake_runtime())
    no = inference_ready_message(fake_runtime(bf16=False))
    capabilities = cast(list[str], yes["capabilities"])
    assert capabilities[-6:] == [
        "anima-txt2img",
        "anima-img2img",
        "anima-lora",
        "anima-prompt-weighting",
        "anima-flow-sampling",
        "anima-outpaint",
    ]
    assert no["capabilities"] == capabilities[:-6]
    assert no["workerVersion"] == yes["workerVersion"] == "0.13.0"
    assert "illustrious-txt2img" in cast(list[str], no["capabilities"])
    assert inference_ready_message()["capabilities"] == no["capabilities"]
    broken = fake_runtime()

    def failed_probe(**_kwargs: object) -> bool:
        raise RuntimeError("controlled optional BF16 probe failure")

    cast(Any, broken.torch).cuda.is_bf16_supported = failed_probe
    assert inference_ready_message(broken)["capabilities"] == no["capabilities"]


@pytest.fixture(scope="module")
def native_bundle(tmp_path_factory: pytest.TempPathFactory) -> Any:
    """Real original-key safetensors and native modules; only widths/layers are scaled.

    The actual loader still verifies all files, tensors and conversions. Full
    tokenizer vocabularies, conditioning length and original 16-channel latent
    topology remain real. CUDA/BF16 placement has its own trained subprocess test.
    """
    torch = pytest.importorskip("torch")
    diffusers = pytest.importorskip("diffusers")
    transformers = pytest.importorskip("transformers")
    accelerate = pytest.importorskip("accelerate")
    pytest.importorskip("torchvision")
    architecture = _AnimaArchitecture(
        transformer=MappingProxyType(
            {
                **ANIMA_BASE_ARCHITECTURE.transformer,
                "num_attention_heads": 2,
                "attention_head_dim": 32,
                "num_layers": 1,
                "text_embed_dim": 32,
                "adaln_lora_dim": 8,
                "max_size": (1, 16, 16),
            }
        ),
        text_conditioner=MappingProxyType(
            {
                **ANIMA_BASE_ARCHITECTURE.text_conditioner,
                "source_dim": 32,
                "target_dim": 32,
                "model_dim": 32,
                "num_layers": 1,
                "num_attention_heads": 2,
            }
        ),
        qwen3_encoder=MappingProxyType(
            {
                **ANIMA_BASE_ARCHITECTURE.qwen3_encoder,
                "hidden_size": 32,
                "intermediate_size": 64,
                "num_hidden_layers": 1,
                "num_attention_heads": 2,
                "num_key_value_heads": 1,
                "head_dim": 16,
            }
        ),
        vae=MappingProxyType({"base_dim": 4, "z_dim": 16}),
        companion_identities=None,
    )
    root = tmp_path_factory.mktemp("anima-worker-native-bundle")
    bundle, _expected = create_native_bundle(
        (torch, diffusers, transformers, accelerate, architecture), root
    )
    return torch, diffusers, architecture, bundle


def native_runtime(native_bundle: Any, monkeypatch: pytest.MonkeyPatch) -> MLRuntime:
    torch, diffusers, architecture, _bundle = native_bundle

    def load_on_scaled_cpu(bundle: AnimaModelBundle, *, device: str, dtype: Any) -> Any:
        assert device == "cuda" and dtype == torch.bfloat16
        return load_anima_models(
            bundle, device="cpu", dtype=torch.float32, _architecture=architecture
        )

    monkeypatch.setattr(anima_worker, "load_anima_models", load_on_scaled_cpu)

    def supported(**kwargs: object) -> bool:
        assert kwargs == {"including_emulation": False}
        return True

    monkeypatch.setattr(torch.cuda, "is_bf16_supported", supported)
    return MLRuntime(torch, diffusers, ModuleType("unused_compel"))


def pixels(wire: dict[str, Any]) -> bytes:
    with Image.open(wire["job"]["output"]["pngPath"]) as image:
        image.load()
        assert image.format == "PNG" and image.mode == "RGB" and image.size == (64, 64)
        assert image.info["icc_profile"] == SRGB_ICC_PROFILE
        return image.tobytes()


@pytest.mark.parametrize(
    "scheduler", ("euler", "heun", "dpmpp_2m", "dpmpp_2m_sde", "er_sde", "lcm")
)
def test_actual_entrypoint_loads_native_bundle_and_publishes_exact_weighted_method_pixels(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, native_bundle: Any, scheduler: str
) -> None:
    torch, _diffusers, architecture, bundle = native_bundle
    wire = request(
        tmp_path / scheduler,
        scheduler=scheduler,
        bundle=bundle,
        steps=5 if scheduler == "er_sde" else 3,
    )
    runtime = native_runtime(native_bundle, monkeypatch)
    events: list[dict[str, object]] = []
    response = route(wire, tmp_path, runtime, on_progress=events.append)
    assert response["type"] == "generation-done" and response["seed"] == 0
    assert response["requestId"] == wire["requestId"]
    assert response["outputPath"] == wire["job"]["output"]["pngPath"]
    count = wire["job"]["sampling"]["totalSteps"]
    assert events == [
        {
            "type": "generation-progress",
            "protocolVersion": "1",
            "requestId": wire["requestId"],
            "step": index,
            "totalSteps": count,
        }
        for index in range(1, count + 1)
    ]
    # This oracle checks the handoff, not independent solver algebra: actual
    # numerical methods have separate independent-reference tests.
    models = load_anima_models(bundle, _architecture=architecture)
    expected = generate_anima_flow_sampling(
        wire["job"]["sampling"],
        wire["job"]["prompts"]["positive"],
        wire["job"]["prompts"]["negative"],
        models,
    )
    assert pixels(wire) == expected.image.tobytes()
    thumbnail = cast(dict[str, Any], response["thumbnail"])
    content = Path(thumbnail["outputPath"]).read_bytes()
    assert digest(content) == thumbnail["sha256"] and len(content) == thumbnail["byteSize"]
    assert thumbnail["width"] == thumbnail["height"] == 64
    replay = request(
        tmp_path / (scheduler + "-replay"),
        scheduler=scheduler,
        bundle=bundle,
        steps=5 if scheduler == "er_sde" else 3,
    )
    assert route(replay, tmp_path, runtime)["type"] == "generation-done"
    assert pixels(replay) == pixels(wire)
    assert torch.isfinite(expected.latents).all().item()


@pytest.mark.parametrize("strength", (0, 0.5, 1))
def test_opaque_img2img_uses_actual_frozen_source_clipping_and_strength_endpoints(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, native_bundle: Any, strength: float
) -> None:
    _torch, _diffusers, architecture, bundle = native_bundle
    runtime = native_runtime(native_bundle, monkeypatch)
    wire = request(
        tmp_path / "img", mode="img2img", strength=strength, scheduler="lcm", bundle=bundle, steps=4
    )
    assert isinstance(parse_request(wire), GenerateAnimaImg2ImgCommand)
    events: list[dict[str, object]] = []
    assert route(wire, tmp_path, runtime, on_progress=events.append)["type"] == "generation-done"
    models = load_anima_models(bundle, _architecture=architecture)
    expected = generate_anima_flow_sampling(
        wire["job"]["sampling"],
        wire["job"]["prompts"]["positive"],
        wire["job"]["prompts"]["negative"],
        models,
        source_image=Image.new("RGB", (64, 64), (90, 120, 180)),
    )
    assert pixels(wire) == expected.image.tobytes()
    assert len(events) == wire["job"]["sampling"]["totalSteps"]
    if strength == 0:
        assert events == []
    if strength == 1:
        txt = request(tmp_path / "txt", scheduler="lcm", bundle=bundle, steps=4)
        assert route(txt, tmp_path, runtime)["type"] == "generation-done"
        assert pixels(txt) == pixels(wire)


def test_signed_three_component_lora_progress_failure_and_later_request_replay(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, native_bundle: Any
) -> None:
    torch, diffusers, architecture, bundle = native_bundle
    runtime = native_runtime(native_bundle, monkeypatch)
    models = load_anima_models(bundle, _architecture=architecture)
    fixture = (torch, diffusers, models, None)
    state = {
        key: tensor
        for component in ("transformer", "text_conditioner", "qwen3_encoder")
        for key, tensor in native_lora_state(fixture, component).items()
    }
    lora = create_native_lora_file(tmp_path, fixture, state, weight=-0.5)
    wire_loras: list[dict[str, object]] = [
        {
            "path": str(lora.path),
            "sha256": lora.sha256,
            "byteSize": lora.byte_size,
            "weight": lora.weight,
        }
    ]
    baseline = request(tmp_path / "baseline", scheduler="dpmpp_2m_sde", bundle=bundle)
    assert route(baseline, tmp_path, runtime)["type"] == "generation-done"
    weighted = request(
        tmp_path / "signed", scheduler="dpmpp_2m_sde", bundle=bundle, loras=wire_loras
    )
    assert route(weighted, tmp_path, runtime)["type"] == "generation-done"
    expected = generate_anima_flow_sampling(
        weighted["job"]["sampling"],
        weighted["job"]["prompts"]["positive"],
        weighted["job"]["prompts"]["negative"],
        models,
        loras=(lora,),
    )
    assert pixels(weighted) == expected.image.tobytes() and pixels(weighted) != pixels(baseline)
    failed = request(tmp_path / "failed", scheduler="dpmpp_2m_sde", bundle=bundle, loras=wire_loras)

    def interrupt(_progress: dict[str, object]) -> None:
        raise RuntimeError("controlled callback interruption")

    assert (
        route(failed, tmp_path, runtime, on_progress=interrupt)["code"]
        == "GENERATION_WORKER_FAILED"
    )
    assert not Path(failed["job"]["output"]["pngPath"]).exists()
    replay = request(tmp_path / "after", scheduler="dpmpp_2m_sde", bundle=bundle)
    assert route(replay, tmp_path, runtime)["type"] == "generation-done"
    assert pixels(replay) == pixels(baseline)


def test_changed_native_checkpoint_and_mixed_alpha_refuse_before_provisional_output(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, native_bundle: Any
) -> None:
    _torch, _diffusers, _architecture, bundle = native_bundle
    runtime = native_runtime(native_bundle, monkeypatch)
    copied = tmp_path / "changed.safetensors"
    copied.write_bytes(bundle.checkpoint.path.read_bytes())
    wire = request(
        tmp_path / "checkpoint-change",
        bundle=replace(bundle, checkpoint=replace(bundle.checkpoint, path=copied)),
    )
    copied.write_bytes(b"changed after compilation")
    assert route(wire, tmp_path, runtime)["code"] == "GENERATION_INPUT_CHANGED"
    assert not Path(wire["job"]["output"]["pngPath"]).exists()
    alpha = request(tmp_path / "mixed", mode="img2img", strength=0.5, bundle=bundle)
    path = Path(alpha["job"]["target"]["path"])
    Image.new("RGBA", (64, 64), (90, 120, 180, 254)).save(
        path, format="PNG", icc_profile=SRGB_ICC_PROFILE
    )
    changed = path.read_bytes()
    alpha["job"]["target"].update(sha256=digest(changed), byteSize=len(changed))
    assert route(alpha, tmp_path, runtime)["code"] == "GENERATION_TARGET_UNSUPPORTED"
    assert not Path(alpha["job"]["output"]["pngPath"]).exists()
