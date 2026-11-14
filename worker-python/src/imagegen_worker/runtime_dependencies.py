"""Check installed metadata under the fixed Invoke-derived inference policy.

Adapted from InvokeAI 4875d96531ca6712b288f6e660fcbb34143408c1:
scripts/check_platform_locks.py env_for/walk_closure, its uv-lock-checks.yml
caller, and pyproject.toml's global Notebook exclusion. Apache-2.0;
copyright 2022-2026 InvokeAI Contributors. Invoke supplies the graph/extra
semantics and exclusion policy, not this installed-METADATA checker. This
disclosed adaptation uses standard packaging parsers and CPython metadata;
it never imports an inference library, installs a package or rewrites metadata.
"""

from __future__ import annotations

import json
import os
import stat
import sys
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from email import policy
from email.message import Message
from email.parser import BytesParser
from importlib import metadata
from pathlib import Path
from typing import cast

from packaging.markers import default_environment
from packaging.requirements import Requirement
from packaging.specifiers import SpecifierSet
from packaging.utils import canonicalize_name
from packaging.version import Version

POLICY = "invoke-inference-v1"
ROOT = "imagegen-worker"
ROOT_EXTRA = "inference"
EXCLUDED = frozenset({"notebook"})
MAX_DISTRIBUTIONS = 10_000
MAX_METADATA_BYTES = 2 * 1024 * 1024
MAX_TOTAL_METADATA_BYTES = 16 * 1024 * 1024
MAX_REQUIREMENTS = 100_000
MAX_VISITED_EDGES = 100_000
MAX_TEXT = 4096
MAX_EXEMPTIONS = 1000
MAX_REPORT_BYTES = 1024 * 1024
_CORE_VERSIONS = frozenset({"1.0", "1.1", "1.2", "2.1", "2.2", "2.3", "2.4", "2.5"})
_ENVIRONMENT_KEYS = frozenset(default_environment())
_DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
_FILE_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC


class DependencyCheckError(ValueError):
    """The installed environment does not satisfy the exact fixed policy."""


@dataclass(frozen=True)
class DistributionMetadata:
    """Raw installed Core Metadata, retained for duplicate and size validation."""

    metadata: bytes


@dataclass(frozen=True)
class _Requirement:
    original: str
    requirement: Requirement


@dataclass(frozen=True)
class _Distribution:
    name: str
    version: Version
    extras: frozenset[str]
    requirements: tuple[_Requirement, ...]


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise DependencyCheckError(message)


def _text(value: str, label: str) -> str:
    _require(
        0 < len(value) <= MAX_TEXT
        and not any(ord(character) < 32 or ord(character) == 127 for character in value),
        f"Invalid or oversized {label}",
    )
    return value


def _values(message: Message, field: str) -> tuple[str, ...]:
    values = cast("list[object]", message.get_all(field, []))
    return tuple(_text(str(value).strip(), field) for value in values)


def _one(message: Message, field: str) -> str:
    values = _values(message, field)
    _require(len(values) == 1, f"Metadata needs exactly one {field}")
    return values[0]


def _parse(data: bytes, python_version: str) -> _Distribution:
    _require(0 < len(data) <= MAX_METADATA_BYTES, "Distribution metadata exceeds its bound")
    try:
        data.decode("utf-8", errors="strict")
        message = BytesParser(policy=policy.default).parsebytes(data)
        _require(not message.defects and not message.is_multipart(), "Malformed Core Metadata")
        _require(_one(message, "Metadata-Version") in _CORE_VERSIONS, "Unsupported Core Metadata")
        name = canonicalize_name(_one(message, "Name"), validate=True)
        _require(len(name) <= 256, "Distribution name exceeds its bound")
        version = Version(_one(message, "Version"))
        python_ranges = _values(message, "Requires-Python")
        _require(len(python_ranges) <= 1, "Duplicate Requires-Python metadata")
        if python_ranges:
            _require(
                SpecifierSet(python_ranges[0]).contains(python_version),
                f"Installed distribution {name} excludes the executing Python",
            )
        declared_extras = tuple(
            canonicalize_name(value, validate=True) for value in _values(message, "Provides-Extra")
        )
        _require(len(set(declared_extras)) == len(declared_extras), "Duplicate normalized extra")
        requirements = tuple(
            _Requirement(value, Requirement(value)) for value in _values(message, "Requires-Dist")
        )
        return _Distribution(name, version, frozenset(declared_extras), requirements)
    except DependencyCheckError:
        raise
    except (ValueError, UnicodeError, TypeError) as error:
        raise DependencyCheckError("Invalid installed distribution metadata") from error


def _environment(environment: Mapping[str, str]) -> dict[str, str]:
    _require(
        set(environment) == set(_ENVIRONMENT_KEYS), "Incomplete or unsupported marker environment"
    )
    result = dict(environment)
    for value in result.values():
        _text(value, "marker environment value")
    try:
        python = Version(result["python_full_version"])
    except ValueError as error:
        raise DependencyCheckError("Invalid executing Python version") from error
    _require(
        result["python_version"] == f"{python.major}.{python.minor}",
        "Inconsistent executing Python versions",
    )
    return result


def _active(requirement: Requirement, environment: Mapping[str, str], extra: str) -> bool:
    if requirement.marker is None:
        return True
    try:
        # Core Metadata's extra belongs to this distribution, not the root's extra.
        return requirement.marker.evaluate({**environment, "extra": extra}, context="metadata")
    except (ValueError, KeyError, TypeError) as error:
        raise DependencyCheckError("Unsupported or invalid dependency marker") from error


def _serialized(report: dict[str, object]) -> str:
    result = json.dumps(report, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    _require(
        len(result.encode("utf-8")) + 1 <= MAX_REPORT_BYTES,
        "Dependency report exceeds its bound",
    )
    return result


def check_distribution_metadata(
    distributions: Iterable[DistributionMetadata], environment: Mapping[str, str]
) -> dict[str, object]:
    """Check all base dependencies and the recursively activated inference extras.

    Every installed distribution is a base seed, as in an environment-wide
    dependency check. Invoke's separate (package, extra) visitation keeps an
    extra requested after plain visitation from silently losing its edges.
    Only an active Notebook dependency is exempt; active direct URLs, all other
    missing/version-incompatible dependencies and unknown requested extras fail.
    """
    executing = _environment(environment)
    packages: dict[str, _Distribution] = {}
    total_bytes = 0
    total_requirements = 0
    for descriptor in distributions:
        _require(len(packages) < MAX_DISTRIBUTIONS, "Too many installed distributions")
        data = descriptor.metadata
        _require(isinstance(cast("object", data), bytes), "Metadata descriptor must contain bytes")
        total_bytes += len(data)
        _require(total_bytes <= MAX_TOTAL_METADATA_BYTES, "Total metadata exceeds its bound")
        package = _parse(data, executing["python_full_version"])
        _require(package.name not in packages, "Duplicate normalized installed distribution")
        _require(package.name not in EXCLUDED, "Excluded Notebook distribution is installed")
        total_requirements += len(package.requirements)
        _require(total_requirements <= MAX_REQUIREMENTS, "Too many dependency declarations")
        packages[package.name] = package
    _require(ROOT in packages, "Installed worker distribution is missing")
    _require(ROOT_EXTRA in packages[ROOT].extras, "Installed worker inference extra is missing")

    pending = [(name, "") for name in sorted(packages, reverse=True)]
    pending.append((ROOT, ROOT_EXTRA))
    seen: set[tuple[str, str]] = set()
    checked: set[tuple[str, str]] = set()
    exemptions: set[tuple[str, str]] = set()
    visited_edges = 0
    while pending:
        name, extra = pending.pop()
        if (name, extra) in seen:
            continue
        seen.add((name, extra))
        package = packages[name]
        _require(not extra or extra in package.extras, f"Unknown requested extra of {name}")
        for declaration in package.requirements:
            visited_edges += 1
            _require(visited_edges <= MAX_VISITED_EDGES, "Dependency traversal exceeds its bound")
            requirement = declaration.requirement
            if not _active(requirement, executing, extra):
                continue
            checked.add((name, declaration.original))
            _require(requirement.url is None, "Active direct-URL dependency is unsupported")
            dependency = canonicalize_name(requirement.name)
            if dependency in EXCLUDED:
                exemptions.add((name, declaration.original))
                _require(len(exemptions) <= MAX_EXEMPTIONS, "Too many Notebook exemptions")
                continue
            _require(
                dependency in packages, f"Missing installed dependency of {name}: {dependency}"
            )
            selected = packages[dependency]
            _require(
                requirement.specifier.contains(selected.version),
                f"Incompatible installed dependency of {name}: {dependency}",
            )
            for requested_extra in sorted(requirement.extras, reverse=True):
                normalized_extra = canonicalize_name(requested_extra, validate=True)
                _require(
                    normalized_extra in selected.extras,
                    f"Unknown requested extra of {dependency}",
                )
                pending.append((dependency, normalized_extra))

    exempted: list[dict[str, str]] = [
        {"distribution": distribution, "dependency": "notebook", "requirement": requirement}
        for distribution, requirement in sorted(exemptions)
    ]
    report: dict[str, object] = {
        "schemaVersion": 1,
        "policy": POLICY,
        "root": ROOT,
        "rootExtras": [ROOT_EXTRA],
        "excludedDependencies": sorted(EXCLUDED),
        "packageCount": len(packages),
        "checkedRequirements": len(checked),
        "exemptedRequirements": exempted,
        "pythonVersion": executing["python_full_version"],
        "status": "ok",
    }
    _serialized(report)
    return report


def _directory_fd(path: Path) -> int:
    _require(path.is_absolute() and path == Path(os.path.normpath(path)), "Invalid metadata root")
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


def _identity(info: os.stat_result) -> tuple[int, ...]:
    return (
        info.st_dev,
        info.st_ino,
        info.st_mode,
        info.st_size,
        info.st_mtime_ns,
        info.st_ctime_ns,
    )


def _installed_metadata(distribution: metadata.Distribution, remaining: int) -> bytes:
    _require(isinstance(distribution, metadata.PathDistribution), "Unsupported metadata provider")
    # CPython 3.12's public read_text has no bounded-read API. The release uses
    # its pinned PathDistribution filesystem path; zip/egg/custom providers fail.
    ordinary = cast("metadata.PathDistribution", distribution)
    metadata_root: object = ordinary._path  # pyright: ignore[reportPrivateUsage]
    _require(isinstance(metadata_root, Path), "Installed metadata must use ordinary directories")
    root = cast("Path", metadata_root)
    _require(root.name.endswith(".dist-info"), "Legacy installed metadata is unsupported")
    root = root.absolute()
    parent = _directory_fd(root)
    try:
        descriptor = os.open("METADATA", _FILE_FLAGS, dir_fd=parent)
        with os.fdopen(descriptor, "rb") as stream:
            before = os.fstat(stream.fileno())
            bound = min(MAX_METADATA_BYTES, remaining)
            _require(
                stat.S_ISREG(before.st_mode) and 0 < before.st_size <= bound,
                "Installed METADATA is not an ordinary bounded file",
            )
            data = stream.read(bound + 1)
            _require(len(data) == before.st_size, "Installed METADATA length changed")
            _require(
                _identity(before) == _identity(os.fstat(stream.fileno()))
                and _identity(before)
                == _identity(os.stat("METADATA", dir_fd=parent, follow_symlinks=False)),
                "Installed METADATA changed while reading",
            )
            return data
    finally:
        os.close(parent)


def collect_distribution_metadata(
    distributions: Iterable[metadata.Distribution] | None = None,
) -> tuple[DistributionMetadata, ...]:
    """Read ordinary installed .dist-info files without importing their packages."""
    selected = metadata.distributions() if distributions is None else distributions
    result: list[DistributionMetadata] = []
    total = 0
    try:
        for distribution in selected:
            _require(len(result) < MAX_DISTRIBUTIONS, "Too many installed distributions")
            data = _installed_metadata(distribution, MAX_TOTAL_METADATA_BYTES - total)
            total += len(data)
            result.append(DistributionMetadata(data))
    except OSError as error:
        raise DependencyCheckError("Installed metadata is unavailable or not ordinary") from error
    return tuple(result)


def main(arguments: Sequence[str] | None = None) -> int:
    selected = sys.argv[1:] if arguments is None else arguments
    try:
        _require(not selected, "Dependency policy accepts no command-line overrides")
        executing = cast("Mapping[str, str]", default_environment())
        report = check_distribution_metadata(collect_distribution_metadata(), executing)
        print(_serialized(report))
        return 0
    except (DependencyCheckError, ValueError, OSError) as error:
        print(
            _serialized(
                {"schemaVersion": 1, "policy": POLICY, "status": "error", "message": str(error)}
            )
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
