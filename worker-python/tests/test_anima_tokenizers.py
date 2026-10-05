"""Actual asset/tokenizer boundary, not tokenizer vocab invented in a test."""

# pyright: reportPrivateUsage=false
# Package-directory and immutable manifest collaborators isolate refusal boundaries.

from __future__ import annotations

import gzip
import hashlib
import importlib.util
import os
import shutil
import socket
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest

import imagegen_worker.anima_tokenizers as subject
from imagegen_worker.anima_tokenizers import AnimaTokenizers, load_anima_tokenizers
from imagegen_worker.derivatives import DerivativeError

_FILE_NAMES = (
    "qwen3/tokenizer.json.gz",
    "qwen3/tokenizer_config.json",
    "qwen3/special_tokens_map.json",
    "t5/tokenizer.json.gz",
    "t5/tokenizer_config.json",
    "t5/special_tokens_map.json",
    "LICENSE-APACHE-2.0.txt",
    "NOTICE.txt",
)


@pytest.fixture(scope="session")
def native_tokenizers() -> AnimaTokenizers:
    if importlib.util.find_spec("transformers") is None:
        pytest.skip("native ML extra absent")
    return load_anima_tokenizers()


@pytest.fixture
def asset_tree(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Trusted installed-package directory collaborator; every actual byte stays real."""
    root = tmp_path / "anima"
    shutil.copytree(subject._asset_root(), root)
    monkeypatch.setattr(subject, "_asset_root", lambda: root)
    return root


def _assert_unavailable() -> None:
    with pytest.raises(DerivativeError) as failure:
        load_anima_tokenizers()
    assert failure.value.code == "INFERENCE_UNAVAILABLE"


def test_original_anima_tokenizers_preserve_known_ids_and_unicode_offsets(
    native_tokenizers: AnimaTokenizers,
) -> None:
    assert native_tokenizers.qwen3("A cinematic photo of a cat").input_ids == [
        32,
        64665,
        6548,
        315,
        264,
        8251,
    ]
    result = native_tokenizers.t5(
        "red🔥hair", return_offsets_mapping=True, return_special_tokens_mask=True
    )
    assert result.input_ids == [1131, 2, 19176, 1]
    assert result.offset_mapping == [(0, 3), (3, 4), (4, 8), (0, 0)]
    assert result.special_tokens_mask == [0, 0, 0, 1]


def test_real_tokenizer_offsets_allow_overlap_and_normalization_gaps(
    native_tokenizers: AnimaTokenizers,
) -> None:
    result = native_tokenizers.t5("😀a café 文本", return_offsets_mapping=True)
    assert result.offset_mapping == [(0, 1), (0, 1), (1, 2), (3, 7), (9, 10), (9, 11), (0, 0)]
    assert result.input_ids == [3, 2, 9, 11949, 3, 2, 1]
    assert native_tokenizers.t5("  long\n  hair\tred").input_ids == [307, 1268, 1131, 1]


def test_tokenize_whole_prompt_and_keep_special_tokens_and_truncation_aligned(
    native_tokenizers: AnimaTokenizers,
) -> None:
    t5, qwen3 = native_tokenizers.t5, native_tokenizers.qwen3
    assert qwen3("").input_ids == []
    empty = t5("", return_offsets_mapping=True, return_special_tokens_mask=True)
    assert empty.input_ids == [1]
    assert empty.offset_mapping == [(0, 0)]
    assert empty.special_tokens_mask == [1]
    assert t5("embedding", add_special_tokens=False).input_ids == [25078, 26, 53]
    fragment_ids = (
        t5("emb", add_special_tokens=False).input_ids
        + t5("edding", add_special_tokens=False).input_ids
    )
    assert fragment_ids == [10960, 3, 15, 7249]
    assert fragment_ids != t5("embedding", add_special_tokens=False).input_ids
    literal = t5("<extra_id_0>", return_offsets_mapping=True, return_special_tokens_mask=True)
    assert literal.input_ids == [32099, 1]
    assert literal.special_tokens_mask == [0, 1]
    assert 32099 in t5.all_special_ids
    truncated = t5(
        "hair " * 600,
        padding=False,
        truncation=True,
        max_length=512,
        return_offsets_mapping=True,
        return_special_tokens_mask=True,
    )
    assert len(truncated.input_ids) == 512
    assert (truncated.input_ids[-1], truncated.offset_mapping[-1]) == (1, (0, 0))
    assert truncated.special_tokens_mask[-1] == 1


def test_exact_assets_can_be_qualified_without_loading_any_ml_model() -> None:
    assets = subject._qualified_assets()
    assert set(assets) == set(_FILE_NAMES)
    assert len(assets["qwen3/tokenizer.json.gz"]) == 11_422_654
    assert len(assets["t5/tokenizer.json.gz"]) == 2_424_235


@pytest.mark.parametrize("filename", _FILE_NAMES)
def test_any_asset_byte_change_is_refused_before_native_loading(
    filename: str, asset_tree: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = asset_tree / filename
    data = bytearray(path.read_bytes())
    data[len(data) // 2] ^= 1
    path.write_bytes(data)
    original_version = subject.importlib.metadata.version
    requested_versions: list[str] = []

    def version(package: str) -> str:
        requested_versions.append(package)
        return original_version(package)

    monkeypatch.setattr(subject.importlib.metadata, "version", version)
    _assert_unavailable()
    assert requested_versions == []


@pytest.mark.parametrize("filename", _FILE_NAMES)
def test_any_missing_asset_refuses_without_hub_fallback(filename: str, asset_tree: Path) -> None:
    (asset_tree / filename).unlink()
    _assert_unavailable()


@pytest.mark.parametrize("filename", ("qwen3/tokenizer.json.gz", "t5/tokenizer_config.json"))
def test_size_mismatch_is_refused_before_reading_large_assets(
    filename: str, asset_tree: Path
) -> None:
    with (asset_tree / filename).open("ab") as stream:
        stream.write(b"\0")
    _assert_unavailable()


@pytest.mark.parametrize("name", ("tokenizer.json", ".override", "qwen3/added_tokens.json"))
def test_unrecognized_asset_files_are_refused(name: str, asset_tree: Path) -> None:
    (asset_tree / name).write_text("{}", encoding="utf-8")
    _assert_unavailable()


def test_unrecognized_asset_directory_is_refused(asset_tree: Path) -> None:
    (asset_tree / "cache").mkdir()
    _assert_unavailable()


@pytest.mark.parametrize("name", ("qwen3/tokenizer.json.gz", "t5"))
def test_asset_symlinks_are_refused_even_if_the_target_bytes_are_exact(
    name: str, asset_tree: Path, tmp_path: Path
) -> None:
    path = asset_tree / name
    target = tmp_path / "external"
    path.rename(target)
    path.symlink_to(target, target_is_directory=target.is_dir())
    _assert_unavailable()


def test_asset_directory_itself_must_not_be_a_symlink(
    asset_tree: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    link = tmp_path / "linked-assets"
    link.symlink_to(asset_tree, target_is_directory=True)
    monkeypatch.setattr(subject, "_asset_root", lambda: link)
    _assert_unavailable()


def test_fifo_asset_is_refused_without_blocking(asset_tree: Path) -> None:
    path = asset_tree / "t5/tokenizer_config.json"
    path.unlink()
    os.mkfifo(path)
    _assert_unavailable()


def test_symlink_substituted_after_tree_inspection_is_not_followed(
    asset_tree: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = asset_tree / "qwen3/tokenizer_config.json"
    target = tmp_path / "unchanged-config.json"
    target.write_bytes(path.read_bytes())
    original_open = os.open
    substituted = False

    def open_file(
        filename: Any, flags: int, mode: int = 0o777, *, dir_fd: int | None = None
    ) -> int:
        nonlocal substituted
        if filename == "tokenizer_config.json" and dir_fd is not None and not substituted:
            path.unlink()
            path.symlink_to(target)
            substituted = True
        return original_open(filename, flags, mode, dir_fd=dir_fd)

    monkeypatch.setattr(os, "open", open_file)
    _assert_unavailable()
    assert substituted


@pytest.mark.parametrize("package", ("transformers", "tokenizers"))
def test_dependency_version_drift_refuses_before_native_loading(
    package: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    def version(name: str) -> str:
        if name == package:
            return "0.0.0"
        return dict(subject._VERSIONS)[name]

    monkeypatch.setattr(subject.importlib.metadata, "version", version)
    _assert_unavailable()


def test_gzip_is_read_with_an_exact_bounded_limit_before_refusing_oversize(
    asset_tree: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    spec = next(asset for asset in subject._ASSETS if asset.path == "t5/tokenizer.json.gz")
    assert spec.decoded_size is not None
    oversized = gzip.compress(b" " * (spec.decoded_size + 32), mtime=0)
    (asset_tree / spec.path).write_bytes(oversized)
    # Trusted manifest collaborator isolates decompression from the preceding SHA gate.
    altered_spec = replace(
        spec, byte_size=len(oversized), sha256=hashlib.sha256(oversized).hexdigest()
    )
    monkeypatch.setattr(
        subject,
        "_ASSETS",
        tuple(altered_spec if asset == spec else asset for asset in subject._ASSETS),
    )
    original_read = gzip.GzipFile.read
    requested_sizes: list[int | None] = []

    def read(stream: gzip.GzipFile, size: int | None = -1) -> bytes:
        requested_sizes.append(size)
        return original_read(stream, size)

    monkeypatch.setattr(gzip.GzipFile, "read", read)
    _assert_unavailable()
    assert spec.decoded_size + 1 in requested_sizes
    assert all(size is not None and size > 0 for size in requested_sizes)


def test_decompressed_identity_is_checked_independently_of_archive_identity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        subject,
        "_ASSETS",
        tuple(
            replace(asset, decoded_sha256="0" * 64)
            if asset.path == "t5/tokenizer.json.gz"
            else asset
            for asset in subject._ASSETS
        ),
    )
    _assert_unavailable()


def test_native_constructors_are_local_only_and_keep_temp_assets_out_of_the_result(
    native_tokenizers: AnimaTokenizers, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert native_tokenizers.qwen3.is_fast and native_tokenizers.t5.is_fast
    transformers = subject.importlib.import_module("transformers")
    loaded_paths: list[Path] = []
    loader_kwargs: list[dict[str, Any]] = []

    def no_network(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError("Anima tokenizer qualification tried to use the network")

    monkeypatch.setattr(socket.socket, "connect", no_network)
    for tokenizer_class in (transformers.Qwen2TokenizerFast, transformers.T5TokenizerFast):
        original = tokenizer_class.from_pretrained

        def recording_loader(
            cls: Any, path: Path, *args: Any, _original: Any = original, **kwargs: Any
        ) -> Any:
            loaded_paths.append(path)
            loader_kwargs.append(kwargs)
            return _original(path, *args, **kwargs)

        monkeypatch.setattr(tokenizer_class, "from_pretrained", classmethod(recording_loader))
    loaded = load_anima_tokenizers()
    assert len(loaded_paths) == 2
    assert all(kwargs.get("local_files_only") is True for kwargs in loader_kwargs)
    assert all(not path.exists() for path in loaded_paths)
    assert loaded.t5("long hair").input_ids == [307, 1268, 1]


def test_repeated_calls_recheck_asset_bytes_instead_of_returning_a_process_cache(
    native_tokenizers: AnimaTokenizers, asset_tree: Path
) -> None:
    assert native_tokenizers.qwen3("cat").input_ids
    (asset_tree / "NOTICE.txt").write_text("Changed installed package", encoding="utf-8")
    _assert_unavailable()
