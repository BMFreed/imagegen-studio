"""Separate, qualified JSON-lines entrypoint for the first GPU inference slice."""

from __future__ import annotations

import contextlib
import json
import os
import sys
import traceback
from collections.abc import Callable
from pathlib import Path
from typing import BinaryIO

from imagegen_worker import PROTOCOL_VERSION
from imagegen_worker.compositor import compose_target
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.inference import (
    INFERENCE_CAPABILITY,
    INFERENCE_CFG_RESCALE_CAPABILITY,
    INFERENCE_PROGRESS_CAPABILITY,
    INFERENCE_RUNTIME_PROFILE,
    INFERENCE_THUMBNAIL_CAPABILITY,
    INFERENCE_WORKER_VERSION,
    MLRuntime,
    generate_illustrious_txt2img,
    qualify_ml_runtime,
)
from imagegen_worker.inference_config import configured_sdxl_path
from imagegen_worker.protocol import (
    MAX_MESSAGE_BYTES,
    ComposeTargetCommand,
    GenerateIllustriousTxt2ImgCommand,
    error_message,
    parse_request,
    request_id_hint,
)


def _emit(message: dict[str, object], output: BinaryIO) -> None:
    encoded = json.dumps(message, separators=(",", ":"), ensure_ascii=False).encode("utf-8") + b"\n"
    output.write(encoded)
    output.flush()


def inference_ready_message() -> dict[str, object]:
    import platform

    return {
        "type": "ready",
        "protocolVersion": PROTOCOL_VERSION,
        "workerVersion": INFERENCE_WORKER_VERSION,
        "pythonVersion": platform.python_version(),
        "runtimeProfile": INFERENCE_RUNTIME_PROFILE,
        "capabilities": [
            INFERENCE_CAPABILITY,
            "target-composition",
            INFERENCE_PROGRESS_CAPABILITY,
            INFERENCE_THUMBNAIL_CAPABILITY,
            INFERENCE_CFG_RESCALE_CAPABILITY,
        ],
    }


def _qualify() -> tuple[Path, MLRuntime]:
    if sys.platform != "linux" or sys.version_info[:2] != (3, 12):
        raise DerivativeError("INFERENCE_UNAVAILABLE", "Linux CUDA inference is unavailable.")
    # Keep both Hub fallback and transformers out of the network, including during lazy imports.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_DATASETS_OFFLINE"] = "1"
    config_dir = configured_sdxl_path()
    runtime = qualify_ml_runtime()
    return config_dir, runtime


def process_inference_request(
    value: object,
    *,
    config_dir: Path,
    runtime: MLRuntime,
    on_progress: Callable[[dict[str, object]], None] | None = None,
) -> dict[str, object]:
    request_id = request_id_hint(value)
    try:
        command = parse_request(value)
        if isinstance(command, ComposeTargetCommand):
            with contextlib.redirect_stdout(sys.stderr):
                result = compose_target(command.target)
            return {
                "type": "target-done",
                "protocolVersion": PROTOCOL_VERSION,
                "requestId": command.request_id,
                **result,
            }
        if not isinstance(command, GenerateIllustriousTxt2ImgCommand):
            raise DerivativeError(
                "INVALID_REQUEST", "This worker accepts generation and target requests only."
            )

        def report_progress(step: int, total_steps: int) -> None:
            if on_progress is not None:
                on_progress(
                    {
                        "type": "generation-progress",
                        "protocolVersion": PROTOCOL_VERSION,
                        "requestId": command.request_id,
                        "step": step,
                        "totalSteps": total_steps,
                    }
                )

        with contextlib.redirect_stdout(sys.stderr):
            return generate_illustrious_txt2img(
                command,
                config_dir=config_dir,
                runtime=runtime,
                on_progress=report_progress if on_progress is not None else None,
            )
    except DerivativeError as error:
        return error_message(request_id, error.code, str(error))
    except Exception:
        traceback.print_exc(file=sys.stderr)
        return error_message(
            request_id,
            "GENERATION_WORKER_FAILED",
            "The inference worker could not complete this request.",
        )


def main() -> int:
    # Generation redirects library stdout to stderr; protocol output keeps its original stream.
    protocol_output = sys.stdout.buffer

    def emit(message: dict[str, object]) -> None:
        _emit(message, protocol_output)

    try:
        with contextlib.redirect_stdout(sys.stderr):
            config_dir, runtime = _qualify()
    except DerivativeError as error:
        print(f"Inference startup failed: {error}", file=sys.stderr)
        return 78
    except Exception:
        traceback.print_exc(file=sys.stderr)
        return 78
    emit(inference_ready_message())
    while line := sys.stdin.buffer.readline(MAX_MESSAGE_BYTES + 1):
        if len(line) > MAX_MESSAGE_BYTES:
            while line and not line.endswith(b"\n"):
                line = sys.stdin.buffer.readline(MAX_MESSAGE_BYTES + 1)
            emit(error_message(None, "MESSAGE_TOO_LARGE", "Worker request exceeds the line limit."))
            continue
        try:
            value: object = json.loads(line.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            emit(error_message(None, "INVALID_REQUEST", "Request is not valid UTF-8 JSON."))
            continue
        emit(
            process_inference_request(
                value, config_dir=config_dir, runtime=runtime, on_progress=emit
            )
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
