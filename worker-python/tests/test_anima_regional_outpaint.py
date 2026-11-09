"""Regional text and existing Anima OUT protection meet at the original executor.

The Main producer supplies complete recipes unchanged. This suite authors a mixed
PNG separately: it does not attest Main image composition or trained loading.
Only neural LaMa is replaced by an explicitly deterministic image collaborator;
snapshot/CRC/ICC, coherence/fade, original Wan/predictor/native solvers, regional
attention, decode and RGBA PNG publication remain real. The installed suite owns
the actual pinned LaMa/checkpoint and renderer/queue boundary.

External oracles read current Invoke 4875d965 source bodies, not worker helpers.
The extracted OUT numerical definitions are AST-identical to the prior b0ac163b pin.
Assertions for protected history and regional association follow publication so
the named semantic mutation genuinely reaches the original native consumers.
"""

from __future__ import annotations

import ast
import copy
import hashlib
import io
import json
import math
import os
from collections.abc import Callable, Generator
from contextlib import contextmanager
from dataclasses import dataclass, field, replace
from functools import lru_cache, wraps
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image, ImageOps

from imagegen_worker import anima_outpaint, inference_main, outpaint_worker_assets
from imagegen_worker import anima_regional as regional
from imagegen_worker import anima_regional_worker as worker
from imagegen_worker.anima_flow_sampling import validate_anima_flow_sampling_plan
from imagegen_worker.anima_worker import anima_sampling_payload
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.lama_infill import OUTPAINT_INFILL_BYTE_SIZE, OUTPAINT_INFILL_SHA256
from imagegen_worker.protocol import (
    AlphaOutpaintConditioning,
    GenerateAnimaImg2ImgCommand,
    GenerateAnimaOutpaintCommand,
    GenerateAnimaTxt2ImgCommand,
    OutpaintInfillResource,
)
from test_anima_flow_sampling import inputs as _flow_inputs
from test_anima_regional import (
    _Call,  # pyright: ignore[reportPrivateUsage]
    _command,  # pyright: ignore[reportPrivateUsage]
    _contains_cause,  # pyright: ignore[reportPrivateUsage]
    _context_oracle,  # pyright: ignore[reportPrivateUsage]
    _Native,  # pyright: ignore[reportPrivateUsage]
    _native_association,  # pyright: ignore[reportPrivateUsage]
    _Observation,  # pyright: ignore[reportPrivateUsage]
    _observed,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
    _record,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional import cpu_native as cpu_native
from test_anima_regional import main_inputs as main_inputs
from test_anima_regional import native as native
from test_anima_regional import native_factory as native_factory
from test_anima_regional_img2img import (
    _call as _image_call,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_img2img import (
    _execute as _image_execute,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_img2img import (
    _published as _image_published,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_sampling import _fresh_solver  # pyright: ignore[reportPrivateUsage]
from test_anima_regional_worker import (
    _case as _wire_case,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional_worker import (
    _descriptor,  # pyright: ignore[reportPrivateUsage]
    _runtime,  # pyright: ignore[reportPrivateUsage]
    _WireCase,  # pyright: ignore[reportPrivateUsage]
)
from test_outpaint_conditioning import (
    _ImageStore,  # pyright: ignore[reportPrivateUsage]
    _StripAnnotations,  # pyright: ignore[reportPrivateUsage]
)

_METHODS = ("euler", "heun", "dpmpp_2m", "dpmpp_2m_sde", "er_sde", "lcm")
_PROFILE = "invoke-anima-flow-sampling-v1"
_Producer = Callable[..., dict[str, Any]]
_INVOKE = {
    "invokeai/app/invocations/anima/anima_denoise.py": (
        "8adb45e054d0425547fd4db3fcdf95e20396ca28e0fb72b52a9d6e71d230cdcf"
    ),
    "invokeai/backend/rectified_flow/rectified_flow_inpaint_extension.py": (
        "a7a77d7ac6433b5ad930716bf21852a97a81960688e8670a8120e8d26f94e721"
    ),
    "invokeai/app/invocations/sd/create_gradient_mask.py": (
        "8d841f7bc6ab7678232baa3d42fb87d2fd50534b48b128a52ca4c6ac24557e7c"
    ),
    "invokeai/app/invocations/image.py": (
        "354f952ebfcb35872bd38cd8668984de19cad2e879df6eccc91f418dc488a20e"
    ),
}


def _source(relative: str) -> ast.Module:
    root = Path(
        os.environ.get(
            "IGS_INVOKE_SOURCE_ROOT", str(Path(__file__).resolve().parents[3] / "sources/InvokeAI")
        )
    )
    path = root / relative
    assert path.is_file(), f"Required current Invoke oracle source is absent: {path}"
    encoded = path.read_bytes()
    assert hashlib.sha256(encoded).hexdigest() == _INVOKE[relative]
    return ast.parse(encoded, filename=str(path))


@lru_cache(maxsize=1)
def _inpaint_oracle() -> Any:
    import torch

    nodes: list[ast.stmt] = []
    for path, names in (
        (
            "invokeai/backend/rectified_flow/rectified_flow_inpaint_extension.py",
            {"assert_broadcastable", "RectifiedFlowInpaintExtension"},
        ),
        (
            "invokeai/app/invocations/anima/anima_denoise.py",
            {"inverse_loglinear_timestep_shift", "AnimaInpaintExtension"},
        ),
    ):
        selected = [
            node
            for node in _source(path).body
            if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in names
        ]
        assert {node.name for node in selected} == names
        nodes.extend(selected)
    namespace: dict[str, Any] = {"torch": torch, "ANIMA_SHIFT": 3.0}
    exec(
        compile(ast.Module(body=nodes, type_ignores=[]), "current-invoke-anima-mask", "exec"),
        namespace,
    )
    return namespace["AnimaInpaintExtension"]


def _mask_reference(source: Image.Image, torch: Any) -> tuple[Image.Image, Image.Image]:
    """Original external gradient/fade methods; replace graph DTO/storage only."""
    import cv2
    import numpy as np

    captures: list[Image.Image] = []

    def tensor_sink(image: Image.Image, *, normalize: bool) -> Any:
        assert normalize is False
        captures.append(image.copy())
        return torch.from_numpy(np.array(image, dtype=np.float32) / 255).unsqueeze(0)

    def output_dto(value: Any) -> Any:
        return value

    def tensor_reference(**_kwargs: Any) -> str:
        return "tensor"

    namespace: dict[str, Any] = {
        "np": np,
        "numpy": np,
        "cv2": cv2,
        "torch": torch,
        "Image": Image,
        "LATENT_SCALE_FACTOR": 8,
        "GradientMaskOutput": SimpleNamespace,
        "DenoiseMaskField": SimpleNamespace,
        "ImageField": SimpleNamespace,
        "ImageOutput": SimpleNamespace(build=output_dto),
        "ImageCategory": SimpleNamespace(MASK="mask"),
        "image_resized_to_grid_as_tensor": tensor_sink,
    }
    for path, name in (
        ("invokeai/app/invocations/sd/create_gradient_mask.py", "CreateGradientMaskInvocation"),
        ("invokeai/app/invocations/image.py", "ExpandMaskWithFadeInvocation"),
    ):
        original = next(
            node
            for node in _source(path).body
            if isinstance(node, ast.ClassDef) and node.name == name
        )
        selected = ast.ClassDef(
            name=name,
            bases=[],
            keywords=[],
            body=[node for node in original.body if isinstance(node, ast.FunctionDef)],
            decorator_list=[],
            type_params=[],
        )
        module = ast.Module(body=[selected], type_ignores=[])
        _StripAnnotations().visit(module)
        ast.fix_missing_locations(module)
        exec(compile(module, path, "exec"), namespace)
    gradient = namespace["CreateGradientMaskInvocation"]()
    gradient.mask = SimpleNamespace(image_name="source")
    gradient.edge_radius, gradient.minimum_denoise, gradient.coherence_mode = 16, 0, "Gaussian Blur"
    gradient.unet = gradient.vae = gradient.image = None
    store = _ImageStore(source.getchannel("A"))
    gradient.invoke(SimpleNamespace(images=store, tensors=SimpleNamespace(save=tensor_reference)))
    assert len(captures) == len(store.saved) == 1
    fade = namespace["ExpandMaskWithFadeInvocation"]()
    fade.mask, fade.threshold, fade.fade_size_px = SimpleNamespace(image_name="expanded"), 0, 16
    output = _ImageStore(store.saved[0])
    fade.invoke(SimpleNamespace(images=output))
    assert len(output.saved) == 1
    return (
        captures[0].resize((source.width // 8, source.height // 8), Image.Resampling.NEAREST),
        output.saved[0],
    )


def _pixels(width: int, height: int) -> Image.Image:
    values = bytes(
        component
        for y in range(height)
        for x in range(width)
        for component in ((17 * x + 5 * y) % 256, (3 * x + 29 * y) % 256, (x ^ y) % 256)
    )
    return Image.frombytes("RGB", (width, height), values)


def _call(
    root: Path,
    produce: _Producer,
    method: str = "heun",
    *,
    strength: float = 0.5,
    steps: int = 20,
    variant: str = "base",
) -> _Call:
    handoff = produce(variant)
    bbox = handoff["recipe"]["bbox"]
    handoff["sampling"] = _flow_inputs(
        scheduler=method,
        mode="img2img",
        strength=strength,
        steps=steps,
        seed=handoff["recipe"]["item"]["seed"],
        width=bbox["width"],
        height=bbox["height"],
        guidanceScale=3,
    )["plan"]
    call = _command(root, handoff, alpha=255)
    image = _pixels(bbox["width"], bbox["height"]).convert("RGBA")
    alpha = Image.new("L", image.size, 255)
    boundary = image.width * 3 // 4
    alpha.paste(0, (boundary, 0, image.width, image.height))
    alpha.paste(127, (boundary - 1, 0, boundary, image.height))
    image.putalpha(alpha)
    image.save(call.command.target_path, format="PNG", icc_profile=SRGB_ICC_PROFILE)
    encoded = call.command.target_path.read_bytes()
    infill = root.parent / f"{root.name}-explicit-neural-lama.fixture"
    infill.write_bytes(b"deterministic neural collaborator; not trained LaMa")
    fields: dict[str, Any] = {
        **vars(call.command),
        "target_sha256": hashlib.sha256(encoded).hexdigest(),
        "target_byte_size": len(encoded),
    }
    command = GenerateAnimaOutpaintCommand(
        **fields,
        conditioning=AlphaOutpaintConditioning(
            bbox=call.command.bbox,
            source_sha256=fields["target_sha256"],
            source_byte_size=len(encoded),
            width=image.width,
            height=image.height,
            keep_mask_sha256=hashlib.sha256(alpha.tobytes()).hexdigest(),
            keep_mask_byte_size=image.width * image.height,
        ),
        infill_resource=OutpaintInfillResource(
            infill, OUTPAINT_INFILL_SHA256, OUTPAINT_INFILL_BYTE_SIZE
        ),
    )
    return _Call(handoff, command, encoded)


def _infilled(call: _Call) -> Image.Image:
    image = _pixels(call.command.width, call.command.height)
    image.info["icc_profile"] = SRGB_ICC_PROFILE
    return image


@contextmanager
def _lama(call: _Call, patch: pytest.MonkeyPatch) -> Generator[list[Image.Image]]:
    calls: list[Image.Image] = []
    command = cast(GenerateAnimaOutpaintCommand, call.command)

    def load(path: Path, **kwargs: Any) -> Any:
        assert path == command.infill_resource.path
        assert kwargs == {
            "expected_sha256": OUTPAINT_INFILL_SHA256,
            "expected_byte_size": OUTPAINT_INFILL_BYTE_SIZE,
            "device": "cpu",
        }

        def infill(source: Image.Image) -> Image.Image:
            with Image.open(io.BytesIO(call.target_bytes)) as expected:
                assert source.mode == "RGBA" and source.tobytes() == expected.tobytes()
            calls.append(source.copy())
            return _infilled(call)

        return SimpleNamespace(infill=infill)

    with patch.context() as scope:
        scope.setattr(outpaint_worker_assets, "load_local_lama", load)
        yield calls


def _execute(call: _Call, native: _Native, **changes: Any) -> dict[str, object]:
    arguments: dict[str, Any] = {
        "command": call.command,
        "compiled_prompts": call.handoff["compiledPrompts"],
        "models": native.models,
        "runtime": native.runtime,
        "profile": native.profile,
        "tokenizers": native.tokenizers,
        "sampling_profile": _PROFILE,
        **changes,
    }
    return regional.generate_current_canvas_regional_anima_outpaint(
        call.handoff["recipe"], **arguments
    )


@dataclass
class _Execution:
    results: list[Any] = field(default_factory=list)
    encodes: list[Any] = field(default_factory=list)
    merges: list[dict[str, Any]] = field(default_factory=list)


@contextmanager
def _execution(native: _Native, monkeypatch: pytest.MonkeyPatch) -> Generator[_Execution]:
    seen = _Execution()
    original = anima_outpaint.execute_captured_anima_plan
    encode_class = cast(Any, type(native.models.vae))
    encode = encode_class.encode
    state_class = cast(Any, anima_outpaint)._AnimaOutpaintState
    merge = state_class.merge

    @wraps(original)
    def execute(*args: Any, **kwargs: Any) -> Any:
        actual = original(*args, **kwargs)
        seen.results.append(actual)
        return actual

    @wraps(encode)
    def encoded(owner: Any, pixels: Any, *args: Any, **kwargs: Any) -> Any:
        if owner is native.models.vae:
            seen.encodes.append(pixels.detach().cpu().clone())
        return encode(owner, pixels, *args, **kwargs)

    @wraps(merge)
    def merged(owner: Any, candidate: Any, following: float, completes: bool) -> Any:
        before = candidate.detach().cpu().clone()
        actual = merge(owner, candidate, following, completes)
        seen.merges.append(
            {
                "before": before,
                "after": actual.detach().cpu().clone(),
                "following": following,
                "completes": completes,
                "original": owner.original.detach().cpu().clone(),
                "noise": owner.noise.detach().cpu().clone(),
                "generate": owner.generate_mask.detach().cpu().clone(),
            }
        )
        return actual

    with monkeypatch.context() as patch:
        patch.setattr(regional, "execute_captured_anima_plan", execute)
        patch.setattr(anima_outpaint, "execute_captured_anima_plan", execute)
        patch.setattr(encode_class, "encode", encoded)
        patch.setattr(state_class, "merge", merged)
        yield seen


def _source_oracle(call: _Call, native: _Native) -> tuple[Any, Any]:
    torch, vae = native.torch, native.models.vae
    pixels = torch.frombuffer(bytearray(_infilled(call).tobytes()), dtype=torch.uint8)
    pixels = pixels.reshape(call.command.height, call.command.width, 3).permute(2, 0, 1)
    pixels = (pixels.float().unsqueeze(0).unsqueeze(2) / 127.5 - 1).to(
        device=native.device, dtype=native.dtype
    )
    with torch.inference_mode():
        posterior = vae.encode(pixels).latent_dist
        generator = torch.Generator(device="cpu").manual_seed(
            call.command.sampling.seed ^ 0x9E3779B9
        )
        encoded = posterior.sample(generator=generator)
        mean = torch.tensor(vae.config.latents_mean, device=native.device, dtype=native.dtype)
        std = torch.tensor(vae.config.latents_std, device=native.device, dtype=native.dtype)
        original = (encoded - mean.view(1, 16, 1, 1, 1)) / std.view(1, 16, 1, 1, 1)
    return pixels.detach().cpu().clone(), original.to(native.dtype).detach().clone()


def _published(
    call: _Call,
    native: _Native,
    done: dict[str, object],
    observed: _Observation,
    seen: _Execution,
    output_keep: Image.Image,
) -> bytes:
    assert done["type"] == "generation-done" and done["protocolVersion"] == "1"
    assert done["requestId"] == call.command.request_id
    assert done["outputPath"] == str(call.command.output_path)
    assert done["seed"] == call.command.sampling.seed
    assert call.command.target_path.read_bytes() == call.target_bytes
    assert len(observed.decoded) == 1
    raw = observed.decoded[0]
    expected = (127.5 * (raw[0, :, 0].clamp(-1, 1) + 1)).to(dtype=native.torch.uint8)
    rgb = expected.permute(1, 2, 0).contiguous().numpy().tobytes()
    alpha = ImageOps.invert(output_keep).tobytes()
    assert min(alpha) == 0 and max(alpha) == 255 and any(0 < x < 255 for x in alpha)
    expected_rgba = bytes(
        component for i, a in enumerate(alpha) for component in (*rgb[3 * i : 3 * i + 3], a)
    )
    with Image.open(call.command.output_path) as image:
        image.load()
        assert image.format == "PNG" and image.mode == "RGBA"
        assert image.size == (call.command.width, call.command.height)
        assert image.info.get("icc_profile") == SRGB_ICC_PROFILE
        actual = image.tobytes()
    _record("published-outpaint", native, call, observed, rgb)
    record = {
        "schema": "anima-regional-outpaint-observation-v1",
        "outputPath": str(call.command.output_path),
        "rgbaSha256": hashlib.sha256(actual).hexdigest(),
        "alphaSha256": hashlib.sha256(actual[3::4]).hexdigest(),
        "expectedAlphaSha256": hashlib.sha256(alpha).hexdigest(),
        "nativeResults": len(seen.results),
        "encodes": len(seen.encodes),
        "merges": [{"following": x["following"], "completes": x["completes"]} for x in seen.merges],
        "historyOracle": "pending; assertions follow retained publication",
        "neuralLama": "explicit deterministic collaborator, not trained qualification",
    }
    (call.command.staging_root / "outpaint-observation.json").write_text(
        json.dumps(record, indent=2) + "\n"
    )
    assert actual == expected_rgba, (
        "Published OUT RGB/alpha differs from independent native decode/fade"
    )
    return actual


def _history_oracle(
    call: _Call,
    native: _Native,
    observed: _Observation,
    seen: _Execution,
    original: Any,
    keep: Image.Image,
) -> None:
    """Replay native solvers and external source-mask algebra after actual publication."""
    torch, plan = native.torch, call.command.sampling
    assert len(seen.results) == len(seen.encodes) == 1
    actual = seen.results[0]
    start = math.floor((1 - cast(float, plan.strength)) * plan.steps)
    begin = start * (2 if plan.scheduler == "heun" else 1)
    solver, full_sigmas, full_times = _fresh_solver(call, native)
    sigmas, times = (
        ([0.0], []) if start == plan.steps else (full_sigmas[begin:], full_times[begin:])
    )
    assert (plan.start_step, plan.begin_index, plan.sigmas, plan.timesteps) == (
        start,
        begin,
        tuple(sigmas),
        tuple(times),
    )
    if not times:
        assert not observed.passes and not seen.merges
        assert torch.equal(actual.latents, original)
        return
    if solver is not None:
        solver.set_begin_index(begin)
    with torch.inference_mode():
        noise = torch.randn(
            original.shape,
            dtype=torch.float32,
            device="cpu",
            generator=torch.Generator(device="cpu").manual_seed(plan.seed),
        ).to(device=native.device, dtype=native.dtype)
        mask = torch.tensor(list(keep.tobytes()), dtype=torch.float32)
        mask = mask.reshape(1, 1, 1, call.command.height // 8, call.command.width // 8)
        generate = (1 - mask / 255).to(device=native.device, dtype=native.dtype)
        extension = _inpaint_oracle()(original, generate, noise)
        initial = 1 if plan.strength == 1 else sigmas[0]
        assert plan.initial_sigma == initial
        latents = initial * noise + (1 - initial) * original
        generator = torch.Generator(device=native.device).manual_seed(plan.seed)
        completed: list[bool] = []
        for index, timestep in enumerate(times):
            positive, negative = observed.passes[index * 2 : index * 2 + 2]
            for prediction in (positive, negative):
                assert torch.equal(
                    prediction["latents"][..., : original.shape[-2], : original.shape[-1]],
                    latents.cpu(),
                ), "Regional OUT protected native history association"
                assert torch.equal(
                    prediction["timestep"], torch.tensor([timestep / 1000], dtype=native.dtype)
                )
            flow = negative["prediction"].to(native.device).float() + plan.guidance_scale * (
                positive["prediction"].to(native.device).float()
                - negative["prediction"].to(native.device).float()
            )
            flow = flow[..., : original.shape[-2], : original.shape[-1]]
            first_order = (
                cast(Any, solver).state_in_first_order if plan.scheduler == "heun" else True
            )
            if solver is None:
                latents = (latents.float() + (sigmas[index + 1] - sigmas[index]) * flow).to(
                    native.dtype
                )
            else:
                latents = solver.step(
                    model_output=flow,
                    timestep=solver.timesteps[begin + index],
                    sample=latents,
                    generator=generator,
                ).prev_sample.to(native.dtype)
            completes = plan.scheduler != "heun" or not first_order or sigmas[index + 1] == 0
            completed.append(completes)
            if completes:
                latents = extension.merge_intermediate_latents_with_init_latents(
                    latents, sigmas[index + 1]
                )
        assert torch.equal(actual.latents, latents), (
            "Regional OUT protected terminal history association"
        )
        assert len(seen.merges) == len(times)
        assert [x["completes"] for x in seen.merges] == completed
        for index, item in enumerate(seen.merges):
            assert item["following"] == sigmas[index + 1]
            assert torch.equal(item["original"], original.cpu())
            assert torch.equal(item["noise"], noise.cpu())
            assert torch.equal(item["generate"], generate.cpu())
            if not item["completes"]:
                assert torch.equal(item["before"], item["after"]), (
                    "Heun predictor was protected prematurely"
                )


@pytest.mark.parametrize("method", _METHODS)
def test_regional_outpaint_protected_history_red(
    native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    method: str,
) -> None:
    call = _call(tmp_path / method, main_inputs, method)
    contexts = _context_oracle(call.handoff, native)
    pixels, original = _source_oracle(call, native)
    with Image.open(io.BytesIO(call.target_bytes)) as source:
        keep, output_keep = _mask_reference(source, native.torch)
    events: list[tuple[int, int]] = []

    def progress(step: int, total: int) -> None:
        events.append((step, total))

    with (
        _preserved(native),
        _lama(call, monkeypatch) as infills,
        _execution(native, monkeypatch) as seen,
    ):
        with _observed(native, monkeypatch) as observed:
            done = _execute(call, native, on_progress=progress)
        _published(call, native, done, observed, seen, output_keep)
        _history_oracle(call, native, observed, seen, original, keep)
        _native_association(call, native, observed, contexts)
        assert native.torch.equal(seen.encodes[0], pixels)
        assert len(infills) == 1
    total = 19 if method == "heun" else 10
    assert events == [(i, total) for i in range(1, total + 1)]


def test_opaque_regional_image_control_green(
    native: _Native, main_inputs: _Producer, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    call = _image_call(tmp_path / "opaque", main_inputs, steps=6)
    _context_oracle(call.handoff, native)
    with _preserved(native), _observed(native, monkeypatch) as observed:
        done = _image_execute(call, native)
    _image_published(call, native, done, observed)


@pytest.mark.parametrize("method", _METHODS)
def test_zero_regions_match_ordinary_outpaint_without_attention_masks(
    native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    method: str,
) -> None:
    call = _call(tmp_path / method, main_inputs, method, variant="zero", steps=6)
    source = _infilled(call)
    with Image.open(io.BytesIO(call.target_bytes)) as target:
        keep, output_keep = _mask_reference(target, native.torch)
    ordinary = anima_outpaint.generate_anima_outpaint(
        anima_sampling_payload(call.command.sampling),
        call.handoff["compiledPrompts"][0]["prompt"],
        call.handoff["compiledPrompts"][1]["prompt"],
        native.models,
        source_image=source,
        keep_mask=keep,
        tokenizers=native.oracle_tokenizers,
    )
    expected = ordinary.image.convert("RGBA")
    expected.putalpha(ImageOps.invert(output_keep))
    with _preserved(native), _lama(call, monkeypatch), _execution(native, monkeypatch) as seen:
        with _observed(native, monkeypatch) as observed:
            done = _execute(call, native)
        assert _published(call, native, done, observed, seen, output_keep) == expected.tobytes()
        assert native.torch.equal(seen.results[0].latents, ordinary.latents)
        assert all(x["mask"] is None for x in observed.processors)


@pytest.mark.parametrize("strength", [0.0, 1.0])
def test_zero_and_full_strength_keep_outpaint_protection_and_rgba(
    native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    strength: float,
) -> None:
    call = _call(tmp_path / "endpoint", main_inputs, strength=strength, steps=6)
    contexts = _context_oracle(call.handoff, native) if strength else None
    pixels, original = _source_oracle(call, native)
    with Image.open(io.BytesIO(call.target_bytes)) as source:
        keep, output_keep = _mask_reference(source, native.torch)
    events: list[tuple[int, int]] = []

    def progress(step: int, total: int) -> None:
        events.append((step, total))

    with _preserved(native), _lama(call, monkeypatch), _execution(native, monkeypatch) as seen:
        with _observed(native, monkeypatch) as observed:
            done = _execute(call, native, on_progress=progress)
        _published(call, native, done, observed, seen, output_keep)
        _history_oracle(call, native, observed, seen, original, keep)
        assert native.torch.equal(seen.encodes[0], pixels)
        if contexts is not None:
            _native_association(call, native, observed, contexts)
            assert len(events) == 11
        else:
            assert observed.qwen == observed.conditioner == 0
            assert not observed.passes and not events and not seen.merges


def test_internal_prepared_tuple_is_consumed_once_without_second_lama(
    native: _Native, main_inputs: _Producer, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    call = _call(tmp_path / "prepared", main_inputs, steps=6)
    with _lama(call, monkeypatch) as infills:
        prepared = outpaint_worker_assets.prepare_worker_outpaint(
            cast(GenerateAnimaOutpaintCommand, call.command)
        )
    before = [
        (image.mode, image.size, image.tobytes())
        for image in (
            prepared[0].source,
            prepared[0].latent_keep_mask,
            prepared[0].output_keep_mask,
            prepared[1],
        )
    ]

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        pytest.fail("Prepared OUT input loaded neural LaMa twice")

    with _preserved(native), monkeypatch.context() as patch, _execution(native, patch) as seen:
        patch.setattr(outpaint_worker_assets, "load_local_lama", forbidden)
        with _observed(native, patch) as observed:
            done = _execute(call, native, _prepared_outpaint=prepared)
        _published(call, native, done, observed, seen, prepared[0].output_keep_mask)
    assert len(infills) == 1
    assert before == [
        (image.mode, image.size, image.tobytes())
        for image in (
            prepared[0].source,
            prepared[0].latent_keep_mask,
            prepared[0].output_keep_mask,
            prepared[1],
        )
    ]


@pytest.mark.parametrize("change", ["list", "source-mode", "infill-mode", "keep-mode", "keep-size"])
def test_internal_prepared_input_topology_refuses_before_native_consumption(
    native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    change: str,
) -> None:
    call = _call(tmp_path / change, main_inputs, steps=6)
    with _lama(call, monkeypatch):
        conditioning, image = outpaint_worker_assets.prepare_worker_outpaint(
            cast(GenerateAnimaOutpaintCommand, call.command)
        )
    if change == "source-mode":
        conditioning = replace(conditioning, source=conditioning.source.convert("RGB"))
    elif change == "infill-mode":
        image = image.convert("RGBA")
    elif change == "keep-mode":
        conditioning = replace(
            conditioning, latent_keep_mask=conditioning.latent_keep_mask.convert("RGB")
        )
    elif change == "keep-size":
        conditioning = replace(conditioning, latent_keep_mask=Image.new("L", (1, 1), 0))
    supplied: Any = [conditioning, image] if change == "list" else (conditioning, image)
    with _preserved(native), _execution(native, monkeypatch) as seen:
        with _observed(native, monkeypatch) as observed, pytest.raises(DerivativeError):
            _execute(call, native, _prepared_outpaint=supplied)
        assert not seen.results and not seen.encodes
        assert observed.qwen == observed.conditioner == 0
        assert not observed.passes and not observed.decoded
    assert not call.command.output_path.exists()
    assert call.command.target_path.read_bytes() == call.target_bytes


@pytest.mark.parametrize(
    "change", ["txt-command", "img-command", "txt-plan", "img-front", "default-heun"]
)
def test_outpaint_exact_class_and_sampling_refuse_before_borrowing(
    main_inputs: _Producer, tmp_path: Path, change: str
) -> None:
    call = _call(tmp_path / change, main_inputs)
    command = call.command
    target = regional.generate_current_canvas_regional_anima_outpaint
    arguments: dict[str, Any] = {"sampling_profile": _PROFILE}
    if change in ("txt-command", "img-command"):
        values = {
            k: v for k, v in vars(command).items() if k not in ("conditioning", "infill_resource")
        }
        command = (
            GenerateAnimaTxt2ImgCommand if change == "txt-command" else GenerateAnimaImg2ImgCommand
        )(**values)
    elif change == "txt-plan":
        command = replace(
            command, sampling=validate_anima_flow_sampling_plan(main_inputs()["sampling"])
        )
    elif change == "img-front":
        target = cast(Any, regional.generate_current_canvas_regional_anima_img2img)
    else:
        arguments = {}
    with pytest.raises(DerivativeError) as error:
        target(
            call.handoff["recipe"],
            command=cast(Any, command),
            compiled_prompts=call.handoff["compiledPrompts"],
            models=cast(Any, None),
            runtime=cast(Any, None),
            profile="cpu-float32-v1",
            **arguments,
        )
    assert error.value.code == "INVALID_REQUEST" and not call.command.output_path.exists()


def _wire(tmp_path: Path, call: _Call) -> _WireCase:
    case = _wire_case(tmp_path, call.handoff)
    request = case.bundle["request"]
    request["type"] = "generate-anima-outpaint"
    target = Path(request["job"]["target"]["path"])
    target.write_bytes(call.target_bytes)
    request["job"]["target"].update(_descriptor(target))
    command = cast(GenerateAnimaOutpaintCommand, call.command)
    resource = {
        "byteSize": OUTPAINT_INFILL_BYTE_SIZE,
        "role": "outpaint-infill",
        "sha256": OUTPAINT_INFILL_SHA256,
    }
    request["job"]["infillResource"] = {**resource, "path": str(command.infill_resource.path)}
    request["job"]["conditioning"] = {
        "bbox": copy.deepcopy(command.bbox),
        "kind": "alpha-outpaint-conditioning",
        "schemaVersion": 1,
        "sourceTarget": {k: v for k, v in request["job"]["target"].items() if k != "path"}
        | {"format": "png"},
        "infillResource": resource,
        "keepMask": {
            "format": "alpha8",
            "polarity": "keep",
            "sha256": command.conditioning.keep_mask_sha256,
            "byteSize": command.width * command.height,
            "width": command.width,
            "height": command.height,
        },
        "policy": {
            "edgeRadius": 16,
            "fadeDistance": 16,
            "infillMethod": "lama",
            "maskBlur": "gaussian-weighted-max",
            "minimumDenoise": 0,
            "outputMode": "contribution",
            "version": 1,
        },
    }
    case.seal()
    return case


@pytest.mark.parametrize("method", _METHODS)
def test_public_outpaint_prepares_once_before_loader_and_dispatches_exact_mode(
    main_inputs: _Producer, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, method: str
) -> None:
    call = _call(tmp_path / "source", main_inputs, method)
    case = _wire(tmp_path / "wire", call)
    case.wire["reportProgress"] = True
    parsed = worker.parse_anima_regional_request(case.wire)
    assert type(parsed.command) is GenerateAnimaOutpaintCommand
    assert parsed.command.sampling == call.command.sampling
    models = SimpleNamespace(
        **{
            name: SimpleNamespace(eval=lambda: None)
            for name in ("transformer", "text_conditioner", "qwen3_encoder", "vae")
        }
    )
    order: list[str] = []
    original_prepare = outpaint_worker_assets.prepare_worker_outpaint

    def prepare(command: Any) -> Any:
        order.append("prepare")
        return original_prepare(command)

    def load(bundle: Any, **kwargs: Any) -> Any:
        assert (
            order == ["prepare"] and bundle == parsed.command.bundle and kwargs["device"] == "cuda"
        )
        order.append("load")
        return models

    def generate(recipe: Any, **kwargs: Any) -> dict[str, object]:
        assert (
            order == ["prepare", "load"] and recipe == parsed.recipe and kwargs["models"] is models
        )
        assert type(kwargs["command"]) is GenerateAnimaOutpaintCommand
        assert kwargs["sampling_profile"] == (None if method == "euler" else _PROFILE)
        prepared = kwargs["_prepared_outpaint"]
        assert (
            prepared[0].source.mode == "RGBA" and prepared[1].tobytes() == _infilled(call).tobytes()
        )
        for index in range(parsed.command.sampling.total_steps):
            kwargs["on_progress"](index + 1, parsed.command.sampling.total_steps)
        return {"type": "generation-done", "requestId": parsed.command.request_id}

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        pytest.fail("OUT reached an old TXT/opaque IMG frontend")

    monkeypatch.setattr(outpaint_worker_assets, "prepare_worker_outpaint", prepare)
    # Support an imported alias, while retaining the same original collaborator.
    if hasattr(worker, "prepare_worker_outpaint"):
        monkeypatch.setattr(worker, "prepare_worker_outpaint", prepare)
    monkeypatch.setattr(worker, "load_anima_models", load)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_anima_outpaint", generate)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_anima_img2img", forbidden)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_anima_txt2img", forbidden)
    events: list[tuple[int, int]] = []
    with _lama(call, monkeypatch) as infills:
        done = worker.execute_anima_regional_request(
            case.wire,
            config_dir=tmp_path,
            runtime=_runtime(),
            on_progress=lambda step, total: events.append((step, total)),
        )
    assert len(infills) == 1 and done["requestId"] == parsed.command.request_id
    assert events == [
        (i, parsed.command.sampling.total_steps)
        for i in range(1, parsed.command.sampling.total_steps + 1)
    ]


@pytest.mark.parametrize(
    "change",
    [
        "opaque",
        "transparent",
        "rgb",
        "hash",
        "size",
        "alpha-hash",
        "policy",
        "infill-sha",
        "infill-size",
        "infill-path",
        "policy-bool",
        "bbox",
        "mode",
        "posterior",
        "sigma",
    ],
)
def test_public_outpaint_refusals_precede_infill_and_family_loading(
    main_inputs: _Producer, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, change: str
) -> None:
    call = _call(tmp_path / "source", main_inputs)
    case = _wire(tmp_path / "wire", call)
    job = case.bundle["request"]["job"]
    target = Path(job["target"]["path"])
    if change in ("opaque", "transparent", "rgb"):
        image = _pixels(call.command.width, call.command.height)
        if change != "rgb":
            image = image.convert("RGBA")
            image.putalpha(255 if change == "opaque" else 0)
        image.save(target, format="PNG", icc_profile=SRGB_ICC_PROFILE)
        desc = _descriptor(target)
        job["target"].update(desc)
        job["conditioning"]["sourceTarget"].update({k: v for k, v in desc.items() if k != "path"})
    elif change == "hash":
        job["target"]["sha256"] = "0" * 64
    elif change == "size":
        job["target"]["byteSize"] += 1
    elif change == "alpha-hash":
        job["conditioning"]["keepMask"]["sha256"] = "0" * 64
    elif change == "policy":
        job["conditioning"]["policy"]["edgeRadius"] = 15
    elif change == "infill-sha":
        job["infillResource"]["sha256"] = "0" * 64
    elif change == "infill-size":
        job["infillResource"]["byteSize"] += 1
    elif change == "infill-path":
        job["infillResource"]["path"] = str(target)
    elif change == "policy-bool":
        job["conditioning"]["policy"]["version"] = True
    elif change == "bbox":
        job["conditioning"]["bbox"]["x"] += 8
    elif change == "mode":
        job["sampling"]["mode"] = "txt2img"
    elif change == "posterior":
        job["sampling"]["posteriorSeed"] ^= 1
    else:
        job["sampling"]["initialSigma"] = 1
    case.seal()

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        pytest.fail("Invalid OUT target/identity reached neural loading")

    monkeypatch.setattr(outpaint_worker_assets, "load_local_lama", forbidden)
    monkeypatch.setattr(worker, "load_anima_models", forbidden)
    with pytest.raises(DerivativeError):
        worker.execute_anima_regional_request(case.wire, config_dir=tmp_path, runtime=_runtime())
    assert not (case.root / "output.png").exists()


def test_outpaint_capability_uses_complete_anima_and_existing_outpaint_prerequisites() -> None:
    for runtime, expected in ((None, False), (_runtime(bf16=False), False), (_runtime(), True)):
        caps = cast(list[str], inference_main.inference_ready_message(runtime)["capabilities"])
        assert (worker.ANIMA_REGIONAL_OUTPAINT_CAPABILITY in caps) is expected
        if expected:
            assert {
                worker.ANIMA_REGIONAL_CAPABILITY,
                worker.ANIMA_REGIONAL_IMG2IMG_CAPABILITY,
                worker.ANIMA_REGIONAL_SAMPLING_CAPABILITY,
                "anima-outpaint",
                "anima-img2img",
            } <= set(caps)


@pytest.mark.parametrize(
    "stage", ["infill", "encode", "corrector", "progress", "decode", "publication"]
)
def test_outpaint_failure_preserves_target_models_rng_and_fresh_recovery(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    stage: str,
) -> None:
    baseline = _call(tmp_path / "baseline", main_inputs, steps=6)
    with Image.open(io.BytesIO(baseline.target_bytes)) as source:
        _, output_keep = _mask_reference(source, cpu_native.torch)
    with (
        _preserved(cpu_native),
        _lama(baseline, monkeypatch),
        _execution(cpu_native, monkeypatch) as seen,
    ):
        with _observed(cpu_native, monkeypatch) as observed:
            done = _execute(baseline, cpu_native)
        expected = _published(baseline, cpu_native, done, observed, seen, output_keep)
    failed = _call(tmp_path / "failed", main_inputs, steps=6)
    sentinel = RuntimeError(f"declared OUT {stage} failure")
    events: list[tuple[int, int]] = []

    def progress(step: int, total: int) -> None:
        events.append((step, total))
        if stage == "progress" and step == 2:
            raise sentinel

    with _preserved(cpu_native):
        with _lama(failed, monkeypatch), monkeypatch.context() as patch:
            if stage in ("encode", "decode", "corrector"):
                model = (
                    cpu_native.models.transformer if stage == "corrector" else cpu_native.models.vae
                )
                attr = "forward" if stage == "corrector" else stage
                owner = cast(Any, type(model))
                original = getattr(owner, attr)
                count = 0

                @wraps(original)
                def fail(self: Any, *args: Any, **kwargs: Any) -> Any:
                    nonlocal count
                    if self is model:
                        count += 1
                        if count == (3 if stage == "corrector" else 1):
                            raise sentinel
                    return original(self, *args, **kwargs)

                patch.setattr(owner, attr, fail)
            elif stage == "infill":

                def fail_load(*_args: Any, **_kwargs: Any) -> Any:
                    raise sentinel

                patch.setattr(outpaint_worker_assets, "load_local_lama", fail_load)
            elif stage == "publication":

                def fail_publish(*_args: Any, **_kwargs: Any) -> Any:
                    raise sentinel

                patch.setattr(regional, "publish_generation_image", fail_publish)
            with pytest.raises(BaseException) as error:
                _execute(failed, cpu_native, on_progress=progress)
            assert _contains_cause(error.value, sentinel)
        assert not failed.command.output_path.exists()
        assert failed.command.target_path.read_bytes() == failed.target_bytes
        recovery = _call(tmp_path / "recovery", main_inputs, steps=6)
        with _lama(recovery, monkeypatch), _execution(cpu_native, monkeypatch) as seen:
            with _observed(cpu_native, monkeypatch) as observed:
                done = _execute(recovery, cpu_native)
            assert _published(recovery, cpu_native, done, observed, seen, output_keep) == expected
    if stage == "progress":
        assert events == [(1, 5), (2, 5)]
