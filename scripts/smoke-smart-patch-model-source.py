"""Compare private Smart Patch protocol RGB with trained, pinned Invoke LaMa on CPU.

Uses only an explicitly supplied existing model and Invoke checkout. Four finite
synthetic sources qualify protocol/model-source behavior, not diffusion, visual
quality, Main routing, installed runtime readiness or accepted Smart Patch results.
Run under the repository's external whole-process memory/deadline watchdog.
"""

from __future__ import annotations

import argparse
import ast
import gc
import hashlib
import io
import json
import os
import platform
import shlex
import stat
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, cast

from PIL import Image

UPSTREAM_COMMIT = "9e1540962bcca7f8fa668d7d8e02cf79d75fda3b"
UPSTREAM_LAMA_SHA256 = (
    "15562f2c69436f02e8934e95bd7de765233e153caa469ca596991ab77baf64cf"
)
LAMA_SHA256 = "344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9"
LAMA_BYTE_SIZE = 205_669_692
PROCESSING_SIZE = (128, 128)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_record(path: Path) -> dict[str, Any]:
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode):
        raise AssertionError(f"Evidence input must be a regular file: {path}")
    sha256 = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            sha256.update(chunk)
    after = path.lstat()
    identity = (
        before.st_dev,
        before.st_ino,
        before.st_size,
        before.st_mtime_ns,
        before.st_ctime_ns,
    )
    if identity != (
        after.st_dev,
        after.st_ino,
        after.st_size,
        after.st_mtime_ns,
        after.st_ctime_ns,
    ):
        raise AssertionError(f"Evidence input changed during its read: {path}")
    return {"path": str(path), "sha256": sha256.hexdigest(), "byteSize": after.st_size}


def git_head(root: Path) -> str:
    return subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=root, text=True, timeout=10
    ).strip()


def worker_sources() -> list[dict[str, Any]]:
    paths = {
        Path(filename).resolve(strict=True)
        for name, module in sys.modules.copy().items()
        if name == "imagegen_worker" or name.startswith("imagegen_worker.")
        if (filename := getattr(module, "__file__", None)) is not None
    }
    return [file_record(path) for path in sorted(paths)]


def external_lama(source_path: Path, model_path: Path, torch: Any, np: Any) -> Any:
    source = source_path.read_bytes()
    if digest(source) != UPSTREAM_LAMA_SHA256:
        raise AssertionError(
            "External Invoke LaMa source differs from the pinned oracle."
        )
    nodes = [
        node
        for node in ast.parse(source).body
        if isinstance(node, (ast.ClassDef, ast.FunctionDef))
        and node.name in ("norm_img", "LaMA")
    ]
    if len(nodes) != 2:
        raise AssertionError("The pinned external LaMa definitions are unavailable.")
    namespace: dict[str, Any] = {
        "np": np,
        "torch": torch,
        "Image": Image,
        "get_effective_device": lambda _model: torch.device("cpu"),
    }
    module = ast.Module(
        body=[ast.parse("from __future__ import annotations").body[0], *nodes],
        type_ignores=[],
    )
    # The SHA-pinned external numerical body is executed without the Invoke app.
    exec(  # noqa: S102
        compile(ast.fix_missing_locations(module), str(source_path), "exec"), namespace
    )
    snapshot = model_path.read_bytes()
    if len(snapshot) != LAMA_BYTE_SIZE or digest(snapshot) != LAMA_SHA256:
        raise AssertionError(
            "The oracle requires the exact existing pinned LaMa bytes."
        )
    model = torch.jit.load(io.BytesIO(snapshot), map_location="cpu").eval()
    return namespace["LaMA"](model)


def literal_source(size: tuple[int, int]) -> Image.Image:
    width, height = size
    image = Image.frombytes(
        "RGBA",
        size,
        bytes(
            value
            for y in range(height)
            for x in range(width)
            for value in (
                (x * 3 + y) % 256,
                (y * 5 + 17) % 256,
                (x + y * 2 + 73) % 256,
                255,
            )
        ),
    )
    return image


def case_source(name: str) -> tuple[Image.Image | None, Image.Image]:
    if name.startswith("resized-"):
        world = literal_source((512, 512))
        alpha = Image.new("L", world.size, 0 if name == "resized-all-zero" else 255)
        alpha.putpixel((0, 0), 1 if name == "resized-all-zero" else 254)
        world.putalpha(alpha)
        source = world.resize(PROCESSING_SIZE, resample=Image.Resampling.BICUBIC)
        expected = (0, 0) if name == "resized-all-zero" else (255, 255)
        if source.getchannel("A").getextrema() != expected:
            raise AssertionError(
                f"{name}: actual BICUBIC source did not reach its alpha extreme."
            )
        return world, source
    source = literal_source(PROCESSING_SIZE)
    alpha = Image.new("L", PROCESSING_SIZE, 255)
    alpha.paste(0, (0, 0, 32, source.height))
    if name == "soft-128-254":
        alpha.paste(128, (32, 0, 64, source.height))
        alpha.paste(254, (64, 0, 96, source.height))
    source.putalpha(alpha)
    return None, source


def save_png(image: Image.Image, path: Path, icc: bytes) -> dict[str, Any]:
    image.save(path, format="PNG", icc_profile=icc)
    path.chmod(0o600)
    return {**file_record(path), "width": image.width, "height": image.height}


def json_report(path: Path, report: dict[str, Any]) -> None:
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


def qualify(args: argparse.Namespace, output: Path, report: dict[str, Any]) -> None:
    for variable in (
        "OMP_NUM_THREADS",
        "MKL_NUM_THREADS",
        "OPENBLAS_NUM_THREADS",
        "NUMEXPR_NUM_THREADS",
    ):
        os.environ[variable] = "1"
    os.environ["CUDA_VISIBLE_DEVICES"] = ""
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_HOME"] = str(output / "offline-hf")

    import numpy as np
    import torch
    from imagegen_worker.derivatives import SRGB_ICC_PROFILE
    from imagegen_worker.protocol import process_request

    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    root = Path(__file__).resolve().parents[1]
    invoke_root = cast(Path, args.invoke_source).resolve(strict=True)
    upstream_source = invoke_root / "invokeai/backend/image_util/infill_methods/lama.py"
    if git_head(invoke_root) != UPSTREAM_COMMIT:
        raise AssertionError("Invoke checkout HEAD differs from the pinned reference.")
    model_path = cast(Path, args.lama).resolve(strict=True)
    if model_path == output or output in model_path.parents:
        raise AssertionError(
            "Reusable LaMa must remain outside this evidence directory."
        )
    model_before = file_record(model_path)
    if (
        model_before["sha256"] != LAMA_SHA256
        or model_before["byteSize"] != LAMA_BYTE_SIZE
    ):
        raise AssertionError(
            "Supplied existing LaMa differs from its exact pinned identity."
        )
    sources_before = worker_sources()
    worker_root = root / "worker-python/src/imagegen_worker"
    if any(worker_root not in Path(row["path"]).parents for row in sources_before):
        raise AssertionError(
            "Worker modules must come from this checkout's current source tree."
        )
    report.update(
        {
            "repositoryHead": git_head(root),
            "script": file_record(Path(__file__).resolve()),
            "invokeHead": UPSTREAM_COMMIT,
            "invokeLamaSource": file_record(upstream_source),
            "modelBefore": model_before,
            "workerSourcesBefore": sources_before,
            "torchVersion": str(torch.__version__),
            "numpyVersion": str(np.__version__),
            "cpuThreads": torch.get_num_threads(),
            "cpuInteropThreads": torch.get_num_interop_threads(),
            "processingSize": list(PROCESSING_SIZE),
            "mode": "outpaint",
        }
    )
    json_report(output / "report.json", report)
    oracle = external_lama(upstream_source, model_path, torch, np)
    gc.collect()
    rows = cast(list[dict[str, Any]], report["cases"])
    for name in ("mixed-hard", "soft-128-254", "resized-all-zero", "resized-all-255"):
        started = time.monotonic()
        directory = output / name
        directory.mkdir(mode=0o700)
        world, source = case_source(name)
        source.info["icc_profile"] = SRGB_ICC_PROFILE
        original = source.tobytes()
        world_record = (
            save_png(world, directory / "world-source.png", SRGB_ICC_PROFILE)
            if world is not None
            else None
        )
        source_path = directory / "processing-source.png"
        source_record = save_png(source, source_path, SRGB_ICC_PROFILE)
        destination = directory / "model-source.png"
        request_id = f"trained-smart-patch-source-{name}"
        request = {
            "protocolVersion": "1",
            "requestId": request_id,
            "type": "prepare-smart-patch-model-source",
            "mode": "outpaint",
            "source": source_record,
            "infillResource": {**model_before, "role": "outpaint-infill"},
            "output": {
                "stagingRoot": str(directory),
                "modelSourcePngPath": str(destination),
            },
        }
        row: dict[str, Any] = {
            "case": name,
            "state": "running",
            "worldSource": world_record,
            "processingSource": source_record,
            "processingAlphaExtrema": list(source.getchannel("A").getextrema()),
            "worldAlphaExtrema": (
                list(world.getchannel("A").getextrema()) if world is not None else None
            ),
            "sourceOnlyHolesSha256": digest(
                bytes(
                    1 if alpha < 255 else 0
                    for alpha in source.getchannel("A").tobytes()
                )
            ),
            "processingSourcePixelsSha256": digest(original),
            "request": request,
        }
        rows.append(row)
        json_report(output / "report.json", report)
        response = process_request(request)
        row["response"] = response
        json_report(output / "report.json", report)
        if (
            response.get("type") != "smart-patch-model-source-prepared"
            or response.get("requestId") != request_id
            or response.get("protocolVersion") != "1"
        ):
            raise AssertionError(
                f"{name}: real model-source protocol failed: {response}"
            )
        metadata = response.get("modelSource")
        assert isinstance(metadata, dict), (
            f"{name}: protocol did not return model-source metadata."
        )
        actual_record = file_record(destination)
        if any(
            metadata.get(key) != actual_record[key] for key in ("sha256", "byteSize")
        ):
            raise AssertionError(
                f"{name}: returned byte identity differs from the actual PNG."
            )
        png = destination.read_bytes()
        if png[:8] != b"\x89PNG\r\n\x1a\n" or png[24:26] != bytes((8, 2)):
            raise AssertionError(
                f"{name}: published PNG must actually contain RGB8 pixels."
            )
        with Image.open(destination) as decoded:
            decoded.load()
            if (
                decoded.mode != "RGB"
                or decoded.size != PROCESSING_SIZE
                or decoded.info.get("icc_profile") != SRGB_ICC_PROFILE
                or metadata.get("width") != decoded.width
                or metadata.get("height") != decoded.height
                or metadata.get("colorSpace") != "srgb"
            ):
                raise AssertionError(
                    f"{name}: actual RGB/sRGB topology differs from protocol."
                )
            actual_pixels = decoded.tobytes()
        expected = oracle(source)
        if expected.mode != "RGB" or expected.size != PROCESSING_SIZE:
            raise AssertionError(
                f"{name}: independent Invoke oracle returned invalid topology."
            )
        expected_record = save_png(
            expected, directory / "invoke-rgb.png", SRGB_ICC_PROFILE
        )
        if actual_pixels != expected.tobytes():
            raise AssertionError(
                f"{name}: trained protocol RGB differs from external Invoke bytes."
            )
        if source.tobytes() != original or file_record(
            source_path
        ) != source_file_identity(source_record):
            raise AssertionError(f"{name}: the processing source changed.")
        if world is not None and world.getchannel("A").getextrema() in (
            (0, 0),
            (255, 255),
        ):
            raise AssertionError(
                f"{name}: the world source was not an OUT-classified alpha source."
            )
        row.update(
            {
                "state": "passed",
                "modelSource": actual_record,
                "oracleRgb": expected_record,
                "modelSourcePixelsSha256": digest(actual_pixels),
                "invokeRgbPixelsSha256": digest(expected.tobytes()),
                "decodedRgbBytesMatch": True,
                "sourceUnchanged": True,
                "elapsedSeconds": time.monotonic() - started,
            }
        )
        json_report(output / "report.json", report)
        gc.collect()
    model_after = file_record(model_path)
    sources_after = worker_sources()
    if model_after != model_before or sources_after != sources_before:
        raise AssertionError(
            "Reusable weights or loaded worker sources changed during qualification."
        )
    if file_record(upstream_source) != report["invokeLamaSource"]:
        raise AssertionError("The external Invoke source changed during qualification.")
    report.update(
        {
            "modelAfter": model_after,
            "workerSourcesAfter": sources_after,
            "modelUnchanged": True,
            "workerSourcesUnchanged": True,
            "passed": len(rows),
            "failed": 0,
            "state": "passed",
        }
    )


def source_file_identity(record: dict[str, Any]) -> dict[str, Any]:
    return {key: record[key] for key in ("path", "sha256", "byteSize")}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lama", type=Path, required=True)
    parser.add_argument("--invoke-source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    artifact_root = (Path.home() / ".codex/artifacts/imagegen-studio").resolve(
        strict=True
    )
    output = cast(Path, args.output).expanduser().resolve()
    if artifact_root not in output.parents:
        raise AssertionError(
            "Output must be a new owned directory strictly inside the artifact root."
        )
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    report: dict[str, Any] = {
        "state": "running",
        "boundary": "private CPU protocol -> trained LaMa -> RGB PNG vs pinned external Invoke",
        "command": shlex.join([sys.executable, *sys.argv]),
        "argv": [sys.executable, *sys.argv],
        "pythonExecutable": sys.executable,
        "pythonVersion": platform.python_version(),
        "output": str(output),
        "diffusionExecuted": False,
        "gpuExecuted": False,
        "mainCaptureExecuted": False,
        "publicSmartPatchActivated": False,
        "cases": [],
    }
    started = time.monotonic()
    try:
        qualify(args, output, report)
    except BaseException as error:
        report.update(
            {"state": "failed", "errorType": type(error).__name__, "error": str(error)}
        )
        raise
    finally:
        report["elapsedSeconds"] = time.monotonic() - started
        json_report(output / "report.json", report)
    print(
        json.dumps(
            {
                "passed": report["passed"],
                "failed": 0,
                "report": str(output / "report.json"),
            }
        )
    )


if __name__ == "__main__":
    main()
