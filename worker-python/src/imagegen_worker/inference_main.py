"""Separate, qualified JSON-lines entrypoint for the first GPU inference slice."""

from __future__ import annotations

import contextlib
import gc
import json
import os
import sys
import traceback
from collections.abc import Callable
from pathlib import Path
from typing import BinaryIO, cast

from imagegen_worker import PROTOCOL_VERSION
from imagegen_worker.anima_worker import generate_anima, supports_anima_compute
from imagegen_worker.compositor import compose_target
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.inference import (
    ANIMA_CAPABILITIES,
    INFERENCE_CAPABILITY,
    INFERENCE_CFG_RESCALE_CAPABILITY,
    INFERENCE_EMBEDDINGS_CAPABILITY,
    INFERENCE_EULER_CAPABILITY,
    INFERENCE_EXTERNAL_VAE_CAPABILITY,
    INFERENCE_IMG2IMG_CAPABILITY,
    INFERENCE_LORA_CAPABILITY,
    INFERENCE_NOISE_PROFILE_CAPABILITY,
    INFERENCE_OUTPAINT_CAPABILITY,
    INFERENCE_PROGRESS_CAPABILITY,
    INFERENCE_RUNTIME_PROFILE,
    INFERENCE_THUMBNAIL_CAPABILITY,
    INFERENCE_VAE_PRECISION_CAPABILITY,
    INFERENCE_WORKER_VERSION,
    MLRuntime,
    generate_illustrious_img2img,
    generate_illustrious_outpaint,
    generate_illustrious_txt2img,
    qualify_ml_runtime,
)
from imagegen_worker.inference_config import configured_sdxl_path
from imagegen_worker.protocol import (
    MAX_MESSAGE_BYTES,
    ComposeTargetCommand,
    ExecuteSmartPatchCommand,
    GenerateAnimaTxt2ImgCommand,
    GenerateIllustriousImg2ImgCommand,
    GenerateIllustriousOutpaintCommand,
    GenerateIllustriousTxt2ImgCommand,
    error_message,
    parse_request,
    request_id_hint,
)


def _emit(message: dict[str, object], output: BinaryIO) -> None:
    encoded = json.dumps(message, separators=(",", ":"), ensure_ascii=False).encode("utf-8") + b"\n"
    output.write(encoded)
    output.flush()


def inference_ready_message(
    runtime: MLRuntime | None = None, *, owner_lifetime: bool = False
) -> dict[str, object]:
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
            INFERENCE_IMG2IMG_CAPABILITY,
            INFERENCE_LORA_CAPABILITY,
            INFERENCE_VAE_PRECISION_CAPABILITY,
            INFERENCE_EXTERNAL_VAE_CAPABILITY,
            INFERENCE_EMBEDDINGS_CAPABILITY,
            INFERENCE_OUTPAINT_CAPABILITY,
            INFERENCE_EULER_CAPABILITY,
            INFERENCE_NOISE_PROFILE_CAPABILITY,
            "smart-patch-execution",
            "smart-patch-seed-confirmation",
            "private-current-canvas-regional-v1",
            "illustrious-regional-invoke-v1",
            "illustrious-regional-invoke-init-v1",
            "illustrious-regional-progress-v1",
            "illustrious-regional-lora-v1",
            "illustrious-regional-vae-v1",
            "illustrious-regional-dpmpp-2m-v1",
            "illustrious-regional-cfg-rescale-v1",
            "illustrious-regional-img2img-v1",
            "illustrious-regional-img2img-cfg-rescale-v1",
            "illustrious-regional-img2img-euler-a-v1",
            "illustrious-regional-img2img-dpmpp-2m-v1",
            "illustrious-regional-img2img-vae-v1",
            "illustrious-regional-outpaint-v1",
            "illustrious-regional-v-prediction-v1",
            "illustrious-regional-v-prediction-image-v1",
            "illustrious-regional-v-prediction-sampling-v1",
            *(("linux-owned-inference-v1",) if owner_lifetime else ()),
            *(
                (
                    *ANIMA_CAPABILITIES,
                    "anima-regional-txt2img-v1",
                    "anima-regional-sampling-v1",
                    "anima-regional-img2img-v1",
                    "anima-regional-outpaint-v1",
                    "anima-regional-lora-v1",
                    "anima-regional-negative-v1",
                )
                if runtime is not None and supports_anima_compute(runtime)
                else ()
            ),
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
        private_type = (
            cast(dict[str, object], value).get("type") if isinstance(value, dict) else None
        )
        if private_type in (
            "execute-current-canvas-regional",
            "execute-current-canvas-anima-regional",
        ):
            if private_type == "execute-current-canvas-anima-regional":
                from imagegen_worker.anima_regional_worker import (
                    execute_anima_regional_request as execute_regional_request,
                )
            else:
                from imagegen_worker.illustrious_regional_worker import execute_regional_request

            regional_progress = None
            if (
                cast(dict[str, object], value).get("reportProgress") is True
                and on_progress is not None
            ):
                if not callable(on_progress):
                    raise DerivativeError(
                        "INVALID_REQUEST", "Regional progress requires a callable sink."
                    )

                def report_regional_progress(step: int, total_steps: int) -> None:
                    on_progress(
                        {
                            "type": "generation-progress",
                            "protocolVersion": PROTOCOL_VERSION,
                            "requestId": request_id,
                            "step": step,
                            "totalSteps": total_steps,
                        }
                    )

                regional_progress = report_regional_progress
            with contextlib.redirect_stdout(sys.stderr):
                return execute_regional_request(
                    cast(object, value),
                    config_dir=config_dir,
                    runtime=runtime,
                    **({"on_progress": regional_progress} if regional_progress is not None else {}),
                )
        command = parse_request(cast(object, value))
        if isinstance(command, ComposeTargetCommand):
            with contextlib.redirect_stdout(sys.stderr):
                result = compose_target(command.target)
            return {
                "type": "target-done",
                "protocolVersion": PROTOCOL_VERSION,
                "requestId": command.request_id,
                **result,
            }
        if not isinstance(
            command,
            (
                GenerateIllustriousTxt2ImgCommand,
                GenerateAnimaTxt2ImgCommand,
                ExecuteSmartPatchCommand,
            ),
        ):
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
            if isinstance(command, ExecuteSmartPatchCommand):
                from imagegen_worker.smart_patch_execution import execute_smart_patch

                return execute_smart_patch(
                    command,
                    config_dir=config_dir,
                    runtime=runtime,
                    on_progress=report_progress if on_progress is not None else None,
                )
            if isinstance(command, GenerateAnimaTxt2ImgCommand):
                return generate_anima(
                    command,
                    runtime=runtime,
                    on_progress=report_progress if on_progress is not None else None,
                )
            if isinstance(command, GenerateIllustriousOutpaintCommand):
                return generate_illustrious_outpaint(
                    command,
                    config_dir=config_dir,
                    runtime=runtime,
                    on_progress=report_progress if on_progress is not None else None,
                )
            if isinstance(command, GenerateIllustriousImg2ImgCommand):
                return generate_illustrious_img2img(
                    command,
                    config_dir=config_dir,
                    runtime=runtime,
                    on_progress=report_progress if on_progress is not None else None,
                )
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


def main(*, owner_lifetime: bool = False) -> int:
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
    emit(inference_ready_message(runtime, owner_lifetime=owner_lifetime))
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
        result = process_inference_request(
            value, config_dir=config_dir, runtime=runtime, on_progress=emit
        )
        # Public pipeline/component objects may form unreachable cycles when an
        # externally provided VAE is registered. Collect only after inference's
        # frames have returned, before another job loads models into this child.
        # Live objects remain owned; the CUDA allocator can reuse its cache.
        gc.collect()
        emit(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
