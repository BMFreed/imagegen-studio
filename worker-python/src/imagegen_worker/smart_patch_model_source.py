"""Private model RGB preparation from the frozen Smart Patch processing source.

Mode belongs to Main. Only source alpha sets LaMa holes; authored and derived
mask planes are deliberately absent from this operation. No family inference,
model discovery, download, queue, candidate or project mutation is performed.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, TypedDict

from PIL import Image

from imagegen_worker.compositor import MAX_TARGET_PIXELS, MAX_TARGET_SIDE
from imagegen_worker.derivatives import (
    SRGB_ICC_PROFILE,
    ArtifactInfo,
    DerivativeError,
    artifact_info,
    canonical_absolute_path,
    write_temporary_image,
)
from imagegen_worker.lama_infill import (
    OUTPAINT_INFILL_BYTE_SIZE,
    OUTPAINT_INFILL_SHA256,
    load_local_lama,
)
from imagegen_worker.smart_patch_fade import SmartPatchFadeMode
from imagegen_worker.smart_patch_preparation import (
    MAX_PREPARATION_PNG_BYTES,
    PreparationImage,
    decode_preparation_image,
)


@dataclass(frozen=True)
class SmartPatchInfillResource:
    path: Path
    sha256: str
    byte_size: int
    role: Literal["outpaint-infill"] = "outpaint-infill"


@dataclass(frozen=True)
class SmartPatchModelSourceRequest:
    mode: SmartPatchFadeMode
    source: PreparationImage | None
    infill_resource: SmartPatchInfillResource | None
    staging_root: Path
    model_source_png_path: Path | None


class SmartPatchModelSourceResult(TypedDict):
    modelSource: ArtifactInfo | None


def _destination(request: SmartPatchModelSourceRequest, source: PreparationImage) -> Path:
    root = canonical_absolute_path(request.staging_root, label="Model source staging root")
    if not root.is_dir():
        raise DerivativeError("INVALID_PATH", "Model source staging root must exist.")
    source_path = canonical_absolute_path(source.path, label="Processing source input")
    if request.model_source_png_path is None:
        raise DerivativeError("INVALID_REQUEST", "Model source requires a nominated output.")
    destination = canonical_absolute_path(
        request.model_source_png_path, label="Model source output"
    )
    if (
        destination == source_path
        or destination.suffix.lower() != ".png"
        or root not in destination.parents
    ):
        raise DerivativeError("INVALID_PATH", "Model source output must be a new staging PNG.")
    if not destination.parent.is_dir() or os.path.lexists(destination):
        raise DerivativeError("OUTPUT_UNAVAILABLE", "Model source output is unavailable.")
    if request.infill_resource is not None:
        resource = request.infill_resource
        if (
            resource.role != "outpaint-infill"
            or resource.sha256 != OUTPAINT_INFILL_SHA256
            or type(resource.byte_size) is not int
            or resource.byte_size != OUTPAINT_INFILL_BYTE_SIZE
        ):
            raise DerivativeError("INVALID_REQUEST", "Smart Patch requires the pinned LaMa.")
        resource_path = canonical_absolute_path(resource.path, label="LaMa resource")
        if resource_path in (source_path, destination, root) or root in resource_path.parents:
            raise DerivativeError("INVALID_PATH", "LaMa must be distinct and outside staging.")
    return destination


def _publish(destination: Path, image: Image.Image) -> SmartPatchModelSourceResult:
    temporary: Path | None = None
    published = False
    succeeded = False
    try:
        temporary = write_temporary_image(image, destination, "PNG")
        os.link(temporary, destination, follow_symlinks=False)
        published = True
        descriptor = os.open(destination.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        metadata = artifact_info(destination, image)
        if metadata["byteSize"] > MAX_PREPARATION_PNG_BYTES:
            raise DerivativeError("IMAGE_TOO_LARGE", "Model source exceeds the PNG byte limit.")
        succeeded = True
        return {"modelSource": metadata}
    except FileExistsError as error:
        raise DerivativeError(
            "OUTPUT_UNAVAILABLE", "Model source output already exists."
        ) from error
    except OSError as error:
        raise DerivativeError("DERIVATIVE_FAILED", "Model source could not be stored.") from error
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
        if published and not succeeded:
            destination.unlink(missing_ok=True)


def prepare_smart_patch_model_source(
    request: SmartPatchModelSourceRequest,
) -> SmartPatchModelSourceResult:
    """Produce null for TXT and detached RGB for IMG/INP or source-alpha-only OUT."""
    if request.mode not in ("txt2img", "img2img", "inpaint", "outpaint"):
        raise DerivativeError("INVALID_REQUEST", "Smart Patch source mode is unsupported.")
    if request.mode == "txt2img":
        if (
            request.source is not None
            or request.model_source_png_path is not None
            or request.infill_resource is not None
        ):
            raise DerivativeError("INVALID_REQUEST", "TXT must not supply source or infill files.")
        return {"modelSource": None}
    source_ref = request.source
    if source_ref is None or (request.mode == "outpaint") != (request.infill_resource is not None):
        raise DerivativeError("INVALID_REQUEST", "Model source inputs do not match its mode.")
    width, height = source_ref.width, source_ref.height
    if (
        type(width) is not int
        or type(height) is not int
        or width < 8
        or height < 8
        or width % 8
        or height % 8
    ):
        raise DerivativeError("INVALID_REQUEST", "Model source requires the processing /8 grid.")
    if width > MAX_TARGET_SIDE or height > MAX_TARGET_SIDE or width * height > MAX_TARGET_PIXELS:
        raise DerivativeError("IMAGE_TOO_LARGE", "Model source exceeds the CPU pixel limit.")
    destination = _destination(request, source_ref)
    source = decode_preparation_image(source_ref, numeric_mask=False)
    resource = request.infill_resource
    if resource is None:
        image = source.convert("RGB")
    else:
        model = load_local_lama(
            resource.path,
            expected_sha256=resource.sha256,
            expected_byte_size=resource.byte_size,
            device="cpu",
        )
        image = model.infill_processing_source(source)
    if image.mode != "RGB" or image.size != source.size:
        raise DerivativeError("GENERATION_WORKER_FAILED", "Model source RGB topology differs.")
    image.info["icc_profile"] = SRGB_ICC_PROFILE
    return _publish(destination, image)
