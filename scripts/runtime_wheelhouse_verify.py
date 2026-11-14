"""Verify selected local wheel bytes and their actual metadata, without extraction.

Fresh InvokeAI 4875d96531ca6712b288f6e660fcbb34143408c1:
backend/model_hash/model_hash.py _get_hashlib and its ModelOnDisk.hash /
ModelConfigFactory / ModelInstallService._probe callers supply buffered SHA.
scripts/check_platform_locks.py and uv-lock-checks.yml supply parsed wheel
identity/target semantics. Apache-2.0, copyright 2022-2026 InvokeAI Contributors.

Invoke has no strict dependency-wheel ZIP/METADATA verifier. This disclosed
adaptation extends Studio's runtime_worker_wheel ZIP owner to generic wheels,
and reuses imagegen_worker.runtime_dependencies for the dependency verdict.
It never downloads, extracts, installs, imports wheel payloads or signs a release.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import unicodedata
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from email import policy
from email.message import Message
from email.parser import BytesParser
from pathlib import Path
from typing import Any, BinaryIO, cast
from urllib.parse import unquote

from packaging.requirements import Requirement
from packaging.tags import Tag, parse_tag
from packaging.utils import canonicalize_name, parse_wheel_filename
from packaging.version import Version
from runtime_wheelhouse_plan import ENV, PYTHON_VERSION, target_tags

from imagegen_worker.runtime_dependencies import (
    DependencyCheckError,
    DistributionMetadata,
    check_distribution_metadata,
)

MAX_WHEELS = 10_000
MAX_ARCHIVE_BYTES = 4 * 1024**3
MAX_TOTAL_ARCHIVE_BYTES = 32 * 1024**3
MAX_ENTRIES = 100_000
MAX_TOTAL_ENTRIES = 200_000
MAX_CENTRAL_BYTES = 128 * 1024**2
MAX_EXPANDED_BYTES = 16 * 1024**3
MAX_TOTAL_EXPANDED_BYTES = 32 * 1024**3
MAX_MEMBER_BYTES = 8 * 1024**3
MAX_METADATA_BYTES = 2 * 1024**2
MAX_TOTAL_METADATA_BYTES = 16 * 1024**2
MAX_REPORT_BYTES = 2 * 1024**2
HASH_CHUNK_BYTES = 128 * 1024
ZIP_CHUNK_BYTES = 64 * 1024
_DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
_FILE_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC
_TARGET_ENV = {
    **{key: value for key, value in ENV.items() if key != "extra"},
    "platform_release": "igs-unknown-platform-release",
    "platform_version": "igs-unknown-platform-version",
}


class WheelhouseVerificationError(ValueError):
    """Actual bytes or metadata do not satisfy the regenerated finite plan."""


@dataclass
class _Budget:
    entries: int = 0
    expanded: int = 0
    metadata: int = 0


class _BoundedInfoList(list[zipfile.ZipInfo]):
    """Bound the stdlib's actual index, independently of an untrusted EOCD count."""

    def append(self, item: zipfile.ZipInfo) -> None:
        _require(len(self) < MAX_ENTRIES, "Wheel ZIP index entry count exceeds its bound")
        super().append(item)


class _BoundedZipFile(zipfile.ZipFile):
    def _RealGetContents(self) -> None:
        # Pinned CPython appends each parsed ZipInfo before adding NameToInfo.
        # Its EOCD count does not bound that loop: install a bounded container
        # at this private hook without copying or replacing the ZIP parser.
        self.filelist = _BoundedInfoList()
        read_contents = cast("Callable[[], None]", cast("Any", super())._RealGetContents)
        read_contents()


def _require(condition: object, message: str) -> None:
    if not condition:
        raise WheelhouseVerificationError(message)


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


def _directory_fd(path: Path) -> int:
    _require(
        path.is_absolute() and str(path) == os.path.normpath(path),
        "Wheelhouse directory must be absolute and canonical",
    )
    descriptor = os.open("/", _DIRECTORY_FLAGS)
    try:
        for part in path.parts[1:]:
            child = os.open(part, _DIRECTORY_FLAGS, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def _membership(directory: int, expected: set[str]) -> None:
    seen: set[str] = set()
    with os.scandir(directory) as entries:
        for entry in entries:
            _require(entry.name in expected, "Wheelhouse has an extra or partial entry")
            _require(
                stat.S_ISREG(entry.stat(follow_symlinks=False).st_mode),
                "Wheelhouse entries must be ordinary files",
            )
            seen.add(entry.name)
            _require(len(seen) <= MAX_WHEELS, "Wheelhouse entry count exceeds its bound")
    _require(seen == expected, "Wheelhouse is missing selected wheel files")


def _plan(plan: dict[str, Any]) -> tuple[dict[str, str], list[dict[str, Any]]]:
    _require(
        type(plan.get("schemaVersion")) is int
        and plan["schemaVersion"] == 1
        and plan.get("scope") == "linux-nvidia-wheelhouse-plan"
        and plan.get("dependencyPolicy") == "invoke-inference-v1"
        and plan.get("rootExtras") == ["inference"]
        and plan.get("excludedDependencies") == ["notebook"]
        and plan.get("artifactBytesVerified") is False
        and plan.get("dependencyEvidence") == "lock-graph-only"
        and plan.get("installQualified") is False,
        "Unsupported wheelhouse plan or dependency policy",
    )
    raw_target = plan.get("target")
    _require(isinstance(raw_target, dict), "The wheelhouse target must be an object")
    target = cast("dict[str, Any]", raw_target)
    _require(
        set(target) == {"os", "arch", "pythonVersion", "glibcMinimum"}
        and target.get("os") == "linux"
        and target.get("arch") == "x64"
        and target.get("pythonVersion") == PYTHON_VERSION
        and isinstance(target.get("glibcMinimum"), str),
        "Unsupported explicit wheelhouse target",
    )
    checked_target = cast("dict[str, str]", dict(target))
    ranking = {tag: index for index, tag in enumerate(target_tags(checked_target["glibcMinimum"]))}
    raw_values = plan.get("wheels")
    _require(isinstance(raw_values, list), "Wheel descriptors must be a list")
    values = cast("list[object]", raw_values)
    _require(0 < len(values) <= MAX_WHEELS, "Invalid wheel plan count")
    wheels: list[dict[str, Any]] = []
    names: set[str] = set()
    filenames: set[str] = set()
    total = 0
    external = 0
    for value in values:
        _require(isinstance(value, dict), "Wheel descriptor must be an object")
        item = cast("dict[str, Any]", value)
        name, version, filename = (
            item.get("distribution"),
            item.get("version"),
            item.get("filename"),
        )
        _require(
            isinstance(name, str)
            and len(name) <= 128
            and canonicalize_name(name, validate=True) == name
            and isinstance(version, str)
            and len(version) <= 128
            and str(Version(version)) == version
            and isinstance(filename, str)
            and len(filename) <= 255
            and re.fullmatch(r"[A-Za-z0-9_.+-]+\.whl", filename),
            "Invalid canonical wheel identity",
        )
        name, version, filename = cast("str", name), cast("str", version), cast("str", filename)
        distribution, parsed_version, _build, tags = parse_wheel_filename(filename)
        _require(
            distribution == name and str(parsed_version) == version,
            "Wheel filename differs from its locked identity",
        )
        compatible = [(ranking[tag], str(tag)) for tag in tags if tag in ranking]
        _require(
            compatible and item.get("selectedTag") == min(compatible)[1],
            "Selected wheel tag differs from the explicit target",
        )
        _require(item.get("path") == f"wheels/{filename}", "Wheel artifact path differs")
        checksum, size = item.get("sha256"), item.get("sizeBytes")
        _require(
            isinstance(checksum, str)
            and re.fullmatch(r"[a-f0-9]{64}", checksum)
            and type(size) is int
            and 0 < size <= MAX_ARCHIVE_BYTES,
            "Invalid locked wheel hash or archive size",
        )
        size = cast("int", size)
        _require(name not in names and filename not in filenames, "Duplicate wheel identity")
        names.add(name)
        filenames.add(filename)
        total += size
        if item.get("url") is not None:
            external += size
        _require(total <= MAX_TOTAL_ARCHIVE_BYTES, "Wheelhouse archive total exceeds its bound")
        wheels.append(dict(item))
    _require("imagegen-worker" in names, "The locked worker wheel is missing")
    _require(
        type(plan.get("totalWheelBytes")) is int
        and plan["totalWheelBytes"] == total
        and type(plan.get("externalWheelBytes")) is int
        and plan["externalWheelBytes"] == external,
        "Wheelhouse plan byte totals differ",
    )
    return checked_target, sorted(wheels, key=lambda item: str(item["distribution"]))


def _one(message: Message, name: str) -> str:
    values = message.get_all(name, [])
    _require(len(values) == 1, f"Wheel metadata needs exactly one {name}")
    return str(values[0]).strip()


def _message(data: bytes) -> Message:
    _require(0 < len(data) <= MAX_METADATA_BYTES, "Wheel metadata exceeds its bound")
    data.decode("utf-8", errors="strict")
    message = BytesParser(policy=policy.default).parsebytes(data)
    _require(not message.defects and not message.is_multipart(), "Malformed wheel metadata")
    return message


def _metadata(data: bytes, item: dict[str, Any]) -> None:
    message = _message(data)
    _require(
        canonicalize_name(_one(message, "Name"), validate=True) == item["distribution"]
        and _one(message, "Version") == item["version"],
        "Wheel METADATA differs from its locked identity",
    )
    # In prebuilt wheels Dynamic is informational: fields calculated at build
    # time are still authoritative bytes here (PyPA Core Metadata Dynamic).
    # Identity fields cannot be dynamic; no declared dependency is skipped.
    for value in message.get_all("Dynamic", []):
        field = str(value).strip()
        _require(
            re.fullmatch(r"[A-Za-z][A-Za-z0-9-]{0,127}", field)
            and field.lower() not in {"name", "version", "metadata-version"},
            "Invalid Dynamic wheel metadata identity or field name",
        )
    for value in message.get_all("Requires-Dist", []):
        requirement = Requirement(str(value))
        if requirement.marker is None:
            continue

        def known_facts(node: Any) -> None:
            if isinstance(node, list):
                for child in cast("list[Any]", node):
                    known_facts(child)
            elif isinstance(node, tuple):
                operands = cast("tuple[Any, ...]", node)
                for operand in (operands[0], operands[2]):
                    if type(operand).__name__ == "Variable":
                        _require(str(operand) in ENV, f"Unknown target marker fact: {operand}")

        # Standard packaging has no public marker-variable enumeration. Reuse
        # the existing planner's parsed-tree guard; never evaluate host facts.
        known_facts(requirement.marker._markers)  # pyright: ignore[reportPrivateUsage]


def _wheel_metadata(data: bytes, filename_tags: frozenset[Tag]) -> None:
    message = _message(data)
    _require(_one(message, "Wheel-Version") == "1.0", "Unsupported wheel format")
    _require(_one(message, "Root-Is-Purelib") in {"true", "false"}, "Invalid wheel purelib flag")
    _require(not str(message.get_payload()).strip(), "WHEEL metadata must not contain a body")
    tags: set[Tag] = set()
    for value in message.get_all("Tag", []):
        parsed = parse_tag(str(value).strip())
        _require(not tags.intersection(parsed), "Duplicate WHEEL tags")
        tags.update(parsed)
    _require(frozenset(tags) == filename_tags, "WHEEL tags differ from the filename")


def _member(info: zipfile.ZipInfo) -> str:
    name = info.orig_filename
    parts = name.rstrip("/").split("/")
    _require(
        bool(name)
        and len(name) <= 1024
        and "\0" not in name
        and "\\" not in name
        and ":" not in name
        and not name.startswith("/")
        and unicodedata.normalize("NFC", name) == name
        and unquote(name) == name
        and all(part not in {"", ".", ".."} for part in parts),
        "Unsafe or noncanonical wheel ZIP member",
    )
    kind = stat.S_IFMT(info.external_attr >> 16)
    _require(
        kind in {0, stat.S_IFREG, stat.S_IFDIR}
        and (kind != stat.S_IFDIR or info.is_dir())
        and (not info.is_dir() or kind != stat.S_IFREG),
        "Wheel ZIP contains a symlink or special file",
    )
    _require(
        not info.flag_bits & 1 and info.compress_type in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED},
        "Encrypted or unsupported wheel ZIP compression",
    )
    _require(
        0 <= info.file_size <= MAX_MEMBER_BYTES and (not info.is_dir() or info.file_size == 0),
        "Wheel ZIP member is oversized",
    )
    _require(not name.lower().endswith(".egg-link"), "Editable wheel payload is unsupported")
    return name


def _dist_info(members: list[tuple[zipfile.ZipInfo, str]], item: dict[str, Any]) -> str:
    roots = {name.split("/", 1)[0] for _info, name in members}
    info_roots = {root for root in roots if root.endswith(".dist-info")}
    _require(len(info_roots) == 1, "Wheel needs exactly one top-level dist-info identity")
    root = next(iter(info_roots))
    name, separator, version = root.removesuffix(".dist-info").rpartition("-")
    _require(
        separator
        and canonicalize_name(name, validate=True) == item["distribution"]
        and version == item["version"],
        "Wheel dist-info path differs from its locked identity",
    )
    for data_root in (value for value in roots if value.endswith(".data")):
        data_name, separator, data_version = data_root.removesuffix(".data").rpartition("-")
        _require(
            separator
            and canonicalize_name(data_name, validate=True) == item["distribution"]
            and data_version == item["version"],
            "Wheel data path differs from its locked identity",
        )
    _require(
        all(name != f"{root}/direct_url.json" for _info, name in members),
        "Direct-URL wheel provenance is unsupported",
    )
    return root


def _central_preflight(stream: BinaryIO) -> None:
    # Pinned CPython's own EOCD/ZIP64 reader has bounded tail/record reads.
    # Guard counts and central bytes before ZipFile allocates its full index.
    reader = cast("Callable[[BinaryIO], list[Any] | None]", cast("Any", zipfile)._EndRecData)
    end = reader(stream)
    _require(end is not None and len(end) >= 10, "Missing wheel ZIP central directory")
    values = cast("list[Any]", end)
    _require(
        values[1] == values[2] == 0
        and type(values[3]) is int
        and values[3] == values[4]
        and 0 < values[4] <= MAX_ENTRIES
        and type(values[5]) is int
        and 0 < values[5] <= MAX_CENTRAL_BYTES,
        "Wheel ZIP central directory exceeds its bound or spans disks",
    )
    stream.seek(0)


def _archive(stream: BinaryIO, item: dict[str, Any], budget: _Budget) -> tuple[bytes, bytes, int]:
    _central_preflight(stream)
    expanded = 0
    metadata: dict[str, bytes] = {}
    with _BoundedZipFile(stream) as wheel:
        infos = wheel.infolist()
        _require(0 < len(infos) <= MAX_ENTRIES, "Wheel ZIP entry count exceeds its bound")
        budget.entries += len(infos)
        _require(
            budget.entries <= MAX_TOTAL_ENTRIES, "Wheelhouse ZIP entry count exceeds its bound"
        )
        members = [(info, _member(info)) for info in infos]
        paths: dict[str, bool] = {}
        for info, name in members:
            logical = name.rstrip("/")
            _require(logical not in paths, "Duplicate or aliased wheel ZIP member")
            paths[logical] = info.is_dir()
        for _info, name in members:
            parts = name.rstrip("/").split("/")
            for index in range(1, len(parts)):
                _require(
                    paths.get("/".join(parts[:index])) is not False,
                    "Wheel ZIP file cannot be an ancestor directory",
                )
        info_root = _dist_info(members, item)
        required = {f"{info_root}/METADATA", f"{info_root}/WHEEL", f"{info_root}/RECORD"}
        _require(
            all(name in paths and not paths[name] for name in required),
            "Wheel ZIP METADATA, WHEEL or RECORD is missing",
        )
        declared = sum(info.file_size for info in infos)
        _require(
            declared <= MAX_EXPANDED_BYTES
            and budget.expanded + declared <= MAX_TOTAL_EXPANDED_BYTES,
            "Wheel ZIP expanded payload exceeds its bound",
        )
        for info, name in members:
            if info.is_dir():
                continue
            capture = name in {f"{info_root}/METADATA", f"{info_root}/WHEEL"}
            if capture:
                _require(info.file_size <= MAX_METADATA_BYTES, "Wheel metadata exceeds its bound")
            content = bytearray()
            count = 0
            with wheel.open(info) as source:
                for chunk in iter(lambda: source.read(ZIP_CHUNK_BYTES), b""):
                    count += len(chunk)
                    expanded += len(chunk)
                    budget.expanded += len(chunk)
                    _require(
                        count <= MAX_MEMBER_BYTES
                        and expanded <= MAX_EXPANDED_BYTES
                        and budget.expanded <= MAX_TOTAL_EXPANDED_BYTES,
                        "Wheel ZIP expanded payload exceeds its bound",
                    )
                    if capture:
                        budget.metadata += len(chunk)
                        _require(
                            count <= MAX_METADATA_BYTES
                            and budget.metadata <= MAX_TOTAL_METADATA_BYTES,
                            "Wheelhouse metadata exceeds its bound",
                        )
                        content.extend(chunk)
            _require(count == info.file_size, "Wheel ZIP member length differs")
            if capture:
                metadata[name] = bytes(content)
    _require(expanded == declared, "Expanded wheel ZIP total differs")
    core, wheel_metadata = metadata[f"{info_root}/METADATA"], metadata[f"{info_root}/WHEEL"]
    _metadata(core, item)
    _wheel_metadata(wheel_metadata, parse_wheel_filename(item["filename"])[3])
    return core, wheel_metadata, expanded


def verify_wheelhouse(plan: dict[str, Any], wheelhouse: Path) -> dict[str, object]:
    """Verify an existing local wheelhouse against a freshly regenerated plan.

    Caller ownership: obtain the plan from current lock/project/built-worker
    inputs using the existing planner; this function does not authenticate an
    arbitrary JSON document. Unknown cross-target marker facts refuse before
    the existing metadata checker receives a complete explicit environment.
    """
    try:
        target, items = _plan(plan)
        expected = {str(item["filename"]) for item in items}
        directory = _directory_fd(wheelhouse)
        try:
            root_identity = _identity(os.fstat(directory))
            _membership(directory, expected)
            budget = _Budget()
            descriptors: list[DistributionMetadata] = []
            rows: list[dict[str, object]] = []
            identities: dict[str, tuple[int, ...]] = {}
            for item in items:
                filename = str(item["filename"])
                before = os.stat(filename, dir_fd=directory, follow_symlinks=False)
                _require(
                    stat.S_ISREG(before.st_mode) and before.st_size == item["sizeBytes"],
                    "Wheel size differs from its exact locked size",
                )
                descriptor = os.open(filename, _FILE_FLAGS, dir_fd=directory)
                with os.fdopen(descriptor, "rb") as stream:
                    _require(
                        _identity(before) == _identity(os.fstat(stream.fileno())),
                        "Wheel changed before hashing",
                    )
                    digest = hashlib.sha256()
                    buffer = bytearray(HASH_CHUNK_BYTES)
                    view = memoryview(buffer)
                    consumed = 0
                    while count := stream.readinto(view):
                        consumed += count
                        _require(consumed <= item["sizeBytes"], "Wheel grew while hashing")
                        digest.update(view[:count])
                    _require(
                        consumed == item["sizeBytes"] and digest.hexdigest() == item["sha256"],
                        "Wheel SHA-256 or size differs from its lock",
                    )
                    stream.seek(0)
                    core, wheel_metadata, expanded = _archive(stream, item, budget)
                    _require(
                        _identity(before) == _identity(os.fstat(stream.fileno()))
                        and _identity(before)
                        == _identity(os.stat(filename, dir_fd=directory, follow_symlinks=False)),
                        "Wheel changed during verification",
                    )
                identities[filename] = _identity(before)
                descriptors.append(DistributionMetadata(core))
                rows.append(
                    {
                        "distribution": str(item["distribution"]),
                        "version": str(item["version"]),
                        "filename": filename,
                        "sha256": digest.hexdigest(),
                        "sizeBytes": before.st_size,
                        "metadataSha256": hashlib.sha256(core).hexdigest(),
                        "metadataBytes": len(core),
                        "wheelMetadataSha256": hashlib.sha256(wheel_metadata).hexdigest(),
                        "expandedBytes": expanded,
                    }
                )
            dependency_check = check_distribution_metadata(descriptors, _TARGET_ENV)
            _membership(directory, expected)
            _require(
                _identity(os.fstat(directory)) == root_identity
                and _identity(wheelhouse.lstat()) == root_identity
                and all(
                    _identity(os.stat(name, dir_fd=directory, follow_symlinks=False)) == identity
                    for name, identity in identities.items()
                ),
                "Wheelhouse changed before verification completed",
            )
            report: dict[str, object] = {
                "schemaVersion": 1,
                "scope": "linux-nvidia-wheelhouse-verification",
                "artifactBytesVerified": True,
                "dependencyEvidence": "wheel-metadata",
                "installQualified": False,
                "dependencyPolicy": "invoke-inference-v1",
                "target": dict(target),
                "wheelCount": len(items),
                "totalWheelBytes": plan["totalWheelBytes"],
                "totalExpandedBytes": budget.expanded,
                "totalMetadataBytes": budget.metadata,
                "wheels": rows,
                "dependencyCheck": dependency_check,
            }
            _require(
                len(json.dumps(report, sort_keys=True, ensure_ascii=True).encode("utf-8"))
                <= MAX_REPORT_BYTES,
                "Wheelhouse verification report exceeds its bound",
            )
            return report
        finally:
            os.close(directory)
    except WheelhouseVerificationError:
        raise
    except DependencyCheckError as error:
        raise WheelhouseVerificationError(
            f"Wheel METADATA dependency check failed: {error}"
        ) from error
    except Exception as error:
        raise WheelhouseVerificationError("Wheelhouse bytes or ZIP metadata are invalid") from error
