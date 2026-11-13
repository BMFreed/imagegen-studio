"""A lock-graph wheel plan, not a downloaded/installed Linux/NVIDIA release.

Adapted from InvokeAI 4875d96531ca6712b288f6e660fcbb34143408c1,
scripts/check_platform_locks.py (Lock.resolve, walk_closure, check_closure),
called by .github/workflows/uv-lock-checks.yml. Apache-2.0;
Copyright 2022-2026 InvokeAI Contributors.

Studio additions (disclosed before implementation): exact target tags, strict
input/graph/artifact identities, project consistency and built-root replacement.
No downloads, wheel-byte verification, METADATA closure repair or signing occur.
One best target-tag artifact is required per distribution; equal-rank ambiguity
refuses instead of choosing an arbitrary build. Unqualified linux_x86_64 tags
remain candidates, not measured evidence of the declared minimum libc.
"""

from __future__ import annotations

import hashlib
import json
import re
import tomllib
from collections.abc import Mapping
from typing import Any, cast
from urllib.parse import unquote, urlsplit

from packaging.markers import Marker
from packaging.requirements import Requirement
from packaging.specifiers import SpecifierSet
from packaging.tags import Tag, compatible_tags, cpython_tags
from packaging.utils import canonicalize_name, parse_wheel_filename
from packaging.version import Version

ROOT_NAME = "imagegen-worker"
PYTHON_VERSION = "3.12.13"
MAX_INPUT_BYTES = 8 * 1024 * 1024
MAX_PACKAGES = 10_000
MAX_EDGES = 100_000
MAX_SAFE_BYTES = 2**53 - 1
ENV = {
    "implementation_name": "cpython",
    "implementation_version": PYTHON_VERSION,
    "os_name": "posix",
    "platform_machine": "x86_64",
    "platform_python_implementation": "CPython",
    "platform_system": "Linux",
    "python_full_version": PYTHON_VERSION,
    "python_version": "3.12",
    "sys_platform": "linux",
    "extra": "",
}


class WheelhousePlanError(ValueError):
    """A missing or unsupported fact cannot silently shrink the candidate plan."""


def _require(condition: object, message: str) -> None:
    if not condition:
        raise WheelhousePlanError(message)


def _table(value: object, label: str) -> dict[str, Any]:
    _require(isinstance(value, dict), f"{label} must be a table")
    return dict(cast(dict[str, Any], value))


def _array(value: object, label: str) -> list[Any]:
    _require(isinstance(value, list), f"{label} must be an array")
    return list(cast(list[Any], value))


def _name(value: object) -> str:
    _require(
        isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", value),
        "Distribution/extra names must be finite identifiers",
    )
    return canonicalize_name(str(value))


def _version(value: object) -> str:
    _require(
        isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.!+_-]{0,127}", value),
        "Exact version is required",
    )
    try:
        parsed = Version(str(value))
    except ValueError as error:
        raise WheelhousePlanError("Invalid exact version") from error
    _require(
        str(parsed) == value, "Lock versions must use canonical spelling without losing local tags"
    )
    return str(value)


def _size(value: object) -> int:
    _require(type(value) is int and 0 < value <= MAX_SAFE_BYTES, "Invalid exact wheel size")
    return cast(int, value)


def _sha256(value: object) -> str:
    _require(
        isinstance(value, str) and re.fullmatch(r"[a-f0-9]{64}", value),
        "Wheel SHA-256 must be explicit",
    )
    return str(value)


def _document(raw: bytes, label: str) -> dict[str, Any]:
    _require(type(raw) is bytes and 0 < len(raw) <= MAX_INPUT_BYTES, f"Invalid {label} bytes")
    try:
        return tomllib.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as error:
        raise WheelhousePlanError(f"Invalid {label} TOML") from error


def _marker(value: object, *, extra: str = "") -> bool:
    if value is None:
        return True
    _require(isinstance(value, str) and len(value) <= 4096, "Invalid marker")
    _require(
        not re.search(r"\bextra-\d+-", str(value)),
        "Conflicting-extra marker tokens are outside this producer",
    )
    try:
        marker = Marker(str(value))

        # packaging fills absent variables from the running host. Inspect its parsed
        # variables first: never let platform_release/version leak into this target.
        def validate(node: Any) -> None:
            if isinstance(node, list):
                for child in cast(list[Any], node):
                    validate(child)
            elif isinstance(node, tuple):
                for operand in (cast(tuple[Any, ...], node)[0], cast(tuple[Any, ...], node)[2]):
                    if type(operand).__name__ == "Variable":
                        _require(str(operand) in ENV, f"Unknown target marker fact: {operand}")

        # Pinned packaging has no public variable enumeration; inspect only its parsed tree.
        validate(marker._markers)  # pyright: ignore[reportPrivateUsage]
        return marker.evaluate({**ENV, "extra": extra})
    except WheelhousePlanError:
        raise
    except (ValueError, KeyError) as error:
        raise WheelhousePlanError("Unsupported environment marker") from error


def _https_url(value: object) -> tuple[str, str]:
    _require(isinstance(value, str) and 0 < len(value) <= 4096, "Artifact URL is required")
    text = str(value)
    _require(not re.search(r"[\s\\\x00-\x1f\x7f]", text), "Unsafe URL characters")
    try:
        parsed = urlsplit(text)
        _require(
            parsed.scheme == "https" and parsed.hostname and parsed.netloc,
            "Artifact sources must use HTTPS",
        )
        _require(
            parsed.username is None
            and parsed.password is None
            and not parsed.fragment
            and not parsed.query
            and parsed.port in (None, 443),
            "Unsupported artifact URL",
        )
    except ValueError as error:
        raise WheelhousePlanError("Invalid artifact URL") from error
    _require(not re.search(r"%(?:2f|5c|00)", parsed.path, re.IGNORECASE), "Encoded URL separator")
    path = unquote(parsed.path)
    _require(
        not re.search(r"[%\\\x00-\x1f\x7f]", path)
        and all(part not in (".", "..") for part in path.split("/")),
        "Unsafe URL path",
    )
    return text, path.rsplit("/", 1)[-1]


def target_tags(glibc: str) -> tuple[Tag, ...]:
    """Explicit CPython312/glibc target; never ask sys_tags() about the build host."""
    _require(
        isinstance(cast(object, glibc), str) and re.fullmatch(r"2\.[1-9]\d", glibc),
        "Target glibc must be an explicit 2.MIN version",
    )
    minor = int(glibc.split(".")[1])
    _require(17 <= minor <= 99, "Target glibc is outside the planner's 2.17..2.99 bounds")
    platforms: list[str] = []
    # PEP600 canonical targets and their legacy spellings, in ABI preference order.
    for compatible_minor in range(minor, 4, -1):
        platforms.append(f"manylinux_2_{compatible_minor}_x86_64")
        if compatible_minor in (17, 12, 5):
            legacy = {17: "manylinux2014", 12: "manylinux2010", 5: "manylinux1"}[compatible_minor]
            platforms.append(f"{legacy}_x86_64")
    # This tag has no independently measured minimum libc. It remains a candidate,
    # not evidence that the producer's declared ABI floor was qualified.
    platforms.append("linux_x86_64")
    tags = [
        *cpython_tags((3, 12), abis=["cp312"], platforms=platforms),
        *compatible_tags((3, 12), interpreter="cp312", platforms=platforms),
    ]
    return tuple(dict.fromkeys(tags))


def _source(value: object, *, root: bool = False) -> dict[str, str]:
    source = _table(value, "Package source")
    if root:
        _require(source == {"editable": "."}, "Only the local worker root may be editable")
    else:
        _require(set(source) == {"registry"}, "Runtime dependencies must be registry wheels")
        _https_url(source["registry"])
    return source


def _identity(package: Mapping[str, Any]) -> tuple[str, str, str]:
    return (
        _name(package.get("name")),
        _version(package.get("version")),
        json.dumps(package.get("source"), sort_keys=True, separators=(",", ":")),
    )


class _Lock:
    """Invoke Lock.resolve, tightened for duplicate/ambiguous producer identities."""

    def __init__(self, data: dict[str, Any]) -> None:
        self.packages: dict[tuple[str, str, str], dict[str, Any]] = {}
        self.by_name: dict[str, list[dict[str, Any]]] = {}
        packages = _array(data.get("package"), "Lock packages")
        _require(0 < len(packages) <= MAX_PACKAGES, "Invalid lock package count")
        for raw in packages:
            package = _table(raw, "Lock package")
            name = _name(package.get("name"))
            package["source"] = _source(package.get("source"), root=name == ROOT_NAME)
            identity = _identity(package)
            _require(identity not in self.packages, "Duplicate normalized lock package identity")
            self.packages[identity] = package
            self.by_name.setdefault(name, []).append(package)

    def resolve(self, edge: dict[str, Any]) -> dict[str, Any]:
        name = _name(edge.get("name"))
        if "version" in edge:
            _require("source" in edge, "Versioned dependency edges require their exact source")
            identity = (
                name,
                _version(edge["version"]),
                json.dumps(_source(edge["source"]), sort_keys=True, separators=(",", ":")),
            )
            candidates = [self.packages[identity]] if identity in self.packages else []
        else:
            _require("source" not in edge, "Source-only dependency edges are unsupported")
            candidates = self.by_name.get(name, [])
        _require(len(candidates) == 1, f"Unresolved or ambiguous dependency: {name}")
        package = candidates[0]
        markers = _array(package.get("resolution-markers", []), "Package resolution markers")
        matching = [_marker(marker) for marker in markers]
        _require(not matching or any(matching), "Active edge selects a package outside its fork")
        if "requires-python" in package:
            _require(
                SpecifierSet(str(package["requires-python"])).contains(PYTHON_VERSION),
                "Selected package does not admit the target Python",
            )
        return package


def _edges(value: object) -> list[dict[str, Any]]:
    return [_table(item, "Dependency edge") for item in _array(value, "Dependencies")]


def _extras(value: object) -> tuple[str, ...]:
    entries = _array(value, "Requested extras")
    extras = tuple(_name(item) for item in entries)
    _require(len(extras) == len(set(extras)), "Duplicate normalized extras")
    return extras


def _walk(
    lock: _Lock, root: dict[str, Any]
) -> tuple[dict[str, dict[str, Any]], dict[str, set[str]]]:
    """Invoke walk_closure: package and package/extra visitation are independent."""
    seen = {ROOT_NAME: root}
    extras: dict[str, set[str]] = {ROOT_NAME: {"inference"}}
    seen_extras: set[tuple[tuple[str, str, str], str]] = set()
    optional = _table(root.get("optional-dependencies"), "Worker optional dependencies")
    _require("inference" in optional, "Worker inference extra is missing from the lock")
    _require(_edges(optional["inference"]), "Worker inference extra cannot be empty")
    pending = _edges(root.get("dependencies", [])) + _edges(optional["inference"])
    visited_edges = 0
    while pending:
        visited_edges += 1
        _require(visited_edges <= MAX_EDGES, "Dependency closure exceeds its finite bound")
        edge = pending.pop()
        if not _marker(edge.get("marker")):
            continue
        package = lock.resolve(edge)
        name = _name(package["name"])
        if name in seen:
            _require(
                _identity(seen[name]) == _identity(package),
                f"Conflicting runtime identities for {name}",
            )
        else:
            seen[name] = package
            pending += _edges(package.get("dependencies", []))
        requested = _extras(edge.get("extra", []))
        extras.setdefault(name, set()).update(requested)
        groups = _table(package.get("optional-dependencies", {}), "Package optional dependencies")
        normalized_groups = {_name(key): value for key, value in groups.items()}
        _require(len(normalized_groups) == len(groups), "Duplicate normalized optional groups")
        for extra in requested:
            _require(extra in normalized_groups, f"Requested extra does not exist: {name}[{extra}]")
            identity = (_identity(package), extra)
            if identity not in seen_extras:
                seen_extras.add(identity)
                pending += _edges(normalized_groups[extra])
    return seen, extras


def _pin(specifier: object) -> str:
    _require(isinstance(specifier, str), "A direct dependency must have an exact pin")
    spec = SpecifierSet(str(specifier))
    values = list(spec)
    _require(
        len(values) == 1 and values[0].operator == "==" and "*" not in values[0].version,
        "Direct worker requirements must be exact == pins",
    )
    return _version(values[0].version)


def _project_pins(values: object, *, extra: str) -> dict[str, tuple[str, tuple[str, ...]]]:
    result: dict[str, tuple[str, tuple[str, ...]]] = {}
    for text in _array(values, "Project requirements"):
        _require(isinstance(text, str), "Project requirements must be strings")
        requirement = Requirement(str(text))
        _require(requirement.url is None, "Direct worker requirements cannot select URLs")
        if not _marker(str(requirement.marker) if requirement.marker else None, extra=extra):
            continue
        name = _name(requirement.name)
        _require(name not in result, "Duplicate normalized project requirement")
        result[name] = (
            _pin(str(requirement.specifier)),
            tuple(sorted(_name(x) for x in requirement.extras)),
        )
    return result


def _check_project(
    lock: _Lock, root: dict[str, Any], project_data: dict[str, Any], excluded: list[str]
) -> None:
    project = _table(project_data.get("project"), "Project metadata")
    _require(
        _name(project.get("name")) == ROOT_NAME
        and _version(project.get("version")) == root["version"],
        "Project/lock root identity drift",
    )
    _require(
        isinstance(project.get("requires-python"), str)
        and project["requires-python"]
        and SpecifierSet(project["requires-python"]).contains(PYTHON_VERSION),
        "Project does not admit the exact release Python",
    )
    optional = _table(project.get("optional-dependencies"), "Project optional dependencies")
    _require("inference" in optional, "Project inference extra is missing")
    locked_optional = _table(root.get("optional-dependencies"), "Lock root optional dependencies")
    groups = [
        (_project_pins(project.get("dependencies", []), extra=""), root.get("dependencies", [])),
        (
            _project_pins(optional["inference"], extra="inference"),
            locked_optional.get("inference", []),
        ),
    ]
    expected: dict[str, tuple[str, tuple[str, ...]]] = {}
    for pins, edges in groups:
        actual: dict[str, tuple[str, tuple[str, ...]]] = {}
        for edge in _edges(edges):
            if _marker(edge.get("marker")):
                package = lock.resolve(edge)
                name = _name(package["name"])
                pin = (package["version"], tuple(sorted(_extras(edge.get("extra", [])))))
                _require(name not in actual or actual[name] == pin, "Conflicting direct lock edges")
                actual[name] = pin
        _require(actual == pins, "Project direct pins disagree with selected lock edges")
        for name, pin in pins.items():
            _require(name not in expected or expected[name] == pin, "Conflicting project groups")
            expected[name] = pin
    metadata = _table(root.get("metadata"), "Root lock metadata")
    _require(
        "inference" in _array(metadata.get("provides-extras"), "Lock provided extras"),
        "Lock metadata does not provide inference",
    )
    recorded: dict[str, tuple[str, tuple[str, ...]]] = {}
    for raw in _array(metadata.get("requires-dist"), "Lock root requirements"):
        item = _table(raw, "Lock root requirement")
        if not any(_marker(item.get("marker"), extra=extra) for extra in ("", "inference")):
            continue
        name = _name(item.get("name"))
        pin = (_pin(item.get("specifier")), tuple(sorted(_extras(item.get("extras", [])))))
        _require(
            name not in recorded or recorded[name] == pin, "Conflicting lock requirement metadata"
        )
        recorded[name] = pin
    _require(recorded == expected, "Project and lock requirement metadata drift")
    uv = _table(_table(project_data.get("tool", {}), "Project tool").get("uv", {}), "Project uv")
    _require(
        set(uv) <= {"exclude-dependencies"}, "Unsupported uv source/override/resolution setting"
    )
    project_excluded = sorted(_extras(uv.get("exclude-dependencies", [])))
    _require(project_excluded == excluded, "Project/lock dependency exclusions drift")


def _choose(package: dict[str, Any], ranking: dict[Tag, int]) -> dict[str, Any]:
    candidates: list[tuple[int, str, dict[str, Any]]] = []
    name, version, _ = _identity(package)
    for raw in _array(package.get("wheels", []), "Package wheels"):
        wheel = _table(raw, "Wheel artifact")
        url, filename = _https_url(wheel.get("url"))
        _require(
            len(filename) <= 255 and re.fullmatch(r"[A-Za-z0-9_.+-]+\.whl", filename),
            "Unsafe wheel filename",
        )
        distribution, wheel_version, _build, tags = parse_wheel_filename(filename)
        _require(
            distribution == name and str(wheel_version) == version,
            "Wheel filename identity disagrees with lock package",
        )
        digest = wheel.get("hash")
        _require(isinstance(digest, str) and digest.startswith("sha256:"), "Missing locked SHA-256")
        checksum, size = _sha256(str(digest)[7:]), _size(wheel.get("size"))
        compatible = [(ranking[tag], str(tag)) for tag in tags if tag in ranking]
        if compatible:
            rank, selected_tag = min(compatible)
            candidates.append(
                (
                    rank,
                    filename,
                    {
                        "distribution": name,
                        "version": version,
                        "filename": filename,
                        "path": f"wheels/{filename}",
                        "url": url,
                        "sha256": checksum,
                        "sizeBytes": size,
                        "selectedTag": selected_tag,
                        "source": dict(package["source"]),
                    },
                )
            )
    _require(candidates, f"No compatible locked wheel for {name}=={version}; no sdist fallback")
    candidates.sort(key=lambda candidate: (candidate[0], candidate[1]))
    best = [candidate for candidate in candidates if candidate[0] == candidates[0][0]]
    _require(len(best) == 1, f"Ambiguous equally preferred wheel artifacts for {name}")
    return best[0][2]


def _worker(
    descriptor: Mapping[str, object], root: dict[str, Any], ranking: dict[Tag, int]
) -> dict[str, Any]:
    _require(
        isinstance(cast(object, descriptor), Mapping)
        and set(descriptor) == {"distribution", "version", "filename", "sha256", "sizeBytes"},
        "Invalid built worker descriptor",
    )
    _require(
        _name(descriptor["distribution"]) == ROOT_NAME
        and _version(descriptor["version"]) == root["version"],
        "Built worker identity disagrees with lock",
    )
    filename = descriptor["filename"]
    _require(
        isinstance(filename, str)
        and len(filename) <= 255
        and re.fullmatch(r"[A-Za-z0-9_.+-]+\.whl", filename),
        "Unsafe built worker filename",
    )
    name, version, _build, tags = parse_wheel_filename(str(filename))
    _require(
        name == ROOT_NAME and str(version) == root["version"], "Built worker wheel identity drift"
    )
    compatible = [(ranking[tag], str(tag)) for tag in tags if tag in ranking]
    _require(compatible, "Built worker wheel cannot run on the release target")
    return {
        "distribution": ROOT_NAME,
        "version": root["version"],
        "filename": filename,
        "path": f"wheels/{filename}",
        "url": None,
        "sha256": _sha256(descriptor["sha256"]),
        "sizeBytes": _size(descriptor["sizeBytes"]),
        "selectedTag": min(compatible)[1],
        "source": dict(root["source"]),
    }


def plan_wheelhouse(
    lock_bytes: bytes, project_bytes: bytes, *, glibc: str, worker_wheel: Mapping[str, object]
) -> dict[str, Any]:
    """Return a deterministic candidate from lock facts; no external artifact bytes are verified."""
    try:
        data, project = _document(lock_bytes, "lock"), _document(project_bytes, "project")
        _require(
            type(data.get("version")) is int
            and data["version"] == 1
            and type(data.get("revision")) is int
            and data["revision"] == 3,
            "Unsupported uv lock schema",
        )
        _require(
            "conflicts" not in data
            or (isinstance(data["conflicts"], list) and not data["conflicts"]),
            "Conflicting-extra lock universes are outside this producer",
        )
        _require(
            isinstance(data.get("requires-python"), str)
            and data["requires-python"]
            and SpecifierSet(data["requires-python"]).contains(PYTHON_VERSION),
            "Lock does not admit the exact release Python",
        )
        supported = _array(data.get("supported-markers", []), "Supported platform markers")
        matching = [_marker(item) for item in supported]
        _require(not matching or any(matching), "Lock excludes the release target")
        for marker in _array(data.get("resolution-markers", []), "Lock resolution markers"):
            _marker(marker)  # Validate target facts even when the fork is inactive.
        manifest = _table(data.get("manifest", {}), "Lock manifest")
        _require(
            set(manifest) <= {"excludes"} and ("options" not in data or data["options"] == {}),
            "Unsupported lock overrides/resolution options",
        )
        excluded = sorted(_extras(manifest.get("excludes", [])))
        lock = _Lock(data)
        roots = lock.by_name.get(ROOT_NAME, [])
        _require(len(roots) == 1, "One exact editable worker root is required")
        root = roots[0]
        _check_project(lock, root, project, excluded)
        ranking = {tag: index for index, tag in enumerate(target_tags(glibc))}
        packages, extras = _walk(lock, root)
        _require(
            not set(excluded).intersection(packages),
            "Excluded dependency reappeared in runtime closure",
        )
        wheels: list[dict[str, Any]] = []
        for name in sorted(packages):
            wheel = (
                _worker(worker_wheel, root, ranking)
                if name == ROOT_NAME
                else _choose(packages[name], ranking)
            )
            wheel["extras"] = sorted(extras.get(name, set()))
            wheels.append(wheel)
        _require(
            len({wheel["filename"] for wheel in wheels}) == len(wheels),
            "Duplicate runtime wheel filenames",
        )
        total = sum(wheel["sizeBytes"] for wheel in wheels)
        external = sum(wheel["sizeBytes"] for wheel in wheels if wheel["url"] is not None)
        _require(total <= MAX_SAFE_BYTES, "Wheel byte total exceeds exact safe-integer accounting")
        return {
            "schemaVersion": 1,
            "scope": "linux-nvidia-wheelhouse-plan",
            "target": {
                "os": "linux",
                "arch": "x64",
                "pythonVersion": PYTHON_VERSION,
                "glibcMinimum": glibc,
            },
            "lockSha256": hashlib.sha256(lock_bytes).hexdigest(),
            "pyprojectSha256": hashlib.sha256(project_bytes).hexdigest(),
            "excludedDependencies": excluded,
            "rootExtras": ["inference"],
            "wheels": wheels,
            "requirements": "".join(
                f"{w['distribution']}=={w['version']} --hash=sha256:{w['sha256']}\n" for w in wheels
            ),
            "totalWheelBytes": total,
            "externalWheelBytes": external,
            "artifactBytesVerified": False,
            "dependencyEvidence": "lock-graph-only",
            "installQualified": False,
        }
    except WheelhousePlanError:
        raise
    except (ValueError, KeyError, TypeError, OverflowError, RecursionError) as error:
        raise WheelhousePlanError("Invalid or unsupported wheelhouse planning input") from error
