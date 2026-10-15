"""Private exact-file/native Smart Patch execution, without queue or variants.

Only the already prepared RGB and numeric latent KEEP enter the family adapters.
World mode belongs to Main; this boundary never classifies alpha, repeats LaMa,
applies world contribution, or creates a candidate thumbnail.
"""

from __future__ import annotations

import hashlib
import os
import stat
from pathlib import Path
from typing import Any, cast

from PIL import Image

from imagegen_worker import PROTOCOL_VERSION, anima_worker, inference
from imagegen_worker.derivatives import (
    SRGB_ICC_PROFILE,
    DerivativeError,
    artifact_info,
    canonical_absolute_path,
    write_temporary_image,
)
from imagegen_worker.protocol import (
    AnimaInferenceParameters,
    ExecuteSmartPatchCommand,
    IllustriousInferenceParameters,
)
from imagegen_worker.smart_patch_denoising import (
    SmartPatchDenoisingInput,
    run_smart_patch_anima,
    run_smart_patch_illustrious,
)
from imagegen_worker.smart_patch_preparation import (
    MAX_PREPARATION_PNG_BYTES,
    decode_preparation_image,
    decode_preparation_rgb,
)


def _resource_entries(
    parameters: IllustriousInferenceParameters | AnimaInferenceParameters,
) -> dict[Path, tuple[str, int | None]]:
    if isinstance(parameters, IllustriousInferenceParameters):
        entries: list[tuple[Path, str, int | None]] = [
            (parameters.checkpoint_path, parameters.checkpoint_sha256, None)
        ]
        if parameters.vae is not None:
            entries.append((parameters.vae.path, parameters.vae.sha256, parameters.vae.byte_size))
        entries.extend((item.path, item.sha256, item.byte_size) for item in parameters.loras)
        # Reusing one exact embedding in both prompt signs is intentional.
        embeddings = (*parameters.positive_embeddings, *parameters.negative_embeddings)
        primary = {item[0] for item in entries}
        if len(primary) != len(entries) or primary & {item.path for item in embeddings}:
            raise DerivativeError("INVALID_PATH", "Smart Patch resource roles must be distinct.")
        entries.extend((item.path, item.sha256, item.byte_size) for item in embeddings)
    else:
        bundle = parameters.bundle
        files = (bundle.checkpoint, bundle.qwen3_encoder, bundle.vae, *parameters.loras)
        entries = [(item.path, item.sha256, item.byte_size) for item in files]
        if len({item[0] for item in entries}) != len(entries):
            raise DerivativeError("INVALID_PATH", "Smart Patch Anima resources must be distinct.")
    result: dict[Path, tuple[str, int | None]] = {}
    for path, digest, size in entries:
        identity = (digest, size)
        if path in result and result[path] != identity:
            raise DerivativeError(
                "INVALID_REQUEST", "One resource path has conflicting identities."
            )
        result[path] = identity
    return result


def _paths(
    command: ExecuteSmartPatchCommand, resources: dict[Path, tuple[str, int | None]]
) -> None:
    root = canonical_absolute_path(command.staging_root, label="Smart Patch staging root")
    if not root.is_dir():
        raise DerivativeError("INVALID_PATH", "Smart Patch staging root is unavailable.")
    entry = root.stat()
    if entry.st_uid != os.getuid() or entry.st_mode & 0o022:
        raise DerivativeError("INVALID_PATH", "Smart Patch staging root is unsafe.")
    image_paths = [command.latent_keep_mask.path, command.output_path]
    if command.model_source is not None:
        image_paths.append(command.model_source.path)
    if len(set(image_paths)) != len(image_paths):
        raise DerivativeError("INVALID_PATH", "Smart Patch inputs and output must be distinct.")
    for path in image_paths:
        captured = canonical_absolute_path(path, label="Smart Patch image")
        if captured.parent != root or captured.suffix != ".png":
            raise DerivativeError("INVALID_PATH", "Smart Patch images must be direct staging PNGs.")
    if os.path.lexists(command.output_path):
        raise DerivativeError("OUTPUT_UNAVAILABLE", "Smart Patch output already exists.")
    for path in resources:
        canonical = canonical_absolute_path(path, label="Smart Patch resource")
        if canonical in image_paths or canonical == root or root in canonical.parents:
            raise DerivativeError("INVALID_PATH", "Smart Patch resources must be outside staging.")


def _verify_resources(resources: dict[Path, tuple[str, int | None]]) -> None:
    """Verify around native loading; component loaders retain exact snapshots too."""
    for path, (expected_hash, expected_size) in resources.items():
        try:
            descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            with os.fdopen(descriptor, "rb") as stream:
                entry = os.fstat(stream.fileno())
                if not stat.S_ISREG(entry.st_mode) or (
                    expected_size is not None and entry.st_size != expected_size
                ):
                    raise DerivativeError("GENERATION_INPUT_CHANGED", "Resource identity changed.")
                digest, size = hashlib.sha256(), 0
                while chunk := stream.read(1024 * 1024):
                    digest.update(chunk)
                    size += len(chunk)
                if digest.hexdigest() != expected_hash or (
                    expected_size is not None and size != expected_size
                ):
                    raise DerivativeError("GENERATION_INPUT_CHANGED", "Resource bytes changed.")
        except OSError as error:
            raise DerivativeError("GENERATION_INPUT_CHANGED", "Resource is unavailable.") from error


def capture_smart_patch_execution(command: ExecuteSmartPatchCommand) -> SmartPatchDenoisingInput:
    """Own both verified pixel snapshots before the first native callback."""
    keep = decode_preparation_image(
        command.latent_keep_mask, numeric_mask=True, require_tight_mask=False
    ).getchannel("A")
    if command.mode in ("txt2img", "img2img") and keep.getextrema() != (0, 0):
        raise DerivativeError("INVALID_REQUEST", "Ordinary Smart Patch modes require zero KEEP.")
    source = None if command.model_source is None else decode_preparation_rgb(command.model_source)
    return SmartPatchDenoisingInput(
        mode=command.mode,
        width=command.width,
        height=command.height,
        model_source=source,
        latent_keep_mask=keep,
    )


def _publish(
    command: ExecuteSmartPatchCommand, image: Image.Image, actual_seed: int
) -> dict[str, object]:
    if (
        image.mode != "RGB"
        or image.size != (command.width, command.height)
        or (image.info.get("icc_profile") not in (None, SRGB_ICC_PROFILE))
    ):
        raise DerivativeError("GENERATION_WORKER_FAILED", "Smart Patch output must be exact RGB.")
    temporary: Path | None = None
    publication_identity: tuple[int, int] | None = None
    published = False
    succeeded = False
    try:
        temporary = write_temporary_image(image, command.output_path, "PNG")
        entry = temporary.stat()
        publication_identity = (entry.st_dev, entry.st_ino)
        os.link(temporary, command.output_path, follow_symlinks=False)
        published = True
        descriptor = os.open(command.staging_root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        metadata = artifact_info(command.output_path, image)
        if metadata["byteSize"] > MAX_PREPARATION_PNG_BYTES:
            raise DerivativeError("IMAGE_TOO_LARGE", "Smart Patch output exceeds the PNG limit.")
        succeeded = True
        return {
            "type": "smart-patch-executed",
            "protocolVersion": PROTOCOL_VERSION,
            "requestId": command.request_id,
            "actualSeed": actual_seed,
            "output": metadata,
        }
    except FileExistsError as error:
        raise DerivativeError("OUTPUT_UNAVAILABLE", "Smart Patch output already exists.") from error
    except OSError as error:
        raise DerivativeError(
            "GENERATION_WORKER_FAILED", "Smart Patch output could not be stored."
        ) from error
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
        if published and not succeeded:
            try:
                entry = command.output_path.lstat()
            except FileNotFoundError:
                pass
            else:
                if (entry.st_dev, entry.st_ino) == publication_identity:
                    command.output_path.unlink(missing_ok=True)


def execute_smart_patch(
    command: ExecuteSmartPatchCommand,
    *,
    config_dir: Path,
    runtime: inference.MLRuntime,
    on_progress: inference.DenoisingProgressSink | None = None,
) -> dict[str, object]:
    resources = _resource_entries(command.inference)
    _paths(command, resources)
    prepared = capture_smart_patch_execution(command)
    _verify_resources(resources)
    torch = cast(Any, runtime.torch)
    policy = command.inference
    actual_seed = (
        policy.seed if isinstance(policy, IllustriousInferenceParameters) else policy.sampling.seed
    )
    if isinstance(policy, IllustriousInferenceParameters):
        pipeline, embeddings = inference.load_illustrious_pipeline(
            policy, config_dir=config_dir, runtime=runtime, mode=command.mode
        )
        _verify_resources(resources)
        conditioning = inference.prepare_illustrious_conditioning(
            policy, pipeline, runtime, embeddings
        )
        native = run_smart_patch_illustrious(
            pipeline,
            conditioning,
            prepared,
            steps=policy.steps,
            cfg_scale=policy.cfg_scale,
            cfg_rescale=policy.cfg_rescale,
            generator=torch.Generator(device="cpu").manual_seed(policy.seed),
            torch=torch,
            denoising_strength=command.denoising_strength,
            on_progress=on_progress,
        )
        image = cast(Image.Image, native.images[0])
    else:
        if not anima_worker.supports_anima_compute(runtime):
            raise DerivativeError(
                "INFERENCE_UNAVAILABLE", "Anima requires native CUDA BF16 compute."
            )
        models = anima_worker.load_anima_models(policy.bundle, device="cuda", dtype=torch.bfloat16)
        _verify_resources(resources)
        result = run_smart_patch_anima(
            anima_worker.anima_sampling_payload(policy.sampling),
            anima_worker.anima_prompt_payload(policy.positive_prompt),
            anima_worker.anima_prompt_payload(policy.negative_prompt),
            models,
            prepared,
            loras=policy.loras,
            progress=on_progress,
        )
        if result.total_steps != policy.sampling.total_steps:
            raise DerivativeError("GENERATION_WORKER_FAILED", "Anima execution count differs.")
        image = result.image
    return _publish(command, image, actual_seed)
