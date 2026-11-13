"""Inspect the built worker used to replace uv.lock's editable root, without extraction.

Fresh Invoke4875 scripts/check_platform_locks.py wheel_filenames/has_wheel and
uv-lock-checks.yml callers supply parsed wheel identity/tag checks. Studio's
offline-runtime-assembly.workerWheelFiles and its assembleOfflineRuntime caller
supply finite ZIP/member bounds. This disclosed producer adaptation additionally
binds static worker metadata to pyproject; it grants no publisher trust and does
not establish the dependency closure of third-party wheels or installed inference.
"""

from __future__ import annotations

import hashlib
import os
import stat
import tomllib
import zipfile
from collections.abc import Collection
from email import policy
from email.message import Message
from email.parser import BytesParser
from pathlib import Path
from typing import cast

from packaging.requirements import Requirement
from packaging.specifiers import SpecifierSet
from packaging.tags import Tag, parse_tag
from packaging.utils import canonicalize_name, parse_wheel_filename
from packaging.version import Version

MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
MAX_PAYLOAD_BYTES = 64 * 1024 * 1024
MAX_MEMBER_BYTES = 16 * 1024 * 1024
MAX_METADATA_BYTES = 2 * 1024 * 1024
MAX_PROJECT_BYTES = 1024 * 1024
MAX_ENTRIES = 5000
WORKER = "imagegen-worker"
WORKER_VERSION = "0.1.0"
PYTHON_VERSION = "3.12.13"


class WorkerWheelError(ValueError):
    """The supplied wheel cannot replace the exact locked editable worker root."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise WorkerWheelError(message)


def _identity(info: os.stat_result) -> tuple[int, ...]:
    return (
        info.st_dev,
        info.st_ino,
        info.st_mode,
        info.st_nlink,
        info.st_size,
        info.st_mtime_ns,
        info.st_ctime_ns,
    )


def _record(value: object) -> dict[str, object]:
    _require(isinstance(value, dict), "Project metadata must be a table")
    table = cast("dict[object, object]", value)
    _require(
        all(isinstance(key, str) for key in table), "Project metadata must be a string-keyed table"
    )
    return cast("dict[str, object]", value)


def _strings(value: object) -> list[str]:
    _require(isinstance(value, list), "Project dependencies must be a list")
    items = cast("list[object]", value)
    _require(
        all(isinstance(item, str) for item in items),
        "Project dependency declarations must be string lists",
    )
    return cast("list[str]", value)


def _requirements(values: list[str]) -> set[Requirement]:
    parsed = [Requirement(value) for value in values]
    for requirement in parsed:
        pins = list(requirement.specifier)
        _require(
            requirement.url is None
            and len(pins) == 1
            and pins[0].operator == "=="
            and "*" not in pins[0].version,
            "Worker dependencies must remain exact version pins",
        )
    result = set(parsed)
    _require(len(result) == len(parsed), "Duplicate worker dependency declarations")
    return result


def _project(project_bytes: bytes) -> tuple[SpecifierSet, set[Requirement]]:
    _require(0 < len(project_bytes) <= MAX_PROJECT_BYTES, "Project metadata is oversized")
    project = _record(tomllib.loads(project_bytes.decode("utf-8")).get("project"))
    _require(
        project.get("name") == WORKER and project.get("version") == WORKER_VERSION,
        "The supported project is imagegen-worker 0.1.0",
    )
    _require(not project.get("dynamic"), "Dynamic worker project metadata is unsupported")
    requires_python = project.get("requires-python")
    _require(isinstance(requires_python, str), "Project requires-python must be explicit")
    python = SpecifierSet(cast("str", requires_python))
    _require(python.contains(PYTHON_VERSION), "Project does not admit the managed Python")
    optional = _record(project.get("optional-dependencies"))
    _require(set(optional) == {"inference"}, "Only the declared inference extra is supported")
    expected = _strings(project.get("dependencies"))[:]
    for value in _strings(optional["inference"]):
        requirement = Requirement(value)
        marker = requirement.marker
        requirement.marker = None
        condition = f"({marker}) and extra == 'inference'" if marker else "extra == 'inference'"
        expected.append(f"{requirement}; {condition}")
    return python, _requirements(expected)


def _one(message: Message, name: str) -> str:
    values = message.get_all(name, [])
    _require(len(values) == 1, f"Worker metadata needs exactly one {name}")
    return str(values[0]).strip()


def _message(data: bytes) -> Message:
    _require(len(data) <= MAX_METADATA_BYTES, "Worker metadata exceeds its byte limit")
    message = BytesParser(policy=policy.default).parsebytes(data)
    _require(not message.defects and not message.is_multipart(), "Malformed worker metadata")
    return message


def _metadata(data: bytes, python: SpecifierSet, expected: set[Requirement]) -> None:
    message = _message(data)
    _require(
        _one(message, "Metadata-Version") in {"2.1", "2.2", "2.3", "2.4", "2.5"},
        "Unsupported worker core metadata version",
    )
    _require(
        canonicalize_name(_one(message, "Name")) == WORKER,
        "Worker METADATA distribution differs from the project",
    )
    _require(_one(message, "Version") == WORKER_VERSION, "Worker METADATA version differs")
    _require(
        SpecifierSet(_one(message, "Requires-Python")) == python,
        "Worker METADATA Python range differs from the project",
    )
    _require(not message.get_all("Dynamic"), "Dynamic wheel metadata is unsupported")
    extras = [canonicalize_name(str(value)) for value in message.get_all("Provides-Extra", [])]
    _require(extras == ["inference"], "Worker METADATA extras differ from the project")
    actual = _requirements([str(value) for value in message.get_all("Requires-Dist", [])])
    _require(actual == expected, "Worker METADATA dependencies differ from the project")


def _wheel_metadata(data: bytes, filename_tags: frozenset[Tag]) -> None:
    message = _message(data)
    _require(_one(message, "Wheel-Version") == "1.0", "Unsupported worker wheel format")
    _require(_one(message, "Root-Is-Purelib") == "true", "Worker wheel must be pure Python")
    _require(not str(message.get_payload()).strip(), "Worker WHEEL must not contain a body")
    values = [str(value).strip() for value in message.get_all("Tag", [])]
    tags: set[Tag] = set()
    for value in values:
        parsed = parse_tag(value)
        _require(not tags.intersection(parsed), "Duplicate worker WHEEL tags")
        tags.update(parsed)
    _require(frozenset(tags) == filename_tags, "Worker WHEEL tags differ from its filename")


def _member(info: zipfile.ZipInfo, dist_info: str) -> str:
    name = info.orig_filename
    parts = name.rstrip("/").split("/")
    _require(
        bool(name)
        and len(name) <= 1024
        and "\0" not in name
        and "\\" not in name
        and not name.startswith("/")
        and ":" not in name
        and all(part not in ("", ".", "..") for part in parts),
        "Unsafe worker ZIP member path",
    )
    _require(
        parts[0] in {"imagegen_worker", dist_info} and (len(parts) > 1 or info.is_dir()),
        "Worker ZIP contains an unexpected top-level payload",
    )
    kind = stat.S_IFMT(info.external_attr >> 16)
    _require(
        kind in {0, stat.S_IFREG, stat.S_IFDIR} and (kind != stat.S_IFDIR or info.is_dir()),
        "Worker ZIP contains a symlink or special file",
    )
    _require(
        not info.flag_bits & 1
        and info.compress_type
        in {
            zipfile.ZIP_STORED,
            zipfile.ZIP_DEFLATED,
        },
        "Encrypted or unsupported worker ZIP member",
    )
    _require(
        not name.lower().endswith((".pth", ".egg-link", "/direct_url.json")),
        "Worker ZIP contains editable or direct-url installation metadata",
    )
    _require(
        0 <= info.file_size <= MAX_MEMBER_BYTES and (not info.is_dir() or info.file_size == 0),
        "Worker ZIP member is oversized",
    )
    return name


def inspect_worker_wheel(
    path: Path,
    project_bytes: bytes,
    target_tags: Collection[Tag],
) -> dict[str, object]:
    """Return exactly the manifest wheel identity after stable bytes/ZIP/metadata checks.

    Requirements use packaging's canonical Requirement/SpecifierSet equality;
    this does not rewrite arbitrary boolean marker expressions. The pinned
    Hatchling output preserves the project's marker grouping.
    """
    try:
        python, expected = _project(project_bytes)
        name, version, _build, filename_tags = parse_wheel_filename(path.name)
        _require(
            str(name) == WORKER and str(version) == str(Version(WORKER_VERSION)),
            "Worker wheel filename identity differs from the project",
        )
        _require(
            filename_tags == frozenset({Tag("py3", "none", "any")})
            and bool(filename_tags.intersection(target_tags)),
            "Worker wheel filename tags do not match the pure worker target",
        )
        absolute = path.absolute()
        _require(absolute.resolve() == absolute, "Worker wheel path contains a symlink")
        before = absolute.lstat()
        _require(
            stat.S_ISREG(before.st_mode) and 0 < before.st_size <= MAX_ARCHIVE_BYTES,
            "Worker wheel must be an ordinary bounded file",
        )
        flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
        descriptor = os.open(absolute, flags)
        with os.fdopen(descriptor, "rb") as stream:
            _require(
                _identity(os.fstat(stream.fileno())) == _identity(before),
                "Worker wheel changed before it was read",
            )
            digest = hashlib.sha256()
            archive_bytes = 0
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                archive_bytes += len(chunk)
                _require(archive_bytes <= MAX_ARCHIVE_BYTES, "Worker archive grew beyond its bound")
                digest.update(chunk)
            _require(archive_bytes == before.st_size, "Worker archive size changed while hashing")
            stream.seek(0)
            dist_info = f"imagegen_worker-{WORKER_VERSION}.dist-info"
            metadata: dict[str, bytes] = {}
            seen: set[str] = set()
            declared = 0
            total = 0
            with zipfile.ZipFile(stream) as wheel:
                infos = wheel.infolist()
                _require(0 < len(infos) <= MAX_ENTRIES, "Worker ZIP entry count exceeds its bound")
                members = [(info, _member(info, dist_info)) for info in infos]
                paths: dict[str, bool] = {}
                for info, member in members:
                    logical = member.rstrip("/")
                    _require(logical not in paths, "Duplicate or aliased worker ZIP member")
                    paths[logical] = info.is_dir()
                for _info, member in members:
                    parts = member.rstrip("/").split("/")
                    for index in range(1, len(parts)):
                        _require(
                            paths.get("/".join(parts[:index])) is not False,
                            "Worker ZIP file cannot be an ancestor directory",
                        )
                for info, member in members:
                    seen.add(member)
                    declared += info.file_size
                    _require(declared <= MAX_PAYLOAD_BYTES, "Worker ZIP payload is oversized")
                    if info.is_dir():
                        continue
                    count = 0
                    is_metadata = member in {f"{dist_info}/METADATA", f"{dist_info}/WHEEL"}
                    content = bytearray()
                    with wheel.open(info) as source:
                        for chunk in iter(lambda: source.read(64 * 1024), b""):
                            count += len(chunk)
                            total += len(chunk)
                            _require(
                                count <= MAX_MEMBER_BYTES and total <= MAX_PAYLOAD_BYTES,
                                "Expanded worker ZIP payload exceeds its bound",
                            )
                            if is_metadata:
                                _require(
                                    count <= MAX_METADATA_BYTES, "Worker metadata is oversized"
                                )
                                content.extend(chunk)
                    _require(count == info.file_size, "Worker ZIP member length differs")
                    if is_metadata:
                        metadata[member] = bytes(content)
            _require(
                {"imagegen_worker/__init__.py", f"{dist_info}/RECORD"}.issubset(seen),
                "Worker ZIP package or RECORD is missing",
            )
            _require(
                set(metadata) == {f"{dist_info}/METADATA", f"{dist_info}/WHEEL"},
                "Worker ZIP METADATA or WHEEL is missing",
            )
            _metadata(metadata[f"{dist_info}/METADATA"], python, expected)
            _wheel_metadata(metadata[f"{dist_info}/WHEEL"], filename_tags)
            _require(
                _identity(os.fstat(stream.fileno())) == _identity(before)
                and _identity(absolute.lstat()) == _identity(before),
                "Worker wheel changed during inspection",
            )
        return {
            "distribution": WORKER,
            "version": WORKER_VERSION,
            "filename": path.name,
            "sha256": digest.hexdigest(),
            "sizeBytes": before.st_size,
        }
    except WorkerWheelError:
        raise
    except Exception as error:
        raise WorkerWheelError("Built worker wheel metadata or archive is invalid") from error
