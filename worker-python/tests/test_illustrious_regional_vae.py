"""Authored selected-VAE contracts; ROOT alone imports and executes.

InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd: generation/core/graph.ts,
app/invocations/model.py and vae/latents_to_image.py. Its decoder casts the
terminal latent BEFORE scaling and native VAE decode. The independent oracle
below calls the original native decoder and quantizes without production VAE or
image-conversion helpers. Native observations delegate original class methods;
no fixed-PT legacy observer assertions are reused for the new latent route.

Small random complete VAEs establish exact loading, dtype, ownership and pixels,
not trained quality. Genuine Main/installed checkpoint proof remains ROOT-owned.
Borrowed-state baselines start after each fresh owned preparation. Old native
profiles keep their existing decode path and receive a separate GREEN control.
"""

from __future__ import annotations

import contextlib
import copy
import hashlib
import importlib
import sys
from collections.abc import Generator, Iterator
from dataclasses import replace
from functools import wraps
from pathlib import Path
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import illustrious_regional_output as publication
from imagegen_worker import illustrious_regional_vae as selected
from imagegen_worker import illustrious_regional_worker as worker
from imagegen_worker import inference_main
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.inference import MLRuntime
from imagegen_worker.inference_external_vae import load_generation_vae
from imagegen_worker.inference_vae import configure_vae_precision
from imagegen_worker.protocol import GenerationVae, IllustriousNoiseProfile
from test_illustrious_regional_denoising import (
    _observe as _native_observer,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_embeddings import (
    _bind,  # pyright: ignore[reportPrivateUsage]
    _models,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
    _with_resources,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_embeddings import (
    _save as _save_ti,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_lora import (
    CLIP2_PATH,
    UNET_PATH,
    _pair,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _case as _output_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    _parameters,  # pyright: ignore[reportPrivateUsage]
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_worker import (
    _case as _wire_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_worker import (
    _seal,  # pyright: ignore[reportPrivateUsage]
)
from test_sdxl_lora import (
    _save as _save_lora,  # pyright: ignore[reportPrivateUsage]
)

ENCODING = "ordinary-canvas-invoke-dualclip-exact-ti-shared-readonly-cuda-fp16-v1"
EXECUTION = "ordinary-canvas-euler-txt2img-cuda-vae-v1"
LEGACY_EXECUTION = "ordinary-canvas-euler-txt2img-cuda-fp16-v2"
POLICIES = (("Auto", False), ("Auto", True), ("FP16", True), ("FP32", False))


@pytest.fixture(params=("cpu", "cuda"))
def native(request: pytest.FixtureRequest) -> Iterator[Any]:
    with _models(request.param) as value:
        yield value


@pytest.fixture
def cuda() -> Iterator[Any]:
    with _models("cuda") as value:
        yield value


def _output(images: Any) -> Any:
    cls = importlib.import_module(
        "diffusers.pipelines.stable_diffusion_xl.pipeline_output"
    ).StableDiffusionXLPipelineOutput
    return cls(images=images)


def _descriptor(path: Path) -> GenerationVae:
    data = path.read_bytes()
    return GenerationVae(path=path, sha256=hashlib.sha256(data).hexdigest(), byte_size=len(data))


def _save_vae(native: Any, tmp_path: Path, *, marker: float = 0.0) -> tuple[Any, Path, Any]:
    """Full tiny native safetensors, selected with the unchanged ordinary loader."""
    source = native.pipeline.vae
    config = tmp_path / "offline-config"
    source.save_config(config / "vae")
    state = {
        name: tensor.detach().to(device="cpu", dtype=native.torch.float16).clone()
        for name, tensor in source.state_dict().items()
    }
    state["decoder.conv_out.bias"] += marker
    file = tmp_path / f"selected-{marker}.safetensors"
    pytest.importorskip("safetensors.torch").save_file(state, str(file))
    descriptor = _descriptor(file)
    model = load_generation_vae(descriptor, config, native.diffusers, native.torch)
    assert set(model.state_dict()) == set(state)
    for name, tensor in model.state_dict().items():
        assert native.torch.equal(tensor.cpu(), state[name]), "selected exact VAE values were lost"
    model.to(device=next(native.pipeline.unet.parameters()).device).eval()
    return descriptor, config, model


def _prepare(native: Any, parameters: Any, *, native_upcast: bool) -> Any:
    pipeline, torch = native.pipeline, native.torch
    pipeline.vae.register_to_config(force_upcast=native_upcast)
    configure_vae_precision(pipeline, parameters.vae_precision, torch)
    policy = pipeline.vae.config.force_upcast
    chosen = torch.float32 if policy else torch.float16
    original_vae = pipeline.vae
    before = {name: tensor.detach().clone() for name, tensor in original_vae.state_dict().items()}
    other = tuple(
        (parameter, parameter.data_ptr(), parameter.dtype)
        for owner in (pipeline.unet, pipeline.text_encoder, pipeline.text_encoder_2)
        for parameter in owner.parameters()
    )
    selected.prepare_owned_regional_vae(pipeline, parameters, torch)
    assert pipeline.vae is original_vae
    assert pipeline.vae.config.force_upcast is policy
    for name, tensor in pipeline.vae.state_dict().items():
        assert tensor.dtype == chosen
        assert torch.equal(tensor, before[name].to(dtype=chosen))
    for parameter, pointer, dtype in other:
        assert parameter.data_ptr() == pointer and parameter.dtype == dtype
    selected.validate_prepared_regional_vae(
        pipeline, parameters, torch, tuple(pipeline.vae.modules())
    )
    return chosen


def _raw(native: Any) -> Any:
    device = next(native.pipeline.unet.parameters()).device
    dtype = next(native.pipeline.unet.parameters()).dtype
    values = native.torch.linspace(-0.673, 0.819, 24, device=device, dtype=native.torch.float32)
    return values.to(dtype=dtype).reshape(1, 4, 2, 3)


def _oracle(native: Any, raw: Any, dtype: Any, decode: Any) -> tuple[Any, Any]:
    """Independent Invoke order, retaining the original native decoder itself."""
    expected_input = raw.to(dtype=dtype) / native.pipeline.vae.config.scaling_factor
    image = decode(native.pipeline.vae, expected_input, return_dict=False)[0]
    return expected_input, (image / 2 + 0.5).clamp(0, 1)


def _rgb(native: Any, image: Any) -> bytes:
    numpy = pytest.importorskip("numpy")
    planar = image[0].detach().to(device="cpu", dtype=native.torch.float32).numpy()
    rgb = numpy.rint(planar * numpy.float32(255)).astype(numpy.uint8)
    return numpy.moveaxis(rgb, 0, -1).tobytes()


@pytest.mark.parametrize("precision,native_upcast", POLICIES)
def test_native_selected_vae_prepares_before_borrow_and_casts_before_scaling(
    native: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    precision: str,
    native_upcast: bool,
) -> None:
    torch, pipeline = native.torch, native.pipeline
    # Direct helper CPU mechanics start from the same half-loaded state as ordinary loading.
    pipeline.to(dtype=torch.float16)
    descriptor, _, actual = _save_vae(native, tmp_path, marker=0.125)
    pipeline.vae = actual
    parameters = _parameters(vae=descriptor, vae_precision=precision)
    dtype = _prepare(native, parameters, native_upcast=native_upcast)
    assert selected.regional_vae_dtype(pipeline, parameters, torch) == dtype
    raw = _raw(native)
    original = cast(Any, type(actual)).decode
    expected_input, expected_image = _oracle(native, raw, dtype, original)
    calls: list[Any] = []

    @wraps(original)
    def decode(current: Any, latent: Any, *args: Any, **kwargs: Any) -> Any:
        calls.append((current, latent.detach().clone(), next(current.parameters()).dtype))
        return original(current, latent, *args, **kwargs)

    # File ownership ended at load; no decoder may reopen a replaced managed path.
    descriptor.path.unlink()
    with monkeypatch.context() as patch:
        patch.setattr(cast(Any, type(actual)), "decode", decode)
        with _preserved(native):
            result = selected.decode_regional_latents(
                _output(raw),
                pipeline=pipeline,
                parameters=parameters,
                torch=torch,
                width=24,
                height=16,
            )
    assert len(calls) == 1 and calls[0][0] is actual
    assert calls[0][2] == dtype and torch.equal(calls[0][1], expected_input)
    assert result.images.dtype == dtype
    assert torch.equal(result.images, expected_image), (
        "native selected VAE pixels differ from Invoke decode"
    )
    assert _rgb(native, result.images) == _rgb(native, expected_image)
    if dtype == torch.float32:
        late_cast = (raw / pipeline.vae.config.scaling_factor).float()
        assert not torch.equal(expected_input, late_cast), (
            "fixture must distinguish cast-before-scale"
        )


@contextlib.contextmanager
def _observe(native: Any, monkeypatch: pytest.MonkeyPatch) -> Generator[Any]:
    """Observe the original native latent call, decode and publication independently."""
    with (
        _native_observer(native.denoising, native, monkeypatch) as seen,
        monkeypatch.context() as patch,
    ):
        seen.original_outputs, seen.decoded_snapshots, seen.publications = [], [], []
        entry = native.denoising.run_current_canvas_regional_denoising
        publish = publication.publish_generation_image
        ancestral_step = native.diffusers.EulerAncestralDiscreteScheduler.step

        @wraps(ancestral_step)
        def observe_ancestral_step(current: Any, *args: Any, **kwargs: Any) -> Any:
            result = ancestral_step(current, *args, **kwargs)
            seen.steps.append((current, args, kwargs, result))
            seen.events.append("step")
            return result

        patch.setattr(
            native.diffusers.EulerAncestralDiscreteScheduler, "step", observe_ancestral_step
        )

        @wraps(entry)
        def execute(recipe: Any, **kwargs: Any) -> Any:
            result = entry(recipe, **kwargs)
            seen.original_outputs.append(result)
            seen.decoded_snapshots.append(result.images.detach().clone())
            return result

        @wraps(publish)
        def publish_original(image: Any, **kwargs: Any) -> Any:
            done = publish(image, **kwargs)
            seen.publications.append((image.copy(), kwargs, done))
            return done

        for module in tuple(cast(dict[str, Any], sys.modules).values()):
            if module is not None and str(getattr(module, "__name__", "")).startswith(
                "imagegen_worker."
            ):
                for key, value in tuple(cast(dict[str, Any], vars(module)).items()):
                    if value is entry:
                        patch.setattr(module, key, execute)
                    elif value is publish:
                        patch.setattr(module, key, publish_original)
        yield seen


def _case(
    native: Any,
    tmp_path: Path,
    precision: str,
    *,
    external: bool = False,
    name: str = "stage",
    resources: bool = False,
    scheduler: str = "euler",
    initialization: bool = False,
) -> Any:
    recipe = _with_resources(_recipe(_region(positive="SAME" if resources else "dog")))
    if resources:
        ti = _save_ti(tmp_path, native, 77, token="SAME", count=2)
        _bind(recipe, 0, "positive", ti)
    case = _output_case(tmp_path, native, recipe=recipe, exact_ti=True, name=name)
    case.args["profile"] = ENCODING
    case.args["denoising_profile"] = (
        "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cuda-vae-v1"
        if initialization
        else "ordinary-canvas-euler-ancestral-txt2img-cuda-vae-v1"
        if scheduler == "euler_a"
        else EXECUTION
    )
    vae = None
    if external:
        vae, _, model = _save_vae(native, tmp_path, marker=0.125)
        native.pipeline.vae = model
    case.command = replace(
        case.command,
        vae=vae,
        vae_precision=precision,
        scheduler=scheduler,
        noise_profile=IllustriousNoiseProfile(
            rescale_betas_zero_snr=False, timestep_spacing="leading"
        ),
    )
    return case


def _generate(native: Any, case: Any) -> Any:
    before = copy.deepcopy(case.recipe), copy.deepcopy(case.command), case.target.read_bytes()
    with _preserved(native):
        result = publication.generate_current_canvas_regional_txt2img(
            case.recipe, command=case.command, **case.args
        )
    assert case.recipe == before[0] and case.command == before[1]
    assert case.target.read_bytes() == before[2]
    return result


def _assert_published(
    native: Any, case: Any, seen: Any, done: Any, *, new_profile: bool = True
) -> bytes:
    """All consumption assertions run AFTER the real PNG has been published."""
    torch = native.torch
    assert len(seen.pipelines) == len(seen.pipeline_results) == 1
    assert seen.pipelines[0] is not native.pipeline
    assert seen.pipelines[0].vae is native.pipeline.vae
    assert len(seen.decodes) == len(seen.decode_results) == 1
    assert seen.decode_reserved == [True]
    assert len(seen.unet_results) == len(seen.steps) == case.command.steps
    assert seen.pipeline_inputs[0]["output_type"] == ("latent" if new_profile else "pt")
    assert len(seen.original_outputs) == len(seen.decoded_snapshots) == len(seen.publications) == 1
    actual = seen.original_outputs[0]
    if new_profile:
        raw = seen.pipeline_results[0].images
        assert raw.shape == (1, 4, 2, 3) and raw.dtype == torch.float16
        dtype = torch.float32 if native.pipeline.vae.config.force_upcast else torch.float16
        original_decode = cast(Any, type(native.pipeline.vae)).decode
        expected_input, expected = _oracle(native, raw, dtype, original_decode)
        assert torch.equal(seen.decodes[0], expected_input), (
            "native VAE input lost dtype-before-scaling"
        )
        assert actual.images.dtype == dtype
        assert actual is not seen.pipeline_results[0]
        assert torch.equal(actual.images, expected), (
            "published image lost the selected native decoder"
        )
    else:
        expected = seen.pipeline_results[0].images
        assert actual is seen.pipeline_results[0]
    assert torch.equal(seen.decoded_snapshots[0], expected)
    expected_rgb = _rgb(native, expected)
    with Image.open(case.command.output_path) as image:
        image.load()
        assert image.mode == "RGB" and image.size == (24, 16)
        assert image.info["icc_profile"] == SRGB_ICC_PROFILE
        assert image.tobytes() == expected_rgb, "published RGB lost exact selected VAE pixels"
    assert done is seen.publications[0][2]
    assert done["type"] == "generation-done"
    assert done["requestId"] == case.command.request_id
    assert done["outputPath"] == str(case.command.output_path)
    assert done["seed"] == case.command.seed
    assert not list(case.root.glob(".*.tmp"))
    for prediction in seen.unet_results:
        tensor = cast(Any, prediction[0] if type(prediction) is tuple else prediction.sample)
        assert tensor.dtype == torch.float16
    return expected_rgb


@pytest.mark.parametrize("precision,native_upcast", POLICIES)
def test_public_cuda_selected_vae_publishes_independent_native_pixels(
    cuda: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    precision: str,
    native_upcast: bool,
) -> None:
    case = _case(cuda, tmp_path, precision, external=True)
    _prepare(cuda, case.command, native_upcast=native_upcast)
    with _observe(cuda, monkeypatch) as seen:
        done = _generate(cuda, case)
    _assert_published(cuda, case, seen, done)


def test_regional_vae_dtype_before_scaling_consumption_red(
    cuda: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    case = _case(cuda, tmp_path, "FP32", external=True)
    _prepare(cuda, case.command, native_upcast=False)
    with _observe(cuda, monkeypatch) as seen:
        done = _generate(cuda, case)
    _assert_published(cuda, case, seen, done)
    raw = seen.pipeline_results[0].images
    assert not cuda.torch.equal(
        raw.float() / cuda.pipeline.vae.config.scaling_factor,
        (raw / cuda.pipeline.vae.config.scaling_factor).float(),
    ), "consumer fixture must distinguish moving the cast after half division"


def test_regional_vae_legacy_embedded_fp16_control_green(
    cuda: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    case = _case(cuda, tmp_path, "FP16")
    case.args["denoising_profile"] = LEGACY_EXECUTION
    with _observe(cuda, monkeypatch) as seen:
        done = _generate(cuda, case)
    _assert_published(cuda, case, seen, done, new_profile=False)


@pytest.mark.parametrize("scheduler,initialization", (("euler_a", False), ("euler_a", True)))
def test_public_vae_profiles_keep_ancestral_and_initialization_native_owners(
    cuda: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    scheduler: str,
    initialization: bool,
) -> None:
    case = _case(cuda, tmp_path, "FP32", scheduler=scheduler, initialization=initialization)
    _prepare(cuda, case.command, native_upcast=False)
    with _observe(cuda, monkeypatch) as seen:
        done = _generate(cuda, case)
    _assert_published(cuda, case, seen, done)
    assert all(
        type(pipeline.scheduler) is cuda.diffusers.EulerAncestralDiscreteScheduler
        for pipeline in seen.pipelines
    )


def test_vae_precision_changes_only_decode_with_same_native_predictions(
    cuda: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    records: list[Any] = []
    for precision, name in (("FP16", "half"), ("FP32", "single")):
        case = _case(cuda, tmp_path, precision, name=name)
        _prepare(cuda, case.command, native_upcast=False)
        with _observe(cuda, monkeypatch) as seen:
            done = _generate(cuda, case)
        _assert_published(cuda, case, seen, done)
        records.append(seen)
    for a, b in zip(records[0].unet_results, records[1].unet_results, strict=True):
        actual = cast(Any, a[0] if type(a) is tuple else a.sample)
        expected = cast(Any, b[0] if type(b) is tuple else b.sample)
        assert cuda.torch.equal(actual, expected), (
            "VAE precision altered native denoising predictions"
        )
    assert cuda.torch.equal(
        records[0].pipeline_results[0].images, records[1].pipeline_results[0].images
    )
    assert records[0].decoded_snapshots[0].dtype == cuda.torch.float16
    assert records[1].decoded_snapshots[0].dtype == cuda.torch.float32


def test_prepared_external_vae_coexists_with_real_lora_and_recipe_ti(
    cuda: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from imagegen_worker.illustrious_regional_lora import prepare_regional_loras

    state = {
        **_pair(cuda.torch, cuda.pipeline, CLIP2_PATH),
        **_pair(cuda.torch, cuda.pipeline, UNET_PATH, marker=0.25),
    }
    lora = _save_lora(tmp_path / "neighbor.safetensors", state, -0.5)
    prepare_regional_loras(cuda.pipeline, (lora,), cuda.torch)
    case = _case(cuda, tmp_path, "FP32", external=True, resources=True)
    _prepare(cuda, case.command, native_upcast=False)
    with _observe(cuda, monkeypatch) as seen:
        done = _generate(cuda, case)
    _assert_published(cuda, case, seen, done)
    assert case.recipe["regions"][0]["embeddings"]["positive"]
    assert len(seen.builds) == 2
    assert cuda.pipeline.get_list_adapters() == {}


@pytest.mark.parametrize("failure", ("second-unet", "decode"))
def test_new_vae_native_failure_preserves_borrowed_state_and_fresh_call_recovers(
    cuda: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    failure: str,
) -> None:
    case = _case(cuda, tmp_path, "FP32", external=True, name="failed")
    _prepare(cuda, case.command, native_upcast=False)
    sentinel = RuntimeError("controlled prepared VAE lifecycle failure")
    owner = cuda.pipeline.unet if failure == "second-unet" else cuda.pipeline.vae
    method = "forward" if failure == "second-unet" else "decode"
    original = getattr(cast(Any, type(owner)), method)
    calls = 0

    @wraps(original)
    def fail(current: Any, *args: Any, **kwargs: Any) -> Any:
        nonlocal calls
        if current is owner:
            calls += 1
            if calls == (2 if failure == "second-unet" else 1):
                raise sentinel
        return original(current, *args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(cast(Any, type(owner)), method, fail)
        with pytest.raises(RuntimeError) as error:
            _generate(cuda, case)
        assert error.value is sentinel
    assert not case.command.output_path.exists()
    assert not list(case.root.glob(".*.tmp"))
    healthy = _case(cuda, tmp_path, "FP32", name="recovered")
    _prepare(cuda, healthy.command, native_upcast=False)
    with _observe(cuda, monkeypatch) as seen:
        done = _generate(cuda, healthy)
    _assert_published(cuda, healthy, seen, done)


@pytest.mark.parametrize("fault", ("NaN", "infinity", "wrong-dtype", "policy", "latent-shape"))
def test_prepared_vae_refuses_invalid_state_before_native_decode(
    native: Any,
    monkeypatch: pytest.MonkeyPatch,
    fault: str,
) -> None:
    torch, pipeline = native.torch, native.pipeline
    pipeline.to(dtype=torch.float16)
    parameters = _parameters(vae_precision="FP32")
    _prepare(native, parameters, native_upcast=False)
    raw = _raw(native)
    before: list[bool] = []
    if fault in ("NaN", "infinity"):
        raw[0, 0, 0, 0] = float("nan") if fault == "NaN" else float("inf")
    elif fault == "wrong-dtype":
        raw = raw.float()
    elif fault == "policy":
        parameters = replace(parameters, vae_precision="FP16")
    elif fault == "latent-shape":
        raw = raw[:, :, :, :-1]
    original = cast(Any, type(pipeline.vae)).decode

    @wraps(original)
    def decode(current: Any, *args: Any, **kwargs: Any) -> Any:
        before.append(True)
        return original(current, *args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(cast(Any, type(pipeline.vae)), "decode", decode)
        with _preserved(native), pytest.raises(DerivativeError):
            selected.decode_regional_latents(
                _output(raw),
                pipeline=pipeline,
                parameters=parameters,
                torch=torch,
                width=24,
                height=16,
            )
    assert before == []


@pytest.mark.parametrize("precision", (None, False, "fp32", "FP64"))
def test_vae_precision_spelling_does_not_select_a_default(precision: Any) -> None:
    with pytest.raises(DerivativeError):
        selected.validate_regional_vae_parameters(_parameters(vae_precision=precision))


@pytest.mark.parametrize("fault", ("staging", "checkpoint", "missing", "changed"))
def test_real_vae_resource_identity_refuses_before_model_loading(
    native: Any,
    tmp_path: Path,
    fault: str,
) -> None:
    descriptor, _, _ = _save_vae(native, tmp_path)
    root = tmp_path / "owned"
    root.mkdir()
    checkpoint = tmp_path / "checkpoint.safetensors"
    checkpoint.write_bytes(b"checkpoint fixture")
    if fault == "staging":
        file = root / "vae.safetensors"
        file.write_bytes(descriptor.path.read_bytes())
        descriptor = _descriptor(file)
    elif fault == "checkpoint":
        descriptor = replace(descriptor, path=checkpoint)
    elif fault == "missing":
        descriptor.path.unlink()
    else:
        descriptor.path.write_bytes(b"changed")
    with pytest.raises(DerivativeError):
        selected.verify_regional_vae_resource(descriptor, root, checkpoint)


@pytest.mark.parametrize("precision", ("Auto", "FP16", "FP32"))
def test_actual_parser_and_worker_keep_selected_vae_logical_through_loading_and_preparation(
    native: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    precision: str,
) -> None:
    case = _wire_case(tmp_path)
    descriptor, config, actual_vae = _save_vae(native, tmp_path)
    case.bundle["compositionProfile"] = "invoke-canvas-v1"
    case.request["job"]["vae"] = {
        "path": str(descriptor.path),
        "sha256": descriptor.sha256,
        "byteSize": descriptor.byte_size,
    }
    case.request["job"]["vaePrecision"] = precision
    _seal(case)
    native.pipeline.to(dtype=native.torch.float16)
    native.pipeline.vae = actual_vae.to(dtype=native.torch.float16)
    observed: list[str] = []
    original_prepare = selected.prepare_owned_regional_vae

    def load(parameters: Any, **kwargs: Any) -> tuple[Any, None]:
        observed.append("load")
        assert parameters.vae == descriptor and parameters.vae_precision == precision
        assert parameters.positive_prompt == parameters.negative_prompt == ""
        assert parameters.loras == ()
        configure_vae_precision(native.pipeline, cast(Any, precision), native.torch)
        return native.pipeline, None

    @wraps(original_prepare)
    def prepare(pipeline: Any, parameters: Any, torch: Any) -> None:
        observed.append("prepare")
        assert pipeline is native.pipeline and parameters.vae == descriptor
        original_prepare(pipeline, parameters, torch)

    def publish(recipe: Any, **kwargs: Any) -> dict[str, object]:
        observed.append("output")
        assert observed == ["load", "prepare", "output"]
        assert kwargs["pipeline"].vae is actual_vae
        assert kwargs["command"].vae == descriptor
        assert kwargs["command"].vae_precision == precision
        expected = native.torch.float32 if actual_vae.config.force_upcast else native.torch.float16
        assert next(actual_vae.parameters()).dtype == expected
        assert kwargs["denoising_profile"] == EXECUTION
        return {
            "type": "generation-done",
            "protocolVersion": "1",
            "requestId": "private-1",
            "outputPath": str(case.root / "result.png"),
            "seed": 42,
        }

    monkeypatch.setattr(worker, "load_illustrious_pipeline", load)
    monkeypatch.setattr(worker, "prepare_owned_regional_vae", prepare)

    def empty_bindings(*_args: Any) -> tuple[()]:
        return ()

    monkeypatch.setattr(worker, "qualify_bindings", empty_bindings)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_txt2img", publish)
    runtime = cast(MLRuntime, native.runtime)
    result = inference_main.process_inference_request(case.wire, config_dir=config, runtime=runtime)
    assert result["type"] == "generation-done"
    assert worker.parse_regional_request(case.wire).parameters.vae == descriptor
    assert native.pipeline.vae is actual_vae


def test_regional_vae_capability_is_explicit_and_additive() -> None:
    capabilities = cast(list[str], inference_main.inference_ready_message()["capabilities"])
    assert "illustrious-regional-vae-v1" in capabilities
    assert "illustrious-regional-lora-v1" in capabilities
    assert "illustrious-regional-invoke-v1" in capabilities


def test_registered_stateful_norm_refuses_before_cast_or_forward_then_leaf_control_recovers(
    native: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An admitted eval InstanceNorm can write running buffers even without gradients."""
    torch, pipeline = native.torch, native.pipeline
    pipeline.to(dtype=torch.float16)
    parameters = _parameters(vae_precision="FP32")
    configure_vae_precision(pipeline, "FP32", torch)
    original_norm = pipeline.vae.decoder.conv_norm_out
    norm = (
        torch.nn.InstanceNorm2d(
            original_norm.num_channels, affine=True, track_running_stats=True, momentum=1.0
        )
        .to(device=next(pipeline.vae.parameters()).device, dtype=torch.float16)
        .eval()
    )
    norm.track_running_stats = False
    pipeline.vae.decoder.conv_norm_out = norm
    tensors = tuple(
        (tensor, tensor.data_ptr(), tensor.dtype, tensor.detach().clone())
        for tensor in (*pipeline.vae.parameters(), *pipeline.vae.buffers())
    )
    to_original = cast(Any, type(pipeline.vae)).to
    forward_original = cast(Any, type(norm)).forward
    calls: list[str] = []

    @wraps(to_original)
    def convert(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is pipeline.vae:
            calls.append("cast")
        return to_original(current, *args, **kwargs)

    @wraps(forward_original)
    def forward(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is norm:
            calls.append("stateful-forward")
        return forward_original(current, *args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(cast(Any, type(pipeline.vae)), "to", convert)
        patch.setattr(cast(Any, type(norm)), "forward", forward)
        with pytest.raises(DerivativeError):
            selected.prepare_owned_regional_vae(pipeline, parameters, torch)
    assert calls == []
    for tensor, pointer, dtype, values in tensors:
        assert tensor.data_ptr() == pointer and tensor.dtype == dtype
        assert torch.equal(tensor, values)
    pipeline.vae.decoder.conv_norm_out = original_norm
    selected.prepare_owned_regional_vae(pipeline, parameters, torch)
    with _preserved(native):
        image = selected.decode_regional_latents(
            _output(_raw(native)),
            pipeline=pipeline,
            parameters=parameters,
            torch=torch,
            width=24,
            height=16,
        ).images
    assert image.dtype == torch.float32 and torch.isfinite(image).all()
