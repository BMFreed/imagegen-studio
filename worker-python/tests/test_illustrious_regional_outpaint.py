"""Mixed-alpha regional consumption through original masked/image/native owners.

InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd sources consulted directly:
compileCanvasGraph.graftOutpaint/graftMaskTail, sd/create_gradient_mask.py,
sd/denoise_latents.py and backend/stable_diffusion/extensions/inpaint.py.
The existing Studio snapshot, LaMa, coherence, masked native loop and RGBA
contribution owners are reused. Only neural LaMa is an explicitly labelled
collaborator in tiny native cases; real input snapshots/masks and all dual-CLIP,
attention, solver, VAE, conversion and exclusive PNG operations remain original.
This file does not qualify trained LaMa or genuine Main/installed execution.
ROOT owns subject imports, typing, collection, execution and mutations.
"""

from __future__ import annotations

import contextlib
import copy
import hashlib
import importlib
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from dataclasses import replace
from functools import wraps
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image, ImageOps

from imagegen_worker import illustrious_regional_worker as worker
from imagegen_worker import inference_main, outpaint_worker_assets, sdxl_outpaint
from imagegen_worker.derivatives import SRGB_ICC_PROFILE
from imagegen_worker.inference import MLRuntime
from imagegen_worker.lama_infill import OUTPAINT_INFILL_BYTE_SIZE, OUTPAINT_INFILL_SHA256
from imagegen_worker.outpaint_conditioning import prepare_outpaint_conditioning
from imagegen_worker.protocol import (
    AlphaOutpaintConditioning,
    GenerateIllustriousOutpaintCommand,
    OutpaintInfillResource,
)
from test_illustrious_regional_conditioning import (
    _first_attention,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_dpmpp_2m import CPU_ENCODING, CUDA_ENCODING
from test_illustrious_regional_embeddings import (
    _models,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
    _with_resources,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _case as _image_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _generate as _generate_opaque,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _parameters,  # pyright: ignore[reportPrivateUsage]
    _source,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _aliases,  # pyright: ignore[reportPrivateUsage]
    _quantized_bytes,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_vae import (
    _prepare,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_worker import (
    _case as _wire_text_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_worker import (
    _descriptor,  # pyright: ignore[reportPrivateUsage]
    _seal,  # pyright: ignore[reportPrivateUsage]
)

SCHEDULERS = ("euler", "euler_a", "dpmpp_2m", "dpmpp_2m_k")
PROFILE_STEMS = {
    "euler": "ordinary-canvas-euler-outpaint",
    "euler_a": "ordinary-canvas-euler-ancestral-outpaint",
    "dpmpp_2m": "ordinary-canvas-dpmpp-2m-outpaint",
    "dpmpp_2m_k": "ordinary-canvas-dpmpp-2m-outpaint",
}


@pytest.fixture(scope="module")
def cpu() -> Iterator[Any]:
    with _models("cpu") as native:
        yield native


@pytest.fixture(scope="module")
def cuda() -> Iterator[Any]:
    with _models("cuda") as native:
        yield native


@pytest.fixture(scope="module", params=("cpu", "cuda"))
def lane(request: pytest.FixtureRequest) -> Any:
    return request.getfixturevalue(request.param)


@pytest.fixture
def output() -> Any:
    return importlib.import_module("imagegen_worker.illustrious_regional_output")


def _mixed(image: Image.Image) -> Image.Image:
    source = image.convert("RGBA")
    alpha = Image.new("L", image.size, 0)
    alpha.paste(255, (0, 0, image.width * 3 // 4, image.height))
    alpha.paste(127, (image.width * 3 // 4, 0, image.width * 3 // 4 + 1, image.height))
    source.putalpha(alpha)
    return source


def _case(
    tmp_path: Path,
    native: Any,
    *,
    scheduler: str = "euler",
    strength: float = 0.5,
    prepared: bool = False,
    precision: str = "FP32",
    name: str = "outpaint",
) -> Any:
    recipe = _with_resources(_recipe(_region()))
    # Retain a protected interior after the unchanged 16px coherence/fade policy.
    # The historical 24x16 fixture is entirely inside its edge neighborhood.
    recipe["bbox"].update(width=64, height=64)
    for region in recipe["regions"]:
        coverage = region["coverage"]
        prior = coverage["bounds"]
        alpha = Image.new("L", (64, 64), 0)
        alpha.paste(Image.frombytes("L", (prior["width"], prior["height"]), coverage["alpha"]))
        coverage.update(bounds=dict(recipe["bbox"]), alpha=alpha.tobytes())
    case = _image_case(tmp_path, native, recipe=recipe, strength=strength, name=name)
    source = _mixed(case.source)
    source.save(case.target, icc_profile=SRGB_ICC_PROFILE)
    snapshot = case.target.read_bytes()
    infill = tmp_path / "explicit-lama-collaborator.pt"
    infill.write_bytes(b"not a trained LaMa model")
    image_command = replace(
        case.command,
        target_sha256=hashlib.sha256(snapshot).hexdigest(),
        target_byte_size=len(snapshot),
        scheduler=scheduler,
        cfg_rescale=0.7,
        vae_precision=precision if prepared else case.command.vae_precision,
    )
    case.command = GenerateIllustriousOutpaintCommand(
        **cast(dict[str, Any], vars(image_command)),
        conditioning=AlphaOutpaintConditioning(
            bbox=image_command.bbox,
            source_sha256=image_command.target_sha256,
            source_byte_size=len(snapshot),
            width=source.width,
            height=source.height,
            keep_mask_sha256=hashlib.sha256(source.getchannel("A").tobytes()).hexdigest(),
            keep_mask_byte_size=source.width * source.height,
        ),
        infill_resource=OutpaintInfillResource(
            infill, OUTPAINT_INFILL_SHA256, OUTPAINT_INFILL_BYTE_SIZE
        ),
    )
    case.args["profile"] = CUDA_ENCODING if native.device == "cuda" else CPU_ENCODING
    suffix = (
        "cuda-vae-v1" if prepared else ("cuda-fp16-v1" if native.device == "cuda" else "cpu-v1")
    )
    case.args["denoising_profile"] = f"{PROFILE_STEMS[scheduler]}-{suffix}"
    case.original = source
    case.infilled = _source(source.width, source.height, 17)
    if prepared:
        case.vae_dtype = _prepare(native, _parameters(case), native_upcast=False)
    return case


@contextmanager
def _infill_collaborator(case: Any, monkeypatch: pytest.MonkeyPatch) -> Generator[list[Any]]:
    calls: list[Any] = []

    def load(path: Any, **kwargs: Any) -> Any:
        assert path == case.command.infill_resource.path
        assert kwargs == {
            "expected_sha256": OUTPAINT_INFILL_SHA256,
            "expected_byte_size": OUTPAINT_INFILL_BYTE_SIZE,
            "device": "cpu",
        }

        def infill(source: Image.Image) -> Image.Image:
            assert source is not case.original and source.mode == "RGBA"
            assert source.tobytes() == case.original.tobytes()
            calls.append(source)
            return case.infilled.copy()

        return SimpleNamespace(infill=infill)

    with monkeypatch.context() as patch:
        patch.setattr(outpaint_worker_assets, "load_local_lama", load)
        yield calls


def _generate(output: Any, native: Any, case: Any) -> Any:
    recipe, command = copy.deepcopy(case.recipe), copy.deepcopy(case.command)
    target = case.target.read_bytes()
    try:
        with _preserved(native):
            return output.generate_current_canvas_regional_outpaint(
                case.recipe, command=case.command, **case.args
            )
    finally:
        assert case.recipe == recipe and case.command == command
        assert case.target.read_bytes() == target


@contextmanager
def _observe(output: Any, native: Any, monkeypatch: pytest.MonkeyPatch) -> Generator[Any]:
    seen = SimpleNamespace(
        runs=[],
        outputs=[],
        masks=[],
        noise=[],
        encodes=[],
        forwards=[],
        attention=[],
        publications=[],
        receipts=[],
    )
    masked = sdxl_outpaint.run_sdxl_outpaint_pipeline
    mask_step = sdxl_outpaint._OutpaintState.step  # pyright: ignore[reportPrivateUsage]
    entry = output.run_current_canvas_regional_denoising
    publisher = output.publish_generation_image
    encode = cast(Any, type(native.pipeline.vae)).encode
    forward = cast(Any, type(native.pipeline.unet)).forward
    processor = native.processor_type.__call__
    first_site = _first_attention(native, native.pipeline.unet)

    @wraps(masked)
    def run(current: Any, *args: Any, **kwargs: Any) -> Any:
        seen.runs.append((current, kwargs))
        return masked(current, *args, **kwargs)

    @wraps(entry)
    def entered(*args: Any, **kwargs: Any) -> Any:
        result = entry(*args, **kwargs)
        seen.outputs.append(result.images.detach().clone())
        return result

    @wraps(mask_step)
    def merged(state: Any, current: Any, index: int, timestep: Any, payload: Any) -> Any:
        before = payload["latents"].detach().clone()
        count = len(seen.noise)
        result = mask_step(state, current, index, timestep, payload)
        seen.masks.append(
            SimpleNamespace(
                before=before,
                after=result["latents"].detach().clone(),
                original=state.original.detach().clone(),
                noise=state.noise.detach().clone(),
                generate=state.generate_mask.detach().clone(),
                timestep=timestep.detach().clone(),
                next_timestep=None
                if index + 1 == len(state.timesteps)
                else state.timesteps[index + 1].detach().clone(),
                protected=seen.noise[-1] if len(seen.noise) > count else None,
                maximum=current.scheduler.config.num_train_timesteps,
            )
        )
        return result

    @wraps(encode)
    def encoded(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is native.pipeline.vae:
            seen.encodes.append(args[0].detach().clone())
        return encode(current, *args, **kwargs)

    @wraps(forward)
    def forwarded(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is native.pipeline.unet:
            seen.forwards.append(kwargs["encoder_hidden_states"].detach().clone())
        return forward(current, *args, **kwargs)

    @wraps(processor)
    def attended(current: Any, attention: Any, *args: Any, **kwargs: Any) -> Any:
        if attention is first_site:
            seen.attention.append(kwargs["attention_mask"].detach().clone())
        return processor(current, attention, *args, **kwargs)

    @wraps(publisher)
    def published(image: Image.Image, **kwargs: Any) -> Any:
        seen.publications.append((image.copy(), kwargs))
        receipt = publisher(image, **kwargs)
        seen.receipts.append(receipt)
        return receipt

    def observe_noise(original: Any) -> Any:
        @wraps(original)
        def added(current: Any, *args: Any, **kwargs: Any) -> Any:
            result = original(current, *args, **kwargs)
            seen.noise.append(result.detach().clone())
            return result

        return added

    with monkeypatch.context() as patch:
        patch.setattr(sdxl_outpaint._OutpaintState, "step", merged)  # pyright: ignore[reportPrivateUsage]
        patch.setattr(cast(Any, type(native.pipeline.vae)), "encode", encoded)
        patch.setattr(cast(Any, type(native.pipeline.unet)), "forward", forwarded)
        patch.setattr(native.processor_type, "__call__", attended)
        for cls in (
            native.diffusers.EulerDiscreteScheduler,
            native.diffusers.EulerAncestralDiscreteScheduler,
            native.diffusers.DPMSolverMultistepScheduler,
        ):
            patch.setattr(cls, "add_noise", observe_noise(cls.add_noise))
        with (
            _aliases(patch, masked, run),
            _aliases(patch, entry, entered),
            _aliases(patch, publisher, published),
        ):
            yield seen


def _assert_consumed(native: Any, case: Any, seen: Any, receipt: Any) -> bytes:
    torch = native.torch
    assert len(seen.runs) == len(seen.outputs) == len(seen.encodes) == 1
    assert len(seen.publications) == len(seen.receipts) == 1
    assert receipt is seen.receipts[0]
    fresh, options = seen.runs[0]
    assert fresh is not native.pipeline and fresh.unet is native.pipeline.unet
    assert fresh.vae is native.pipeline.vae and fresh.scheduler is not native.pipeline.scheduler
    assert fresh._igs_outpaint_state is None
    assert "_igs_prepared_image_latents" not in vars(fresh)
    assert "prepare_latents" not in vars(fresh)
    assert "prepare_extra_step_kwargs" not in vars(fresh)
    assert options["image"].tobytes() == case.infilled.tobytes()
    assert options["denoising_strength"] == case.command.denoising_strength
    assert options["cfg_rescale"] == 0.7
    masks = prepare_outpaint_conditioning(
        case.original, coherence_edge_radius=16, minimum_denoise=0, output_fade_radius=16
    )
    assert options["keep_mask"].tobytes() == masks.latent_keep_mask.tobytes()
    selected = fresh.num_timesteps
    assert len(seen.masks) == len(seen.forwards) == selected
    assert len(seen.attention) >= selected
    assert len(seen.noise) == selected
    expected_generate = (
        1
        - torch.tensor(list(masks.latent_keep_mask.tobytes()), dtype=torch.float32).reshape(
            1, 1, case.command.height // 8, case.command.width // 8
        )
        / 255
    )
    expected_generate = expected_generate.to(device=native.device, dtype=native.dtype)
    noise = None
    for index, merge in enumerate(seen.masks):
        assert torch.equal(merge.generate, expected_generate)
        if noise is not None:
            assert torch.equal(merge.noise, noise), "mask owner re-randomized source noise"
        noise = merge.noise
        if index == selected - 1:
            expected = torch.where(expected_generate > 0, merge.before, merge.original)
        else:
            assert merge.protected is not None
            threshold = merge.next_timestep.item() / merge.maximum
            expected = torch.where(expected_generate > threshold, merge.before, merge.protected)
        assert torch.equal(merge.after, expected), "regional OUT mask polarity/source merge changed"
    rgb = Image.frombytes("RGB", case.original.size, _quantized_bytes(native, seen.outputs[0]))
    rgba = rgb.convert("RGBA")
    expected_alpha = ImageOps.invert(masks.output_keep_mask)
    rgba.putalpha(expected_alpha)
    with Image.open(case.command.output_path) as actual:
        actual.load()
        assert actual.mode == "RGBA" and actual.info["icc_profile"] == SRGB_ICC_PROFILE
        assert actual.size == case.original.size and actual.tobytes() == rgba.tobytes()
        assert actual.getchannel("A").tobytes() == expected_alpha.tobytes()
    assert expected_alpha.getextrema() == (0, 255)
    assert seen.publications[0][1]["output_mode"] == "RGBA"
    assert seen.publications[0][0].tobytes() == rgba.tobytes()
    assert receipt["requestId"] == case.command.request_id
    assert receipt["outputPath"] == str(case.command.output_path)
    assert receipt["seed"] == case.command.seed
    assert not list(case.root.glob(".*.tmp"))
    # The RGB source normalization is independent from the consumed encoder tensor.
    np = pytest.importorskip("numpy")
    normalized = torch.from_numpy(np.asarray(case.infilled).astype(np.float32) / 255)
    normalized = normalized.permute(2, 0, 1).unsqueeze(0) * 2 - 1
    assert torch.equal(
        seen.encodes[0],
        normalized.to(device=native.device, dtype=next(native.pipeline.vae.parameters()).dtype),
    )
    return rgba.tobytes()


@pytest.mark.parametrize("scheduler", SCHEDULERS)
@pytest.mark.parametrize("strength", (0.0, 0.5))
def test_regional_outpaint_native_mask_and_rgba_consumption(
    tmp_path: Path,
    lane: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    scheduler: str,
    strength: float,
) -> None:
    case = _case(tmp_path, lane, scheduler=scheduler, strength=strength)
    with (
        _infill_collaborator(case, monkeypatch) as infills,
        _observe(output, lane, monkeypatch) as seen,
    ):
        receipt = _generate(output, lane, case)
        _assert_consumed(lane, case, seen, receipt)
    assert len(infills) == 1


@pytest.mark.parametrize("scheduler", SCHEDULERS)
@pytest.mark.parametrize("precision", ("Auto", "FP16", "FP32"))
def test_prepared_vae_outpaint_preserves_mask_capture_and_owned_encoder_slot(
    tmp_path: Path,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    scheduler: str,
    precision: str,
) -> None:
    with _models("cuda") as native:
        case = _case(tmp_path, native, scheduler=scheduler, prepared=True, precision=precision)
        with _infill_collaborator(case, monkeypatch), _observe(output, native, monkeypatch) as seen:
            receipt = _generate(output, native, case)
            _assert_consumed(native, case, seen, receipt)
        assert seen.runs[0][1]["output_type"] == "latent"


def test_regional_outpaint_mask_direction_red(
    tmp_path: Path,
    cpu: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    case = _case(tmp_path, cpu)
    with _infill_collaborator(case, monkeypatch), _observe(output, cpu, monkeypatch) as seen:
        receipt = _generate(output, cpu, case)
        _assert_consumed(cpu, case, seen, receipt)


def test_opaque_img_control_green(tmp_path: Path, cpu: Any, output: Any) -> None:
    case = _image_case(tmp_path, cpu, name="legacy-opaque")
    done = _generate_opaque(output, cpu, case)
    with Image.open(case.command.output_path) as actual:
        actual.load()
        assert actual.mode == "RGB"
    assert done["requestId"] == case.command.request_id


@pytest.mark.parametrize("fault", ("second-step", "decode", "publication"))
def test_regional_outpaint_native_failure_restores_then_recovers(
    tmp_path: Path,
    cpu: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    fault: str,
) -> None:
    case = _case(tmp_path, cpu, strength=1.0)
    sentinel = RuntimeError("owned OUT failure")
    calls = 0
    fresh: list[Any] = []
    original_run = sdxl_outpaint.run_sdxl_outpaint_pipeline

    def remember(current: Any, *args: Any, **kwargs: Any) -> Any:
        fresh.append(current)
        return original_run(current, *args, **kwargs)

    with (
        _infill_collaborator(case, monkeypatch),
        monkeypatch.context() as patch,
        _aliases(patch, original_run, remember),
    ):
        if fault == "second-step":
            owner = cast(Any, type(cpu.pipeline.unet))
            original = owner.forward

            @wraps(original)
            def fail(current: Any, *args: Any, **kwargs: Any) -> Any:
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise sentinel
                return original(current, *args, **kwargs)

            patch.setattr(owner, "forward", fail)
        elif fault == "decode":

            def fail_decode(*_args: Any, **_kwargs: Any) -> Any:
                raise sentinel

            patch.setattr(cast(Any, type(cpu.pipeline.vae)), "decode", fail_decode)
        else:

            def fail_publish(*_args: Any, **_kwargs: Any) -> Any:
                raise sentinel

            patch.setattr(output, "publish_generation_image", fail_publish)
        with pytest.raises(RuntimeError) as error:
            _generate(output, cpu, case)
        assert error.value is sentinel
    assert len(fresh) == 1 and fresh[0]._igs_outpaint_state is None
    assert "_igs_prepared_image_latents" not in vars(fresh[0])
    assert "prepare_latents" not in vars(fresh[0])
    assert not case.command.output_path.exists()
    with _infill_collaborator(case, monkeypatch), _observe(output, cpu, monkeypatch) as seen:
        done = _generate(output, cpu, case)
        _assert_consumed(cpu, case, seen, done)


def _wire_case(tmp_path: Path) -> Any:
    case = _wire_text_case(tmp_path)
    case.request["type"] = "generate-illustrious-outpaint"
    case.bundle["compositionProfile"] = "invoke-canvas-v1"
    job = case.request["job"]
    job["sampling"]["denoisingStrength"] = 0.5
    width, height = job["target"]["width"], job["target"]["height"]
    source = _mixed(_source(width, height))
    source.save(case.target, icc_profile=SRGB_ICC_PROFILE)
    case.target.chmod(0o600)
    job["target"].update(_descriptor(case.target))
    lama = tmp_path / "pinned-lama.pt"
    lama.write_bytes(b"explicit invalid resource for refusal and dispatch doubles")
    frozen = {
        "role": "outpaint-infill",
        "byteSize": OUTPAINT_INFILL_BYTE_SIZE,
        "sha256": OUTPAINT_INFILL_SHA256,
    }
    job["infillResource"] = {**frozen, "path": str(lama)}
    job["conditioning"] = {
        "kind": "alpha-outpaint-conditioning",
        "schemaVersion": 1,
        "bbox": copy.deepcopy(job["bbox"]),
        "sourceTarget": {key: value for key, value in job["target"].items() if key != "path"},
        "keepMask": {
            "format": "alpha8",
            "polarity": "keep",
            "width": width,
            "height": height,
            "byteSize": width * height,
            "sha256": hashlib.sha256(source.getchannel("A").tobytes()).hexdigest(),
        },
        "policy": {
            "version": 1,
            "edgeRadius": 16,
            "fadeDistance": 16,
            "infillMethod": "lama",
            "maskBlur": "gaussian-weighted-max",
            "minimumDenoise": 0,
            "outputMode": "contribution",
        },
        "infillResource": frozen,
    }
    job["conditioning"]["sourceTarget"]["format"] = "png"
    _seal(case)
    return case


@pytest.mark.parametrize("scheduler", SCHEDULERS)
@pytest.mark.parametrize("precision", ("Auto", "FP16", "FP32"))
def test_outpaint_wire_keeps_existing_command_policy_and_prepared_profile(
    tmp_path: Path,
    scheduler: str,
    precision: str,
) -> None:
    case = _wire_case(tmp_path)
    case.request["job"]["sampling"]["scheduler"] = scheduler
    case.request["job"]["vaePrecision"] = precision
    _seal(case)
    request = worker.parse_regional_request(case.wire)
    assert type(request.command) is GenerateIllustriousOutpaintCommand
    assert (
        request.command.conditioning.keep_mask_sha256
        == case.request["job"]["conditioning"]["keepMask"]["sha256"]
    )
    assert request.initialization_profile is None
    assert request.parameters.vae_precision == precision
    profile = worker._denoising_profile(  # pyright: ignore[reportPrivateUsage]
        request.parameters, None, request.composition_profile, outpaint=True
    )
    suffix = "cuda-fp16-v1" if precision == "FP16" else "cuda-vae-v1"
    assert profile == f"{PROFILE_STEMS[scheduler]}-{suffix}"


@pytest.mark.parametrize(
    "fault",
    (
        "alpha-digest",
        "source-digest",
        "opaque",
        "transparent",
        "target-bytes",
        "lama-file",
        "lama-digest",
        "initialization",
        "composition",
        "output-exists",
        "strength",
        "policy",
    ),
)
def test_outpaint_refusal_precedes_native_model_loading(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    fault: str,
) -> None:
    case = _wire_case(tmp_path)
    job = case.request["job"]
    if fault == "alpha-digest":
        job["conditioning"]["keepMask"]["sha256"] = "0" * 64
    elif fault == "source-digest":
        job["conditioning"]["sourceTarget"]["sha256"] = "0" * 64
    elif fault in ("opaque", "transparent"):
        Image.new(
            "RGBA",
            (job["target"]["width"], job["target"]["height"]),
            (1, 2, 3, 255 if fault == "opaque" else 0),
        ).save(case.target, icc_profile=SRGB_ICC_PROFILE)
        job["target"].update(_descriptor(case.target))
        job["conditioning"]["sourceTarget"].update(
            {key: value for key, value in job["target"].items() if key != "path"}
        )
    elif fault == "target-bytes":
        case.target.write_bytes(b"changed")
    elif fault == "lama-file":
        Path(job["infillResource"]["path"]).unlink()
    elif fault == "lama-digest":
        job["infillResource"]["sha256"] = "0" * 64
    elif fault == "initialization":
        case.bundle["initializationProfile"] = "invoke-cpu-f32-add-noise-v1"
    elif fault == "composition":
        del case.bundle["compositionProfile"]
    elif fault == "output-exists":
        Path(job["output"]["pngPath"]).write_bytes(b"preserve winner")
    elif fault == "strength":
        job["sampling"]["denoisingStrength"] = True
    else:
        job["conditioning"]["policy"]["edgeRadius"] = 0
    _seal(case)
    loads: list[Any] = []

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        loads.append(True)
        raise AssertionError("refused OUT reached checkpoint loading")

    monkeypatch.setattr(worker, "load_illustrious_pipeline", forbidden)
    if fault not in ("lama-file", "lama-digest"):
        # Only neural infill is a collaborator. Otherwise a pre-existing invalid
        # LaMa file could hide removal of the target/policy admission guard.
        def neutral_infill(image: Image.Image) -> Image.Image:
            return image.convert("RGB")

        def neutral_lama(*_args: Any, **_kwargs: Any) -> Any:
            return SimpleNamespace(infill=neutral_infill)

        monkeypatch.setattr(outpaint_worker_assets, "load_local_lama", neutral_lama)
    runtime = cast(
        MLRuntime, SimpleNamespace(torch=SimpleNamespace(no_grad=contextlib.nullcontext))
    )
    response = inference_main.process_inference_request(
        case.wire, config_dir=tmp_path, runtime=runtime
    )
    assert response["type"] == "error" and loads == []
    path = Path(job["output"]["pngPath"])
    assert not path.exists() or path.read_bytes() == b"preserve winner"


def test_worker_prepares_infill_once_before_loader_and_uses_captured_private_output(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    case = _wire_case(tmp_path)
    events: list[str] = []
    prepared = (object(), object())
    component = SimpleNamespace(eval=lambda: events.append("eval"))
    pipeline = SimpleNamespace(
        text_encoder=component, text_encoder_2=component, unet=component, vae=component
    )
    runtime = cast(
        MLRuntime, SimpleNamespace(torch=SimpleNamespace(no_grad=contextlib.nullcontext))
    )

    def prepare(command: Any) -> Any:
        assert type(command) is GenerateIllustriousOutpaintCommand
        events.append("infill")
        return prepared

    def load(parameters: Any, **kwargs: Any) -> Any:
        assert events == ["infill"]
        assert parameters.positive_prompt == parameters.negative_prompt == ""
        assert kwargs["mode"] == "txt2img"
        events.append("load")
        return pipeline, None

    def publish(recipe: Any, **kwargs: Any) -> Any:
        assert kwargs["outpaint"] is True and kwargs["img2img"] is True
        assert kwargs["_prepared_outpaint"] is prepared
        assert type(kwargs["command"]) is GenerateIllustriousOutpaintCommand
        assert kwargs["denoising_profile"] == "ordinary-canvas-euler-outpaint-cuda-fp16-v1"
        assert recipe["bbox"] == case.bundle["recipe"]["bbox"]
        events.append("publish")
        return {
            "type": "generation-done",
            "requestId": kwargs["command"].request_id,
            "outputPath": str(kwargs["command"].output_path),
            "seed": kwargs["command"].seed,
        }

    monkeypatch.setattr(worker, "prepare_worker_outpaint", prepare)
    monkeypatch.setattr(worker, "load_illustrious_pipeline", load)

    def no_setup(*_args: Any) -> None:
        return None

    def no_bindings(*_args: Any) -> tuple[()]:
        return ()

    monkeypatch.setattr(worker, "prepare_regional_loras", no_setup)
    monkeypatch.setattr(worker, "install_capture_hooks", no_setup)
    monkeypatch.setattr(worker, "qualify_bindings", no_bindings)
    monkeypatch.setattr(worker, "_generate_current_canvas_regional", publish)
    reply = inference_main.process_inference_request(
        case.wire, config_dir=tmp_path, runtime=runtime
    )
    assert reply["type"] == "generation-done"
    assert events == ["infill", "load", "eval", "eval", "eval", "eval", "publish"]
