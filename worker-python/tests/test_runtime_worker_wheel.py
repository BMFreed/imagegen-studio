"""Real tiny ZIP inputs; no package installation, import, network or CUDA execution."""

from __future__ import annotations

import hashlib
import importlib.util
import stat
import struct
import sys
import zipfile
from pathlib import Path
from typing import cast

import pytest
from packaging.requirements import Requirement
from packaging.specifiers import SpecifierSet
from packaging.tags import Tag

SCRIPT = Path(__file__).parents[2] / "scripts" / "runtime_worker_wheel.py"
SPEC = importlib.util.spec_from_file_location("igs_runtime_worker_wheel", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
wheel_module = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = wheel_module
SPEC.loader.exec_module(wheel_module)

PROJECT = b"""[project]
name = "imagegen-worker"
version = "0.1.0"
requires-python = ">=3.12,<3.13"
dependencies = ["pillow==12.2.0"]
[project.optional-dependencies]
inference = ["torch==2.7.1", "demo[feature]==1.2; sys_platform == 'linux'"]
"""
INFO = "imagegen_worker-0.1.0.dist-info"
TAGS = {Tag("py3", "none", "any")}
METADATA = b"""Metadata-Version: 2.4
Name: ImageGen-Worker
Version: 0.1.0
Requires-Python: <3.13,>=3.12
Requires-Dist: pillow==12.2.0
Provides-Extra: inference
Requires-Dist: torch==2.7.1; extra == 'inference'
Requires-Dist: demo[feature]==1.2; (sys_platform == 'linux') and extra == 'inference'

"""
WHEEL = b"Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: py3-none-any\n\n"


def payload() -> dict[str, bytes]:
    return {
        "imagegen_worker/__init__.py": b"# owned package fixture\n",
        f"{INFO}/METADATA": METADATA,
        f"{INFO}/WHEEL": WHEEL,
        f"{INFO}/RECORD": b"",
    }


def make_wheel(
    tmp_path: Path,
    entries: dict[str, bytes] | None = None,
    filename: str = "imagegen_worker-0.1.0-py3-none-any.whl",
) -> Path:
    path = tmp_path / filename
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in (payload() if entries is None else entries).items():
            archive.writestr(name, content)
    return path


def inspect(
    path: Path, project: bytes = PROJECT, tags: set[Tag] | None = None
) -> dict[str, object]:
    selected = TAGS if tags is None else tags
    return cast("dict[str, object]", wheel_module.inspect_worker_wheel(path, project, selected))


def test_exact_archive_bytes_and_canonical_metadata_are_bound(tmp_path: Path) -> None:
    path = make_wheel(tmp_path)
    original = path.read_bytes()
    assert inspect(path) == {
        "distribution": "imagegen-worker",
        "version": "0.1.0",
        "filename": path.name,
        "sha256": hashlib.sha256(original).hexdigest(),
        "sizeBytes": len(original),
    }
    assert path.read_bytes() == original


def test_ordinary_package_directories_and_vendored_license_are_allowed(tmp_path: Path) -> None:
    entries = payload()
    entries.update(
        {
            "imagegen_worker/": b"",
            f"{INFO}/": b"",
            "imagegen_worker/vendor/LICENSE": b"Retained upstream license",
        }
    )
    assert inspect(make_wheel(tmp_path, entries))["distribution"] == "imagegen-worker"


@pytest.mark.parametrize(
    "field,value",
    [
        (b"Metadata-Version: 2.4", b"Metadata-Version: 9.0"),
        (b"Name: ImageGen-Worker", b"Name: other-worker"),
        (b"Version: 0.1.0", b"Version: 0.1.0+cpu"),
        (b"Requires-Python: <3.13,>=3.12", b"Requires-Python: >=3.13"),
        (b"Provides-Extra: inference", b"Provides-Extra: dev"),
        (b"torch==2.7.1", b"torch==2.7.0"),
        (b"extra == 'inference'", b"extra == 'dev'"),
        (b"demo[feature]", b"demo[other]"),
    ],
)
def test_changed_metadata_refuses(tmp_path: Path, field: bytes, value: bytes) -> None:
    entries = payload()
    entries[f"{INFO}/METADATA"] = METADATA.replace(field, value)
    with pytest.raises(wheel_module.WorkerWheelError):
        inspect(make_wheel(tmp_path, entries))


@pytest.mark.parametrize(
    "line",
    [
        b"Name: imagegen-worker\n",
        b"Version: 0.1.0\n",
        b"Requires-Python: >=3.12,<3.13\n",
        b"Provides-Extra: inference\n",
        b"Requires-Dist: pillow==12.2.0\n",
        b"Dynamic: Requires-Dist\n",
    ],
)
def test_duplicate_or_dynamic_metadata_refuses(tmp_path: Path, line: bytes) -> None:
    entries = payload()
    entries[f"{INFO}/METADATA"] = line + METADATA
    with pytest.raises(wheel_module.WorkerWheelError):
        inspect(make_wheel(tmp_path, entries))


@pytest.mark.parametrize(
    "changed",
    [
        PROJECT.replace(b"pillow==12.2.0", b"pillow==12.1.0"),
        PROJECT.replace(b"torch==2.7.1", b"torch==2.7.1+cu126"),
        PROJECT.replace(b'version = "0.1.0"', b'version = "0.2.0"'),
        PROJECT.replace(b">=3.12,<3.13", b">=3.13"),
        PROJECT.replace(b"torch==2.7.1", b"torch>=2.7.1"),
        PROJECT.replace(b"inference =", b"dev ="),
        PROJECT + b"\n[project]\nname='duplicate'\n",
    ],
)
def test_project_drift_or_unsupported_declaration_refuses(tmp_path: Path, changed: bytes) -> None:
    with pytest.raises(wheel_module.WorkerWheelError):
        inspect(make_wheel(tmp_path), changed)


@pytest.mark.parametrize(
    "filename",
    [
        "other_worker-0.1.0-py3-none-any.whl",
        "imagegen_worker-0.1.0+cpu-py3-none-any.whl",
        "imagegen_worker-0.1.0-cp312-cp312-manylinux_2_28_x86_64.whl",
        "imagegen_worker-0.1.0.tar.gz",
    ],
)
def test_wrong_filename_identity_or_abi_refuses(tmp_path: Path, filename: str) -> None:
    with pytest.raises(wheel_module.WorkerWheelError):
        inspect(make_wheel(tmp_path, filename=filename))


def test_target_without_the_worker_tag_refuses(tmp_path: Path) -> None:
    with pytest.raises(wheel_module.WorkerWheelError):
        inspect(make_wheel(tmp_path), tags={Tag("cp312", "cp312", "manylinux_2_28_x86_64")})


@pytest.mark.parametrize(
    "content",
    [
        WHEEL.replace(b"1.0", b"2.0"),
        WHEEL.replace(b"true", b"false"),
        WHEEL.replace(b"py3-none-any", b"cp312-cp312-manylinux_2_28_x86_64"),
        WHEEL + b"Tag: py3-none-any\n",
        b"Root-Is-Purelib: true\nTag: py3-none-any\n",
    ],
)
def test_wheel_metadata_drift_refuses(tmp_path: Path, content: bytes) -> None:
    entries = payload()
    entries[f"{INFO}/WHEEL"] = content
    with pytest.raises(wheel_module.WorkerWheelError):
        inspect(make_wheel(tmp_path, entries))


@pytest.mark.parametrize(
    "name",
    [
        "../outside",
        "/absolute",
        "imagegen_worker/../outside",
        "imagegen_worker//alias.py",
        "imagegen_worker/./alias.py",
        "imagegen_worker\\alias.py",
        "C:/absolute",
        "other-0.1.dist-info/METADATA",
        "imagegen_worker/loader.pth",
        f"{INFO}/direct_url.json",
        "imagegen_worker-0.1.0.data/purelib/loader.py",
    ],
)
def test_unsafe_unexpected_or_editable_members_refuse(tmp_path: Path, name: str) -> None:
    entries = payload()
    entries[name] = b"declared fixture"
    with pytest.raises(wheel_module.WorkerWheelError):
        inspect(make_wheel(tmp_path, entries))


@pytest.mark.parametrize(
    "missing",
    ["imagegen_worker/__init__.py", f"{INFO}/METADATA", f"{INFO}/WHEEL", f"{INFO}/RECORD"],
)
def test_required_members_cannot_be_missing(tmp_path: Path, missing: str) -> None:
    entries = payload()
    del entries[missing]
    with pytest.raises(wheel_module.WorkerWheelError):
        inspect(make_wheel(tmp_path, entries))


def test_duplicate_zip_member_is_not_normalized_away(tmp_path: Path) -> None:
    path = make_wheel(tmp_path)
    with pytest.warns(UserWarning), zipfile.ZipFile(path, "a") as archive:
        archive.writestr("imagegen_worker/__init__.py", b"duplicate")
    with pytest.raises(wheel_module.WorkerWheelError):
        inspect(path)


@pytest.mark.parametrize("second", ["imagegen_worker/conflict/", "imagegen_worker/conflict/a.py"])
def test_file_directory_aliases_and_file_ancestors_refuse(tmp_path: Path, second: str) -> None:
    entries = payload()
    entries["imagegen_worker/conflict"] = b"ordinary file cannot be a directory"
    entries[second] = b"" if second.endswith("/") else b"child"
    with pytest.raises(wheel_module.WorkerWheelError):
        inspect(make_wheel(tmp_path, entries))


@pytest.mark.parametrize("mode", [stat.S_IFLNK | 0o777, stat.S_IFIFO | 0o600, stat.S_IFCHR | 0o600])
def test_symlink_or_special_zip_member_refuses(tmp_path: Path, mode: int) -> None:
    path = make_wheel(tmp_path)
    with zipfile.ZipFile(path, "a") as archive:
        info = zipfile.ZipInfo("imagegen_worker/unsafe")
        info.create_system = 3
        info.external_attr = mode << 16
        archive.writestr(info, b"target")
    with pytest.raises(wheel_module.WorkerWheelError):
        inspect(path)


def test_encrypted_flag_refuses_without_requesting_a_password(tmp_path: Path) -> None:
    path = make_wheel(tmp_path)
    data = bytearray(path.read_bytes())
    local = data.index(b"PK\x03\x04")
    central = data.index(b"PK\x01\x02")
    struct.pack_into("<H", data, local + 6, struct.unpack_from("<H", data, local + 6)[0] | 1)
    struct.pack_into("<H", data, central + 8, struct.unpack_from("<H", data, central + 8)[0] | 1)
    path.write_bytes(data)
    with pytest.raises(wheel_module.WorkerWheelError):
        inspect(path)


def test_corrupt_archive_and_symlink_path_refuse(tmp_path: Path) -> None:
    corrupt = tmp_path / "imagegen_worker-0.1.0-py3-none-any.whl"
    corrupt.write_bytes(b"Not a ZIP")
    with pytest.raises(wheel_module.WorkerWheelError):
        inspect(corrupt)
    other = tmp_path / "other"
    other.mkdir()
    wheel = make_wheel(other)
    corrupt.unlink()
    corrupt.symlink_to(wheel)
    with pytest.raises(wheel_module.WorkerWheelError):
        inspect(corrupt)


def test_declared_and_actual_byte_limits_are_not_unbounded(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Narrow policy constants exercise both compressed and expanded limits using tiny real ZIPs.
    path = make_wheel(tmp_path)
    monkeypatch.setattr(wheel_module, "MAX_ARCHIVE_BYTES", path.stat().st_size - 1)
    with pytest.raises(wheel_module.WorkerWheelError):
        inspect(path)
    monkeypatch.setattr(wheel_module, "MAX_ARCHIVE_BYTES", 64 * 1024 * 1024)
    monkeypatch.setattr(wheel_module, "MAX_MEMBER_BYTES", 5)
    with pytest.raises(wheel_module.WorkerWheelError):
        inspect(path)


def test_metadata_and_entry_count_bounds_are_explicit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = make_wheel(tmp_path)
    monkeypatch.setattr(wheel_module, "MAX_METADATA_BYTES", 10)
    with pytest.raises(wheel_module.WorkerWheelError):
        inspect(path)
    monkeypatch.setattr(wheel_module, "MAX_METADATA_BYTES", 2 * 1024 * 1024)
    monkeypatch.setattr(wheel_module, "MAX_ENTRIES", 3)
    with pytest.raises(wheel_module.WorkerWheelError):
        inspect(path)


def test_equal_byte_inode_replacement_during_inspection_requires_a_fresh_read(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = make_wheel(tmp_path)
    original_metadata = wheel_module._metadata

    def replace_after_metadata(
        data: bytes,
        python: SpecifierSet,
        expected: set[Requirement],
    ) -> None:
        original_metadata(data, python, expected)
        replacement = tmp_path / "replacement.whl"
        replacement.write_bytes(path.read_bytes())
        replacement.replace(path)

    monkeypatch.setattr(wheel_module, "_metadata", replace_after_metadata)
    with pytest.raises(wheel_module.WorkerWheelError, match="changed during inspection"):
        inspect(path)
