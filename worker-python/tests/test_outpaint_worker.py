"""Actual strict wire, native scaled execution and durable RGBA files.

Scaled CPU constructors/placement and a tiny exact TorchScript infill collaborator
are explicit; protocol, alpha conditioning, masked loops and publication stay real.
Trained models and the production pinned LaMa bytes have separate GPU evidence.
"""

# pyright: reportPrivateUsage=false

from __future__ import annotations

import copy
import hashlib
import json
import os
import subprocess
from pathlib import Path
from types import ModuleType
from typing import Any, cast

import pytest
from PIL import Image, ImageOps

from imagegen_worker import anima_outpaint, anima_worker, inference, outpaint_worker_assets
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.inference import MLRuntime, SdxlConditioning, require_dependency_versions
from imagegen_worker.inference_main import process_inference_request
from imagegen_worker.lama_infill import LocalLamaModel, load_local_lama
from imagegen_worker.protocol import (
    OUTPAINT_INFILL_BYTE_SIZE,
    OUTPAINT_INFILL_SHA256,
    GenerateAnimaOutpaintCommand,
    GenerateIllustriousOutpaintCommand,
    parse_request,
    process_request,
)
from test_anima_worker import native_bundle as native_bundle_fixture
from test_anima_worker import native_runtime
from test_anima_worker import request as anima_request
from test_inference_boundary import _request as illustrious_request
from test_lama_infill import _script_fixture
from test_outpaint_conditioning import _reference_masks
from test_outpaint_conditioning import upstream as upstream_fixture
from test_sdxl_outpaint import native as illustrious_native_fixture

native_bundle = native_bundle_fixture
upstream = upstream_fixture
illustrious_native = illustrious_native_fixture


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def source() -> Image.Image:
    captured = Image.new("RGBA", (64, 64), (32, 64, 96, 255))
    alpha = Image.new("L", captured.size, 255)
    alpha.paste(0, (40, 0, 64, 64))
    alpha.paste(128, (32, 0, 40, 64))
    alpha.putpixel((2, 3), 254)
    captured.putalpha(alpha)
    captured.info["icc_profile"] = SRGB_ICC_PROFILE
    return captured


def attach_outpaint(
    wire: dict[str, Any], resource_path: Path, *, image: Image.Image | None = None
) -> dict[str, Any]:
    job = wire["job"]
    captured = source() if image is None else image
    target = Path(job["target"]["path"])
    captured.save(target, format="PNG", icc_profile=SRGB_ICC_PROFILE, compress_level=0)
    content = target.read_bytes()
    job["target"].update(sha256=digest(content), byteSize=len(content))
    wire["type"] = wire["type"].rsplit("-", 1)[0] + "-outpaint"
    infill = {
        "role": "outpaint-infill",
        "sha256": OUTPAINT_INFILL_SHA256,
        "byteSize": OUTPAINT_INFILL_BYTE_SIZE,
    }
    job["infillResource"] = {**infill, "path": str(resource_path)}
    job["conditioning"] = {
        "schemaVersion": 1,
        "kind": "alpha-outpaint-conditioning",
        "bbox": copy.deepcopy(job["bbox"]),
        "infillResource": infill,
        "sourceTarget": {
            "format": "png",
            **{name: value for name, value in job["target"].items() if name != "path"},
        },
        "keepMask": {
            "format": "alpha8",
            "polarity": "keep",
            "width": 64,
            "height": 64,
            "byteSize": 64 * 64,
            "sha256": digest(captured.getchannel("A").tobytes()),
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
    return wire


def illus_wire(tmp_path: Path) -> dict[str, Any]:
    root = tmp_path / "staging"
    root.mkdir(mode=0o700)
    checkpoint = tmp_path / "checkpoint.safetensors"
    checkpoint.write_bytes(b"controlled native constructor identity")
    wire = illustrious_request(root, checkpoint, "0" * 64, 1)
    job = cast(dict[str, Any], wire["job"])
    job["sampling"]["denoisingStrength"] = 0.75
    return attach_outpaint(cast(dict[str, Any], wire), tmp_path / "big-lama.pt")


def typed(
    wire: dict[str, Any],
) -> GenerateIllustriousOutpaintCommand | GenerateAnimaOutpaintCommand:
    command = parse_request(wire)
    assert isinstance(command, (GenerateIllustriousOutpaintCommand, GenerateAnimaOutpaintCommand))
    return command


def route(
    wire: dict[str, Any], root: Path, runtime: MLRuntime | None = None, **kwargs: Any
) -> dict[str, object]:
    empty = MLRuntime(
        ModuleType("unused_torch"), ModuleType("unused_diffusers"), ModuleType("unused_compel")
    )
    return process_inference_request(wire, config_dir=root, runtime=runtime or empty, **kwargs)


@pytest.fixture
def pin_config(monkeypatch: pytest.MonkeyPatch) -> None:
    # Scaled native CPU models do not use the full offline trained SDXL config.
    def verify_scaled_config(_path: str) -> None:
        pass

    monkeypatch.setattr(inference, "verify_pinned_config", verify_scaled_config)


@pytest.mark.parametrize("family", ("illustrious", "anima"))
def test_parser_captures_distinct_outer_operation_and_immutable_raw_identity(
    tmp_path: Path, family: str
) -> None:
    wire = (
        illus_wire(tmp_path)
        if family == "illustrious"
        else attach_outpaint(
            anima_request(tmp_path / "anima", mode="img2img", strength=0.75),
            tmp_path / "big-lama.pt",
        )
    )
    command = typed(wire)
    assert type(command).__name__ == f"Generate{family.title()}OutpaintCommand"
    original = command.conditioning.keep_mask_sha256
    wire["job"]["conditioning"]["keepMask"]["sha256"] = "a" * 64
    wire["job"]["conditioning"]["bbox"]["x"] = 500
    assert (
        command.conditioning.keep_mask_sha256 == original and command.conditioning.bbox["x"] == -64
    )
    assert process_request(wire)["code"] == "INVALID_REQUEST"


@pytest.mark.parametrize(
    "path,value",
    [
        (("policy", "version"), True),
        (("policy", "edgeRadius"), 8),
        (("policy", "fadeDistance"), 0),
        (("policy", "minimumDenoise"), False),
        (("policy", "infillMethod"), "fallback"),
        (("policy", "outputMode"), "merged"),
        (("policy", "extra"), 0),
        (("bbox", "x"), 0),
        (("sourceTarget", "sha256"), "0" * 64),
        (("sourceTarget", "iccSha256"), "0" * 64),
        (("sourceTarget", "byteSize"), 1),
        (("keepMask", "byteSize"), 1),
        (("keepMask", "polarity"), "generate"),
        (("keepMask", "width"), 32),
        (("infillResource", "sha256"), "0" * 64),
        (("infillResource", "byteSize"), 1),
        (("schemaVersion",), True),
        (("kind",), "outpaint"),
    ],
)
def test_malformed_conditioning_fails_real_entrypoint_before_any_models(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, path: tuple[str, ...], value: object
) -> None:
    wire = illus_wire(tmp_path)
    fields = wire["job"]["conditioning"]
    for name in path[:-1]:
        fields = fields[name]
    fields[path[-1]] = value

    def unexpected(*_args: Any, **_kwargs: Any) -> None:
        pytest.fail("Malformed conditioning reached a model loader.")

    monkeypatch.setattr(outpaint_worker_assets, "load_local_lama", unexpected)
    assert route(wire, tmp_path)["code"] == "INVALID_REQUEST"
    assert not Path(wire["job"]["output"]["pngPath"]).exists()


@pytest.mark.parametrize(
    "alias", ("target", "output", "checkpoint", "staging", "relative", "unnormalized")
)
def test_resource_aliases_refuse_before_local_resource_load(tmp_path: Path, alias: str) -> None:
    wire = illus_wire(tmp_path)
    job = wire["job"]
    path = {
        "target": job["target"]["path"],
        "output": job["output"]["pngPath"],
        "checkpoint": job["checkpoint"]["path"],
        "staging": str(tmp_path / "staging" / "big-lama.pt"),
        "relative": "big-lama.pt",
        "unnormalized": str(tmp_path) + "/./big-lama.pt",
    }[alias]
    job["infillResource"]["path"] = path
    assert route(wire, tmp_path)["code"] == "INVALID_REQUEST"


@pytest.mark.parametrize(
    "change", ("mask-hash", "target-hash", "transparent", "opaque", "crc", "trailing", "icc")
)
def test_actual_png_and_raw_alpha_fail_before_lama_or_family_loading(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, pin_config: None, change: str
) -> None:
    wire = illus_wire(tmp_path)
    job = wire["job"]
    target = Path(job["target"]["path"])
    if change == "mask-hash":
        job["conditioning"]["keepMask"]["sha256"] = "0" * 64
    elif change == "target-hash":
        job["target"]["sha256"] = job["conditioning"]["sourceTarget"]["sha256"] = "0" * 64
    else:
        if change in ("transparent", "opaque"):
            attach_outpaint(
                wire,
                tmp_path / "big-lama.pt",
                image=Image.new(
                    "RGBA", (64, 64), (32, 64, 96, 0 if change == "transparent" else 255)
                ),
            )
        elif change == "icc":
            captured = source()
            captured.info.clear()
            captured.save(target, format="PNG")
        else:
            content = bytearray(target.read_bytes())
            if change == "crc":
                content[-1] ^= 1
            else:
                content.extend(b"unexpected tail")
            target.write_bytes(content)
        content = target.read_bytes()
        job["target"].update(sha256=digest(content), byteSize=len(content))
        job["conditioning"]["sourceTarget"].update(sha256=digest(content), byteSize=len(content))

    def unexpected(*_args: Any, **_kwargs: Any) -> None:
        pytest.fail("Changed outpaint pixels reached LaMa/family model loading.")

    monkeypatch.setattr(outpaint_worker_assets, "load_local_lama", unexpected)
    result = route(wire, tmp_path)
    assert result["code"] == (
        "GENERATION_TARGET_UNSUPPORTED"
        if change in ("transparent", "opaque")
        else "GENERATION_INPUT_CHANGED"
    )
    assert not Path(job["output"]["pngPath"]).exists()


def install_scaled_infill(
    tmp_path: Path, torch: Any, monkeypatch: pytest.MonkeyPatch
) -> tuple[Path, list[str]]:
    path, sha, size = _script_fixture(tmp_path, torch)
    phases: list[str] = []

    def mapped_fixture(
        resource: Path, *, expected_sha256: str, expected_byte_size: int, device: str
    ) -> LocalLamaModel:
        assert resource == tmp_path / "big-lama.pt"
        assert (expected_sha256, expected_byte_size, device) == (
            OUTPAINT_INFILL_SHA256,
            OUTPAINT_INFILL_BYTE_SIZE,
            "cpu",
        )
        phases.append("infill-load")
        return load_local_lama(path, expected_sha256=sha, expected_byte_size=size)

    monkeypatch.setattr(outpaint_worker_assets, "load_local_lama", mapped_fixture)
    return path, phases


def verify_output(
    wire: dict[str, Any], done: dict[str, object], upstream: tuple[Any, Any, Any]
) -> bytes:
    path = Path(wire["job"]["output"]["pngPath"])
    assert done["type"] == "generation-done" and done["requestId"] == wire["requestId"]
    assert done["outputPath"] == str(path)
    _, _, independent_keep = _reference_masks(source(), upstream, 16, 0, 16)
    expected_alpha = ImageOps.invert(independent_keep).tobytes()
    with Image.open(path) as image:
        image.load()
        assert image.mode == "RGBA" and image.size == (64, 64)
        assert image.info["icc_profile"] == SRGB_ICC_PROFILE
        assert image.getchannel("A").tobytes() == expected_alpha
        pixels = image.tobytes()
    thumbnail = cast(dict[str, Any], done["thumbnail"])
    with Image.open(thumbnail["outputPath"]) as preview:
        preview.load()
        assert preview.mode == "RGBA" and preview.size == (64, 64)
        assert preview.getchannel("A").tobytes() == expected_alpha
    assert digest(Path(thumbnail["outputPath"]).read_bytes()) == thumbnail["sha256"]
    assert not list(path.parent.glob(".*.tmp"))
    return pixels


@pytest.mark.parametrize(
    "scheduler", ("dpmpp_2m", "dpmpp_2m_k", "euler_a", "dpmpp_sde", "dpmpp_sde_k")
)
def test_illustrious_wire_runs_real_masked_loop_and_retains_policy_rgba(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    pin_config: None,
    illustrious_native: Any,
    upstream: tuple[Any, Any, Any],
    scheduler: str,
) -> None:
    native = illustrious_native
    wire = illus_wire(tmp_path)
    wire["job"]["sampling"].update(scheduler=scheduler, steps=3, seed=0)
    _fixture_path, phases = install_scaled_infill(tmp_path, native.torch, monkeypatch)
    pipeline = native.pipeline
    to = pipeline.to

    def cpu_to(device: str) -> Any:
        assert device == "cuda"
        return to("cpu")

    def scaled_constructor(_cls: Any, path: str, **kwargs: Any) -> Any:
        assert phases == ["infill-load"]
        assert path == wire["job"]["checkpoint"]["path"]
        assert kwargs["local_files_only"] is True and kwargs["torch_dtype"] == native.torch.float16
        phases.append("family-load")
        return pipeline

    monkeypatch.setattr(
        native.diffusers.StableDiffusionXLImg2ImgPipeline,
        "from_single_file",
        classmethod(scaled_constructor),
    )
    monkeypatch.setattr(pipeline, "to", cpu_to)

    def scaled_conditioning(*_args: Any, **_kwargs: Any) -> SdxlConditioning:
        return cast(SdxlConditioning, native.conditioning)

    monkeypatch.setattr(inference, "build_sdxl_conditioning", scaled_conditioning)
    events: list[dict[str, object]] = []
    runtime = MLRuntime(native.torch, native.diffusers, ModuleType("scaled_conditioning"))
    done = route(wire, tmp_path, runtime, on_progress=events.append)
    verify_output(wire, done, upstream)
    assert done["seed"] == 0 and phases == ["infill-load", "family-load"]
    assert events and events[-1]["step"] == events[-1]["totalSteps"]
    assert all(event["requestId"] == wire["requestId"] for event in events)
    assert pipeline._igs_outpaint_state is None and not pipeline.unet._forward_pre_hooks
    assert not pipeline.vae.encoder._forward_hooks and not pipeline.vae.decoder._forward_hooks


@pytest.mark.parametrize(
    "scheduler", ("euler", "heun", "dpmpp_2m", "dpmpp_2m_sde", "er_sde", "lcm")
)
def test_anima_wire_runs_native_weighted_six_methods_and_publishes_rgba(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    native_bundle: Any,
    upstream: tuple[Any, Any, Any],
    scheduler: str,
) -> None:
    torch, _diffusers, _architecture, bundle = native_bundle
    previous = torch.get_num_threads()
    torch.set_num_threads(1)
    try:
        wire = attach_outpaint(
            anima_request(
                tmp_path / "anima",
                mode="img2img",
                strength=0.75,
                scheduler=scheduler,
                bundle=bundle,
                steps=5,
                seed=0,
            ),
            tmp_path / "big-lama.pt",
        )
        _fixture_path, phases = install_scaled_infill(tmp_path, torch, monkeypatch)
        runtime = native_runtime(native_bundle, monkeypatch)
        load = anima_worker.load_anima_models

        def ordered_load(*args: Any, **kwargs: Any) -> Any:
            assert phases == ["infill-load"]
            phases.append("family-load")
            return load(*args, **kwargs)

        monkeypatch.setattr(anima_worker, "load_anima_models", ordered_load)
        events: list[dict[str, object]] = []
        done = route(wire, tmp_path, runtime, on_progress=events.append)
        first = verify_output(wire, done, upstream)
        assert done["seed"] == 0 and phases == ["infill-load", "family-load"]
        plan = wire["job"]["sampling"]
        assert len(events) == plan["totalSteps"]
        assert events[-1]["step"] == events[-1]["totalSteps"] == plan["totalSteps"]
        command = typed(wire)
        assert isinstance(command, GenerateAnimaOutpaintCommand)
        assert command.positive_prompt.spans[0].weight == 2
        assert command.negative_prompt.spans[0].weight != 1
        assert command.sampling.mode == "img2img"
        # Frozen pixels, plan, both compiled signs and exact native bundle replay.
        Path(wire["job"]["output"]["pngPath"]).unlink()
        Path(str(wire["job"]["output"]["pngPath"]) + ".thumb.webp").unlink()
        phases.clear()
        assert verify_output(wire, route(wire, tmp_path, runtime), upstream) == first
    finally:
        torch.set_num_threads(previous)


@pytest.mark.parametrize("package", ("numpy", "opencv-python-headless"))
def test_ready_cannot_qualify_missing_or_changed_outpaint_cpu_dependency(package: str) -> None:
    from imagegen_worker.inference import PINNED_ML_VERSIONS

    require_dependency_versions(PINNED_ML_VERSIONS)
    for versions in (
        {name: version for name, version in PINNED_ML_VERSIONS.items() if name != package},
        {**PINNED_ML_VERSIONS, package: "0.0.0"},
    ):
        with pytest.raises(DerivativeError) as error:
            require_dependency_versions(versions)
        assert error.value.code == "INFERENCE_UNAVAILABLE"


def test_outpaint_refuses_symlink_fifo_and_declared_length_change(tmp_path: Path) -> None:
    wire = illus_wire(tmp_path)
    command = typed(wire)
    target = command.target_path
    original = target.read_bytes()
    neighbor = tmp_path / "preserved.png"
    neighbor.write_bytes(original)
    for failure in ("symlink", "fifo", "size"):
        target.unlink()
        if failure == "symlink":
            target.symlink_to(neighbor)
        elif failure == "fifo":
            os.mkfifo(target)
        else:
            target.write_bytes(original + b"growth")
        with pytest.raises(DerivativeError):
            outpaint_worker_assets.capture_outpaint_target(command)
        assert neighbor.read_bytes() == original and not command.output_path.exists()


def test_derivatives_peer_refuses_valid_outpaint_commands_without_ml(tmp_path: Path) -> None:
    assert process_request(illus_wire(tmp_path))["code"] == "INFERENCE_UNAVAILABLE"


@pytest.mark.parametrize("family", ("illustrious", "anima"))
def test_real_ts_outpaint_capture_round_trips_through_python_parser(
    tmp_path: Path, family: str
) -> None:
    from imagegen_worker.inference_main import inference_ready_message
    from test_anima_worker import fake_runtime

    wire = (
        illus_wire(tmp_path)
        if family == "illustrious"
        else attach_outpaint(
            anima_request(tmp_path / "anima", mode="img2img", strength=0.75),
            tmp_path / "big-lama.pt",
        )
    )
    root = Path(__file__).resolve().parents[2]
    target = Path(wire["job"]["target"]["path"])
    canonical_target = target.parent / "target.png"
    if canonical_target != target:
        target.rename(canonical_target)
    wire["job"]["target"]["path"] = str(canonical_target)
    wire["job"]["output"]["pngPath"] = str(target.parent / "result.png")
    wire["requestId"] = "c616945a-f617-43a9-b845-2e2ae7b43ab7"
    program = (
        "import {captureOutpaintWorkerRequest as capture} "
        "from './src/main/projects/outpaint-worker-request.ts';"
        "const input="
        + json.dumps({"wire": wire, "ready": inference_ready_message(fake_runtime())})
        + ";process.stdout.write(JSON.stringify(capture(input.wire,input.ready)));"
    )
    assembled = cast(
        dict[str, Any],
        json.loads(
            subprocess.check_output(
                [str(root / "node_modules/.bin/tsx"), "-e", program], cwd=root, text=True
            )
        ),
    )
    parsed = typed(assembled)
    assert assembled == wire
    assert parsed.conditioning.keep_mask_sha256 == digest(source().getchannel("A").tobytes())


@pytest.mark.parametrize("failure", ("missing", "changed", "symlink", "fifo"))
def test_real_pinned_lama_refusals_precede_any_family_load(
    tmp_path: Path, pin_config: None, failure: str
) -> None:
    wire = illus_wire(tmp_path)
    path = tmp_path / "big-lama.pt"
    if failure == "changed":
        path.write_bytes(b"different resource")
    elif failure == "symlink":
        neighbor = tmp_path / "preserved.pt"
        neighbor.write_bytes(b"must remain untouched")
        path.symlink_to(neighbor)
    elif failure == "fifo":
        os.mkfifo(path)
    target = Path(wire["job"]["target"]["path"])
    original = target.read_bytes()
    done = route(wire, tmp_path)
    assert done["code"] in ("GENERATION_INPUT_CHANGED", "INVALID_PATH")
    assert target.read_bytes() == original and not Path(wire["job"]["output"]["pngPath"]).exists()


def test_source_descriptor_swap_with_identical_bytes_is_rejected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    wire = illus_wire(tmp_path)
    command = typed(wire)
    target = command.target_path
    replacement = target.parent / "replacement.png"
    replacement.write_bytes(target.read_bytes())
    stat_at_path = Path.lstat

    def swap_before_identity(path: Path) -> os.stat_result:
        if path == target and replacement.exists():
            replacement.replace(target)
        return stat_at_path(path)

    monkeypatch.setattr(Path, "lstat", swap_before_identity)
    with pytest.raises(DerivativeError) as error:
        outpaint_worker_assets.capture_outpaint_target(command)
    assert error.value.code == "GENERATION_INPUT_CHANGED"
    assert not command.output_path.exists()


@pytest.mark.parametrize("mode", ("RGB", "RGBA"))
def test_real_publication_preserves_explicit_mode_and_exclusive_neighbor(
    tmp_path: Path, mode: str
) -> None:
    from imagegen_worker.generation_artifacts import publish_generation_image

    image = source()
    output = tmp_path / "published.png"
    options: dict[str, Any] = {
        "staging_root": tmp_path,
        "output_path": output,
        "width": 64,
        "height": 64,
        "request_id": "publication",
        "seed": 0,
        "output_mode": mode,
    }
    publish_generation_image(image, **options)
    with Image.open(output) as actual:
        actual.load()
        assert actual.mode == mode and actual.tobytes() == image.convert(mode).tobytes()
    original = output.read_bytes()
    with pytest.raises(DerivativeError) as error:
        publish_generation_image(Image.new(mode, (64, 64)), **options)
    assert error.value.code == "OUTPUT_UNAVAILABLE" and output.read_bytes() == original
    assert not list(tmp_path.glob(".*.tmp"))


def test_rgba_publication_cache_failure_keeps_alpha_and_sync_failure_rolls_back(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from imagegen_worker import candidate_thumbnail, generation_artifacts

    def failed_cache(_temporary: Path) -> bytes:
        raise OSError("controlled optional cache failure")

    monkeypatch.setattr(candidate_thumbnail, "_stable_thumbnail_bytes", failed_cache)
    options: dict[str, Any] = {
        "staging_root": tmp_path,
        "output_path": tmp_path / "result.png",
        "width": 64,
        "height": 64,
        "request_id": "cache-control",
        "seed": 0,
        "output_mode": "RGBA",
    }
    done = generation_artifacts.publish_generation_image(source(), **options)
    assert "thumbnail" not in done
    with Image.open(tmp_path / "result.png") as image:
        image.load()
        assert image.mode == "RGBA" and image.tobytes() == source().tobytes()
    (tmp_path / "result.png").unlink()
    fsync = os.fsync

    def failed_directory_sync(descriptor: int) -> None:
        import stat

        if stat.S_ISDIR(os.fstat(descriptor).st_mode):
            raise OSError("controlled directory sync failure")
        fsync(descriptor)

    monkeypatch.setattr(os, "fsync", failed_directory_sync)
    with pytest.raises(DerivativeError) as error:
        generation_artifacts.publish_generation_image(source(), **options)
    assert error.value.code == "GENERATION_WORKER_FAILED"
    assert list(tmp_path.iterdir()) == []


def test_source_growth_is_read_only_to_declared_size_plus_one(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    command = typed(illus_wire(tmp_path))
    target = command.target_path
    original = target.read_bytes()
    requests: list[int] = []
    consumed: list[int] = []
    fdopen = os.fdopen

    class ObservedStream:
        def __init__(self, stream: Any) -> None:
            self.stream = stream
            self.grew = False

        def __enter__(self) -> ObservedStream:
            return self

        def __exit__(self, *args: Any) -> None:
            self.stream.close()

        def fileno(self) -> int:
            return self.stream.fileno()

        def read(self, size: int = -1) -> bytes:
            requests.append(size)
            if not self.grew:
                # Grow only after production has captured the original descriptor fstat.
                with target.open("ab") as writer:
                    writer.write(b"g" * 8192)
                self.grew = True
            content = self.stream.read(size)
            consumed.append(len(content))
            return content

    def observed_fdopen(descriptor: int, mode: str) -> ObservedStream:
        return ObservedStream(fdopen(descriptor, mode))

    monkeypatch.setattr(os, "fdopen", observed_fdopen)
    with pytest.raises(DerivativeError) as error:
        outpaint_worker_assets.capture_outpaint_target(command)
    assert error.value.code == "GENERATION_INPUT_CHANGED"
    assert requests and all(0 < size <= command.target_byte_size + 1 for size in requests)
    assert sum(consumed) <= command.target_byte_size + 1
    assert not command.output_path.exists()
    monkeypatch.setattr(os, "fdopen", fdopen)
    target.write_bytes(original)
    assert outpaint_worker_assets.capture_outpaint_target(command).mode == "RGBA"


def test_fixed_policy_refuses_before_infill_at_real_entrypoint(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, pin_config: None
) -> None:
    wire = illus_wire(tmp_path)
    wire["job"]["conditioning"]["policy"]["edgeRadius"] = 8
    calls: list[object] = []

    def forbidden_loader(*args: Any, **kwargs: Any) -> None:
        calls.append((args, kwargs))
        raise DerivativeError("GENERATION_WORKER_FAILED", "Unsupported policy reached infill.")

    monkeypatch.setattr(outpaint_worker_assets, "load_local_lama", forbidden_loader)
    done = route(wire, tmp_path)
    assert done["code"] == "INVALID_REQUEST" and calls == []
    assert not Path(wire["job"]["output"]["pngPath"]).exists()


def test_anima_entrypoint_forwards_compiled_prompts_and_sampling(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    native_bundle: Any,
    upstream: tuple[Any, Any, Any],
) -> None:
    torch, _diffusers, _architecture, bundle = native_bundle
    previous = torch.get_num_threads()
    torch.set_num_threads(1)
    try:
        wire = attach_outpaint(
            anima_request(
                tmp_path / "anima",
                mode="img2img",
                strength=0.75,
                scheduler="euler",
                bundle=bundle,
                steps=5,
                seed=0,
            ),
            tmp_path / "big-lama.pt",
        )
        _path, phases = install_scaled_infill(tmp_path, torch, monkeypatch)
        runtime = native_runtime(native_bundle, monkeypatch)
        observed: list[dict[str, Any]] = []
        execute = anima_outpaint.generate_anima_outpaint

        def observe_and_execute(
            sampling: Any, positive: Any, negative: Any, models: Any, **kwargs: Any
        ) -> Any:
            observed.append(
                copy.deepcopy(
                    {
                        "sampling": sampling,
                        "positive": positive,
                        "negative": negative,
                    }
                )
            )
            # The real native masked solver, conditioning, VAE and publisher stay active.
            return execute(sampling, positive, negative, models, **kwargs)

        monkeypatch.setattr(anima_outpaint, "generate_anima_outpaint", observe_and_execute)
        done = route(wire, tmp_path, runtime)
        assert observed and observed[0]["positive"] == wire["job"]["prompts"]["positive"]
        assert observed[0]["negative"] == wire["job"]["prompts"]["negative"]
        assert observed[0]["sampling"] == wire["job"]["sampling"]
        verify_output(wire, done, upstream)
        assert phases == ["infill-load"]
    finally:
        torch.set_num_threads(previous)
