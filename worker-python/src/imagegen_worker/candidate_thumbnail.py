"""Optional bounded candidate cache created from the inference result already in memory."""

from __future__ import annotations

import contextlib
import hashlib
import os
import stat
from pathlib import Path
from typing import TypedDict

from PIL import Image

from imagegen_worker.derivatives import write_temporary_image

MAX_CANDIDATE_THUMBNAIL_SIDE = 256
MAX_CANDIDATE_THUMBNAIL_BYTES = 256 * 1024
CANDIDATE_THUMBNAIL_QUALITY = 80


class CandidateThumbnailInfo(TypedDict):
    outputPath: str
    sha256: str
    byteSize: int
    width: int
    height: int


def _stable_thumbnail_bytes(temporary: Path) -> bytes:
    descriptor = os.open(temporary, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as stream:
        before = os.fstat(stream.fileno())
        if (
            not stat.S_ISREG(before.st_mode)
            or before.st_nlink != 1
            or not 1 <= before.st_size <= MAX_CANDIDATE_THUMBNAIL_BYTES
        ):
            raise OSError("Invalid thumbnail cache file.")
        content = stream.read(MAX_CANDIDATE_THUMBNAIL_BYTES + 1)
        after = os.fstat(stream.fileno())
        at_path = temporary.lstat()
        if (
            len(content) != before.st_size
            or before.st_dev != after.st_dev
            or before.st_ino != after.st_ino
            or before.st_size != after.st_size
            or before.st_mtime_ns != after.st_mtime_ns
            or before.st_ctime_ns != after.st_ctime_ns
            or before.st_dev != at_path.st_dev
            or before.st_ino != at_path.st_ino
            or stat.S_ISLNK(at_path.st_mode)
        ):
            raise OSError("Thumbnail cache changed during its read.")
        return content


def create_candidate_thumbnail(
    image: Image.Image, output_png_path: Path
) -> CandidateThumbnailInfo | None:
    """Leave the required PNG and source image untouched when this optional cache fails."""
    destination = Path(str(output_png_path) + ".thumb.webp")
    temporary: Path | None = None
    published = False
    succeeded = False
    try:
        thumbnail = image.copy()
        if thumbnail.mode not in {"RGB", "RGBA"}:
            thumbnail = thumbnail.convert("RGBA" if "A" in image.getbands() else "RGB")
        thumbnail.thumbnail(
            (MAX_CANDIDATE_THUMBNAIL_SIDE, MAX_CANDIDATE_THUMBNAIL_SIDE),
            Image.Resampling.LANCZOS,
        )
        temporary = write_temporary_image(
            thumbnail, destination, "WEBP", webp_quality=CANDIDATE_THUMBNAIL_QUALITY
        )
        content = _stable_thumbnail_bytes(temporary)
        os.link(temporary, destination, follow_symlinks=False)
        published = True
        directory_fd = os.open(destination.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
        result: CandidateThumbnailInfo = {
            "outputPath": str(destination),
            "sha256": hashlib.sha256(content).hexdigest(),
            "byteSize": len(content),
            "width": thumbnail.width,
            "height": thumbnail.height,
        }
        succeeded = True
        return result
    except Exception:
        # Cache failure cannot change a completed candidate or expose private path diagnostics.
        return None
    finally:
        if temporary is not None:
            with contextlib.suppress(OSError):
                temporary.unlink(missing_ok=True)
        if published and not succeeded:
            # Main's private scratch cleanup owns any cache orphan that cannot be removed.
            with contextlib.suppress(OSError):
                destination.unlink(missing_ok=True)
