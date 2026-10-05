"""Qualify exact bundled tokenizers for original Anima, without Hub discovery.

The six tokenizer files are from InvokeAI 9e1540962bcca7f8fa668d7d8e02cf79d75fda3b.
Qwen's base vocabulary/merge pairs match Qwen3-0.6B-Base; the bundled config is
Invoke's Qwen3 config, with its own special tokens/EOS. Consumers tokenize direct
cleaned text, never its chat template. T5 contributes IDs, not encoder weights.

All resource bytes, decompressed bounds and licensing files are checked on every
call before native loaders receive a complete temporary local directory. There
is no caller-supplied asset profile, process cache or network fallback. This
foundation does not advertise an Anima generation capability.
"""

from __future__ import annotations

import gzip
import hashlib
import importlib
import importlib.metadata
import io
import os
import stat
import tempfile
import zlib
from dataclasses import dataclass
from importlib import resources
from pathlib import Path
from typing import Any

from imagegen_worker.derivatives import DerivativeError, canonical_absolute_path


@dataclass(frozen=True)
class AnimaTokenizers:
    qwen3: Any
    t5: Any


@dataclass(frozen=True)
class _Asset:
    path: str
    byte_size: int
    sha256: str
    decoded_size: int | None = None
    decoded_sha256: str | None = None


_ASSETS = (
    _Asset(
        "qwen3/tokenizer.json.gz",
        2_063_527,
        "2cb7076bbf0655e2ef1705162dc361206cd3a2050c3ee1e4c3254fe0b582390b",
        11_422_654,
        "aeb13307a71acd8fe81861d94ad54ab689df773318809eed3cbe794b4492dae4",
    ),
    _Asset(
        "qwen3/tokenizer_config.json",
        9_762,
        "a8252afd8dad82d2ec493f7b2ea3af2bd081a75bcc849a564e9d51fb0131fb9d",
    ),
    _Asset(
        "qwen3/special_tokens_map.json",
        613,
        "76862e765266b85aa9459767e33cbaf13970f327a0e88d1c65846c2ddd3a1ecd",
    ),
    _Asset(
        "t5/tokenizer.json.gz",
        606_751,
        "e52a724ff7ab62a104e40aaac8c8d89cc177c810e3c2f6f6787ceef84a126467",
        2_424_235,
        "f5dfec163765e18e270537fe896c49f5fad74db1525641d9b255a3008b999596",
    ),
    _Asset(
        "t5/tokenizer_config.json",
        20_848,
        "d8e1edceb843032e85dcf4f7736fbb224b4ab0ef3e8c2259e858d07f67df99af",
    ),
    _Asset(
        "t5/special_tokens_map.json",
        2_543,
        "7a1985a994c41886db38c719d2a3d2f40606663cc19d7c5d6a85d349320e06d2",
    ),
    _Asset(
        "LICENSE-APACHE-2.0.txt",
        11_343,
        "832dd9e00a68dd83b3c3fb9f5588dad7dcf337a0db50f7d9483f310cd292e92e",
    ),
    _Asset(
        "NOTICE.txt",
        1_458,
        "803fdc8cbf43150895ac5ea38e9d76ae5569a0f85babceecbd93ae78f4e160f7",
    ),
)
_VERSIONS = (("transformers", "5.5.4"), ("tokenizers", "0.22.2"))


def _unavailable(message: str) -> DerivativeError:
    return DerivativeError("INFERENCE_UNAVAILABLE", message)


def _asset_root() -> Path:
    root = resources.files("imagegen_worker").joinpath("assets", "anima")
    if not isinstance(root, Path):
        raise _unavailable("Anima tokenizer resources require an installed filesystem package.")
    return root


def _verify_tree(root: Path) -> None:
    canonical_absolute_path(root, label="Anima tokenizer assets")
    if not stat.S_ISDIR(root.lstat().st_mode):
        raise _unavailable("Anima tokenizer asset directory is unavailable.")
    expected_files = {asset.path for asset in _ASSETS}
    expected_dirs = {"qwen3", "t5"}
    actual_files: set[str] = set()
    actual_dirs: set[str] = set()
    for directory, directories, files in os.walk(root, followlinks=False):
        for name in directories:
            path = Path(directory) / name
            if not stat.S_ISDIR(path.lstat().st_mode):
                raise _unavailable("Anima tokenizer asset directories must not be links.")
            actual_dirs.add(path.relative_to(root).as_posix())
        for name in files:
            path = Path(directory) / name
            if not stat.S_ISREG(path.lstat().st_mode):
                raise _unavailable("Anima tokenizer assets must be regular files, never links.")
            actual_files.add(path.relative_to(root).as_posix())
    if actual_files != expected_files or actual_dirs != expected_dirs:
        raise _unavailable("The complete exact Anima tokenizer asset set is required.")


def _read_asset(root_fd: int, asset: _Asset) -> bytes:
    flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
    directories: list[int] = []
    parent_fd = root_fd
    try:
        parts = asset.path.split("/")
        for part in parts[:-1]:
            parent_fd = os.open(part, flags | os.O_DIRECTORY, dir_fd=parent_fd)
            directories.append(parent_fd)
        fd = os.open(parts[-1], flags, dir_fd=parent_fd)
        with os.fdopen(fd, "rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_size != asset.byte_size:
                raise _unavailable("Anima tokenizer asset size or file type changed.")
            data = stream.read(asset.byte_size + 1)
            after = os.fstat(stream.fileno())
        identity = (
            before.st_dev,
            before.st_ino,
            before.st_size,
            before.st_mtime_ns,
            before.st_ctime_ns,
        )
        final_identity = (
            after.st_dev,
            after.st_ino,
            after.st_size,
            after.st_mtime_ns,
            after.st_ctime_ns,
        )
        if identity != final_identity or len(data) != asset.byte_size:
            raise _unavailable("Anima tokenizer asset changed while reading.")
        if hashlib.sha256(data).hexdigest() != asset.sha256:
            raise _unavailable("Anima tokenizer asset SHA-256 changed.")
        return data
    finally:
        for directory_fd in reversed(directories):
            os.close(directory_fd)


def _decode_asset(asset: _Asset, raw: bytes) -> bytes:
    if asset.decoded_size is None:
        return raw
    with gzip.GzipFile(fileobj=io.BytesIO(raw), mode="rb") as compressed:
        decoded = compressed.read(asset.decoded_size + 1)
    if len(decoded) != asset.decoded_size:
        raise _unavailable("Anima tokenizer decompression exceeded or missed its exact size.")
    if hashlib.sha256(decoded).hexdigest() != asset.decoded_sha256:
        raise _unavailable("Anima tokenizer decompressed SHA-256 changed.")
    return decoded


def _qualified_assets() -> dict[str, bytes]:
    root = _asset_root()
    _verify_tree(root)
    root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        raw_assets = {asset.path: _read_asset(root_fd, asset) for asset in _ASSETS}
    finally:
        os.close(root_fd)
    return {asset.path: _decode_asset(asset, raw_assets[asset.path]) for asset in _ASSETS}


def _validate_native_tokenizers(tokenizers: AnimaTokenizers) -> None:
    qwen3, t5 = tokenizers.qwen3, tokenizers.t5
    if (
        not qwen3.is_fast
        or not t5.is_fast
        or len(qwen3) != 151_669
        or len(t5) != 32_100
        or (qwen3.pad_token_id, qwen3.eos_token_id, qwen3.bos_token_id) != (151_643, 151_645, None)
        or (t5.pad_token_id, t5.eos_token_id, t5.bos_token_id) != (0, 1, None)
        or qwen3.model_max_length != 131_072
        or t5.model_max_length != 512
        or qwen3("A cinematic photo of a cat").input_ids != [32, 64665, 6548, 315, 264, 8251]
        or t5("a cat sitting on a mat").input_ids != [3, 9, 1712, 3823, 30, 3, 9, 6928, 1]
    ):
        raise _unavailable("Native Anima tokenizer semantics do not match the pinned assets.")
    empty = t5("", return_offsets_mapping=True, return_special_tokens_mask=True)
    if (
        empty.input_ids != [1]
        or empty.offset_mapping != [(0, 0)]
        or empty.special_tokens_mask != [1]
        or qwen3("").input_ids != []
    ):
        raise _unavailable("Native Anima special-token semantics changed.")


def load_anima_tokenizers() -> AnimaTokenizers:
    """Load verified builtin assets into native fast tokenizers, fully offline.

    Package/runtime defects fail without model inference or Hub fallback. Repair
    is reinstalling the managed worker/runtime, not discovering another tokenizer.
    """
    try:
        assets = _qualified_assets()
        for package, version in _VERSIONS:
            if importlib.metadata.version(package) != version:
                raise _unavailable("Pinned Anima tokenizer dependencies are unavailable.")
        transformers = importlib.import_module("transformers")
        with tempfile.TemporaryDirectory(prefix="igs-anima-tokenizers-") as temporary:
            directory = Path(temporary)
            for name, data in assets.items():
                if "/" not in name:
                    continue
                path = directory / name.removesuffix(".gz")
                path.parent.mkdir(exist_ok=True)
                path.write_bytes(data)
            tokenizers = AnimaTokenizers(
                qwen3=transformers.Qwen2TokenizerFast.from_pretrained(
                    directory / "qwen3", local_files_only=True
                ),
                t5=transformers.T5TokenizerFast.from_pretrained(
                    directory / "t5", local_files_only=True
                ),
            )
        _validate_native_tokenizers(tokenizers)
        return tokenizers
    except DerivativeError as error:
        if error.code == "INFERENCE_UNAVAILABLE":
            raise
        raise _unavailable("Anima tokenizer asset path is invalid.") from error
    except (
        OSError,
        EOFError,
        ValueError,
        ImportError,
        importlib.metadata.PackageNotFoundError,
        zlib.error,
    ) as error:
        raise _unavailable("Exact local Anima tokenizers are unavailable.") from error
