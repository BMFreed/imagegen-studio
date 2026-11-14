"""Real tiny wheel bytes enter the local verifier and existing metadata checker.

No downloads, wheel extraction, installation, payload imports or GPU work.
"""

from __future__ import annotations

import copy
import hashlib
import importlib.util
import stat
import struct
import sys
import zipfile
from pathlib import Path
from typing import Any, cast

import pytest

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts"))
SPEC = importlib.util.spec_from_file_location(
    "igs_runtime_wheelhouse_verify", REPO / "scripts/runtime_wheelhouse_verify.py"
)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)
verifier = cast(Any, MODULE)
ERROR = verifier.WheelhouseVerificationError


def metadata(
    name: str,
    version: str,
    requirements: tuple[str, ...] = (),
    extras: tuple[str, ...] = (),
) -> bytes:
    lines = [
        "Metadata-Version: 2.4",
        f"Name: {name}",
        f"Version: {version}",
        "Requires-Python: >=3.12,<3.13",
        *(f"Provides-Extra: {extra}" for extra in extras),
        *(f"Requires-Dist: {requirement}" for requirement in requirements),
    ]
    return ("\n".join(lines) + "\n\n").encode()


def payload(
    name: str,
    version: str,
    *,
    requirements: tuple[str, ...] = (),
    extras: tuple[str, ...] = (),
    tag: str = "py3-none-any",
) -> dict[str, bytes]:
    root = f"{name.replace('-', '_')}-{version}.dist-info"
    return {
        f"{name.replace('-', '_')}/__init__.py": b"# package fixture bytes\n",
        f"{root}/METADATA": metadata(name, version, requirements, extras),
        f"{root}/WHEEL": (
            "Wheel-Version: 1.0\nRoot-Is-Purelib: true\n" + f"Tag: {tag}\n\n"
        ).encode(),
        f"{root}/RECORD": b"",
    }


def write_wheel(
    directory: Path,
    name: str,
    version: str,
    *,
    entries: dict[str, bytes] | None = None,
    requirements: tuple[str, ...] = (),
    extras: tuple[str, ...] = (),
    tag: str = "py3-none-any",
    compression: int = zipfile.ZIP_STORED,
) -> Path:
    path = directory / f"{name.replace('-', '_')}-{version}-{tag}.whl"
    with zipfile.ZipFile(path, "w", compression=compression) as wheel:
        for member, content in (
            payload(name, version, requirements=requirements, extras=extras, tag=tag)
            if entries is None
            else entries
        ).items():
            wheel.writestr(member, content)
    return path


def fixture(tmp_path: Path) -> tuple[dict[str, Any], Path]:
    wheelhouse = tmp_path / "wheels"
    wheelhouse.mkdir()
    write_wheel(
        wheelhouse,
        "imagegen-worker",
        "0.1.0",
        requirements=("core==1.0", "model==2.0; extra == 'inference'"),
        extras=("inference",),
    )
    write_wheel(wheelhouse, "core", "1.0")
    write_wheel(wheelhouse, "model", "2.0", requirements=("notebook>=6.5.7",))
    wheels: list[dict[str, Any]] = []
    for name, version in [("imagegen-worker", "0.1.0"), ("core", "1.0"), ("model", "2.0")]:
        filename = f"{name.replace('-', '_')}-{version}-py3-none-any.whl"
        data = (wheelhouse / filename).read_bytes()
        wheels.append(
            {
                "distribution": name,
                "version": version,
                "filename": filename,
                "path": f"wheels/{filename}",
                "url": None if name == "imagegen-worker" else f"https://example.invalid/{filename}",
                "sha256": hashlib.sha256(data).hexdigest(),
                "sizeBytes": len(data),
                "selectedTag": "py3-none-any",
                "source": {"editable": "."}
                if name == "imagegen-worker"
                else {"registry": "https://pypi.org/simple"},
                "extras": ["inference"] if name == "imagegen-worker" else [],
            }
        )
    plan = {
        "schemaVersion": 1,
        "scope": "linux-nvidia-wheelhouse-plan",
        "dependencyPolicy": "invoke-inference-v1",
        "rootExtras": ["inference"],
        "excludedDependencies": ["notebook"],
        "artifactBytesVerified": False,
        "dependencyEvidence": "lock-graph-only",
        "installQualified": False,
        "target": {
            "os": "linux",
            "arch": "x64",
            "pythonVersion": "3.12.13",
            "glibcMinimum": "2.28",
        },
        "wheels": wheels,
        "totalWheelBytes": 0,
        "externalWheelBytes": 0,
    }
    totals(plan)
    return plan, wheelhouse


def totals(plan: dict[str, Any]) -> None:
    plan["totalWheelBytes"] = sum(row["sizeBytes"] for row in plan["wheels"])
    plan["externalWheelBytes"] = sum(
        row["sizeBytes"] for row in plan["wheels"] if row["url"] is not None
    )


def refresh(plan: dict[str, Any], wheelhouse: Path) -> None:
    for row in plan["wheels"]:
        data = (wheelhouse / row["filename"]).read_bytes()
        row.update(sha256=hashlib.sha256(data).hexdigest(), sizeBytes=len(data))
    totals(plan)


def verify(plan: dict[str, Any], wheelhouse: Path) -> dict[str, Any]:
    return cast("dict[str, Any]", verifier.verify_wheelhouse(plan, wheelhouse))


def replace_core(plan: dict[str, Any], wheelhouse: Path, entries: dict[str, bytes]) -> None:
    write_wheel(wheelhouse, "core", "1.0", entries=entries)
    refresh(plan, wheelhouse)


def test_actual_bytes_metadata_and_notebook_exemption_have_deterministic_receipt(
    tmp_path: Path,
) -> None:
    plan, wheelhouse = fixture(tmp_path)
    before = copy.deepcopy(plan)
    files = {path.name: path.read_bytes() for path in wheelhouse.iterdir()}
    report = verify(plan, wheelhouse)
    assert report == verify(plan, wheelhouse)
    assert plan == before
    assert files == {path.name: path.read_bytes() for path in wheelhouse.iterdir()}
    assert report["artifactBytesVerified"] is True
    assert report["dependencyEvidence"] == "wheel-metadata"
    assert report["installQualified"] is False
    assert report["target"] == plan["target"]
    assert report["wheelCount"] == 3
    assert report["totalWheelBytes"] == plan["totalWheelBytes"]
    assert [row["distribution"] for row in report["wheels"]] == ["core", "imagegen-worker", "model"]
    assert report["dependencyCheck"]["packageCount"] == 3
    assert report["dependencyCheck"]["exemptedRequirements"] == [
        {"distribution": "model", "dependency": "notebook", "requirement": "notebook>=6.5.7"}
    ]
    row = report["wheels"][0]
    assert row["metadataSha256"] == hashlib.sha256(metadata("core", "1.0")).hexdigest()


@pytest.mark.parametrize("field,value", [("sha256", "0" * 64), ("sizeBytes", 1)])
def test_actual_locked_hash_and_size_are_required(
    tmp_path: Path, field: str, value: object
) -> None:
    plan, wheelhouse = fixture(tmp_path)
    plan["wheels"][1][field] = value
    totals(plan)
    with pytest.raises(ERROR, match="size|SHA-256"):
        verify(plan, wheelhouse)


def test_payload_crc_corruption_reaches_zip_consumer_after_matching_archive_hash(
    tmp_path: Path,
) -> None:
    plan, wheelhouse = fixture(tmp_path)
    path = wheelhouse / "core-1.0-py3-none-any.whl"
    data = bytearray(path.read_bytes())
    offset = data.index(b"# package fixture bytes\n")
    data[offset] ^= 1
    path.write_bytes(data)
    refresh(plan, wheelhouse)
    with pytest.raises(ERROR) as error:
        verify(plan, wheelhouse)
    assert isinstance(error.value.__cause__, zipfile.BadZipFile)
    assert "CRC" in str(error.value.__cause__)


@pytest.mark.parametrize(
    "old,new,reason",
    [
        (b"Name: core", b"Name: foreign", "METADATA"),
        (b"Version: 1.0", b"Version: 1.0+local", "METADATA"),
        (b"Version: 1.0", b"Version: 1.0\nVersion: 1.0", "exactly one"),
        (b"Metadata-Version: 2.4", b"Metadata-Version: 9.0", "Core Metadata"),
        (b"Requires-Python: >=3.12,<3.13", b"Requires-Python: >=3.13", "executing Python"),
        (b"Name: core", b"Name: core\nDynamic: Name", "Dynamic"),
    ],
)
def test_wrong_actual_core_metadata_refuses(
    tmp_path: Path, old: bytes, new: bytes, reason: str
) -> None:
    plan, wheelhouse = fixture(tmp_path)
    entries = payload("core", "1.0")
    entries["core-1.0.dist-info/METADATA"] = entries["core-1.0.dist-info/METADATA"].replace(
        old, new
    )
    replace_core(plan, wheelhouse, entries)
    with pytest.raises(ERROR, match=reason):
        verify(plan, wheelhouse)


@pytest.mark.parametrize(
    "old,new",
    [
        (b"Wheel-Version: 1.0", b"Wheel-Version: 2.0"),
        (b"Root-Is-Purelib: true", b"Root-Is-Purelib: yes"),
        (b"Tag: py3-none-any", b"Tag: cp312-cp312-manylinux_2_28_x86_64"),
        (b"Tag: py3-none-any", b"Tag: py3-none-any\nTag: py3-none-any"),
        (b"Wheel-Version: 1.0", b"Wheel-Version: 1.0\nWheel-Version: 1.0"),
    ],
)
def test_wrong_actual_wheel_metadata_refuses(tmp_path: Path, old: bytes, new: bytes) -> None:
    plan, wheelhouse = fixture(tmp_path)
    entries = payload("core", "1.0")
    entries["core-1.0.dist-info/WHEEL"] = entries["core-1.0.dist-info/WHEEL"].replace(old, new)
    replace_core(plan, wheelhouse, entries)
    with pytest.raises(ERROR):
        verify(plan, wheelhouse)


def test_generic_pth_data_and_nested_vendored_metadata_are_payload_not_imports(
    tmp_path: Path,
) -> None:
    plan, wheelhouse = fixture(tmp_path)
    entries = payload("core", "1.0")
    entries.update(
        {
            "distutils-precedence.pth": b"raise RuntimeError('must never execute')\n",
            "core-1.0.data/scripts/tool": b"# inert script\n",
            "core/_vendor/other-8.dist-info/METADATA": b"vendored package metadata payload\n",
        }
    )
    entries["core-1.0.dist-info/WHEEL"] = entries["core-1.0.dist-info/WHEEL"].replace(
        b"true", b"false"
    )
    replace_core(plan, wheelhouse, entries)
    assert verify(plan, wheelhouse)["dependencyCheck"]["status"] == "ok"


@pytest.mark.parametrize("field", ["Requires-Dist", "Requires-Python", "Provides-Extra"])
def test_prebuilt_wheel_dynamic_fields_do_not_skip_actual_metadata_checks(
    tmp_path: Path, field: str
) -> None:
    plan, wheelhouse = fixture(tmp_path)
    entries = payload("core", "1.0")
    entries["core-1.0.dist-info/METADATA"] = (
        f"Dynamic: {field}\n".encode() + entries["core-1.0.dist-info/METADATA"]
    )
    replace_core(plan, wheelhouse, entries)
    assert verify(plan, wheelhouse)["dependencyCheck"]["status"] == "ok"
    entries["core-1.0.dist-info/METADATA"] = f"Dynamic: {field}\n".encode() + metadata(
        "core", "1.0", requirements=("missing==1.0",)
    )
    replace_core(plan, wheelhouse, entries)
    with pytest.raises(ERROR, match="Missing installed dependency"):
        verify(plan, wheelhouse)


@pytest.mark.parametrize("field", ["Name", "Version", "Metadata-Version", "", "Bad Field"])
def test_dynamic_identity_or_invalid_field_name_refuses(tmp_path: Path, field: str) -> None:
    plan, wheelhouse = fixture(tmp_path)
    entries = payload("core", "1.0")
    entries["core-1.0.dist-info/METADATA"] = (
        f"Dynamic: {field}\n".encode() + entries["core-1.0.dist-info/METADATA"]
    )
    replace_core(plan, wheelhouse, entries)
    with pytest.raises(ERROR, match="Dynamic"):
        verify(plan, wheelhouse)


@pytest.mark.parametrize(
    "member",
    [
        "../outside",
        "/absolute",
        "core/../outside",
        "core//alias",
        "core/./alias",
        "core\\alias",
        "C:/outside",
        "core/%2e%2e/outside",
        "core/e\u0301.py",
        "core-1.0.dist-info/direct_url.json",
        "core/editable.egg-link",
        "other-1.0.dist-info/METADATA",
        "other-1.0.data/scripts/tool",
    ],
)
def test_unsafe_aliased_or_unrelated_reserved_members_refuse(tmp_path: Path, member: str) -> None:
    plan, wheelhouse = fixture(tmp_path)
    entries = payload("core", "1.0")
    entries[member] = b"inert bytes"
    replace_core(plan, wheelhouse, entries)
    with pytest.raises(ERROR):
        verify(plan, wheelhouse)


@pytest.mark.parametrize("suffix", ["METADATA", "WHEEL", "RECORD"])
def test_required_regular_metadata_members_cannot_be_missing(tmp_path: Path, suffix: str) -> None:
    plan, wheelhouse = fixture(tmp_path)
    entries = payload("core", "1.0")
    del entries[f"core-1.0.dist-info/{suffix}"]
    replace_core(plan, wheelhouse, entries)
    with pytest.raises(ERROR, match="missing"):
        verify(plan, wheelhouse)


def test_duplicate_member_and_file_ancestor_are_rejected(tmp_path: Path) -> None:
    plan, wheelhouse = fixture(tmp_path)
    path = wheelhouse / "core-1.0-py3-none-any.whl"
    with pytest.warns(UserWarning, match="Duplicate"), zipfile.ZipFile(path, "a") as wheel:
        wheel.writestr("core/__init__.py", b"duplicate")
    refresh(plan, wheelhouse)
    with pytest.raises(ERROR, match="Duplicate"):
        verify(plan, wheelhouse)
    entries = payload("core", "1.0")
    entries["core/__init__.py/child"] = b"cannot sit below file"
    replace_core(plan, wheelhouse, entries)
    with pytest.raises(ERROR, match="ancestor"):
        verify(plan, wheelhouse)


@pytest.mark.parametrize("kind", [stat.S_IFLNK, stat.S_IFIFO, stat.S_IFSOCK])
def test_symlink_or_special_zip_member_refuses(tmp_path: Path, kind: int) -> None:
    plan, wheelhouse = fixture(tmp_path)
    path = wheelhouse / "core-1.0-py3-none-any.whl"
    with zipfile.ZipFile(path, "a") as wheel:
        info = zipfile.ZipInfo("core/link")
        info.create_system = 3
        info.external_attr = (kind | 0o600) << 16
        wheel.writestr(info, b"target")
    refresh(plan, wheelhouse)
    with pytest.raises(ERROR, match="special"):
        verify(plan, wheelhouse)


def test_unsupported_compression_and_encrypted_member_refuse(tmp_path: Path) -> None:
    plan, wheelhouse = fixture(tmp_path)
    path = write_wheel(wheelhouse, "core", "1.0", compression=zipfile.ZIP_BZIP2)
    refresh(plan, wheelhouse)
    with pytest.raises(ERROR, match="compression"):
        verify(plan, wheelhouse)
    write_wheel(wheelhouse, "core", "1.0")
    data = bytearray(path.read_bytes())
    for magic, flag_offset in [(b"PK\x03\x04", 6), (b"PK\x01\x02", 8)]:
        location = data.index(magic) + flag_offset
        flags = struct.unpack_from("<H", data, location)[0]
        struct.pack_into("<H", data, location, flags | 1)
    path.write_bytes(data)
    refresh(plan, wheelhouse)
    with pytest.raises(ERROR, match="Encrypted"):
        verify(plan, wheelhouse)


@pytest.mark.parametrize("kind", ["missing", "extra", "partial", "directory", "symlink"])
def test_exact_ordinary_directory_membership_refuses(tmp_path: Path, kind: str) -> None:
    plan, wheelhouse = fixture(tmp_path)
    source = wheelhouse / "core-1.0-py3-none-any.whl"
    original = source.read_bytes()
    if kind == "missing":
        source.unlink()
    elif kind == "extra":
        (wheelhouse / "undeclared.whl").write_bytes(b"extra")
    elif kind == "partial":
        (wheelhouse / "pending.whl.downloading").write_bytes(b"partial")
    elif kind == "directory":
        source.unlink()
        source.mkdir()
    else:
        outside = tmp_path / "outside.whl"
        outside.write_bytes(original)
        source.unlink()
        source.symlink_to(outside)
    with pytest.raises(ERROR):
        verify(plan, wheelhouse)
    if kind == "symlink":
        assert (tmp_path / "outside.whl").read_bytes() == original


def test_symlinked_wheelhouse_or_ancestor_never_becomes_input(tmp_path: Path) -> None:
    plan, wheelhouse = fixture(tmp_path)
    alias = tmp_path / "alias"
    alias.symlink_to(wheelhouse, target_is_directory=True)
    with pytest.raises(ERROR):
        verify(plan, alias)
    parent_alias = tmp_path / "parent-alias"
    parent_alias.symlink_to(tmp_path, target_is_directory=True)
    with pytest.raises(ERROR):
        verify(plan, parent_alias / "wheels")


@pytest.mark.parametrize("fact", ["platform_release", "platform_version", "dependency_groups"])
def test_unknown_cross_target_marker_facts_refuse_even_in_inactive_branch(
    tmp_path: Path, fact: str
) -> None:
    plan, wheelhouse = fixture(tmp_path)
    entries = payload(
        "core", "1.0", requirements=(f"missing; sys_platform == 'win32' and {fact} == 'anything'",)
    )
    replace_core(plan, wheelhouse, entries)
    with pytest.raises(ERROR, match="Unknown target marker fact"):
        verify(plan, wheelhouse)


def test_target_markers_do_not_require_inactive_windows_dependency(tmp_path: Path) -> None:
    plan, wheelhouse = fixture(tmp_path)
    replace_core(
        plan, wheelhouse, payload("core", "1.0", requirements=("missing; sys_platform == 'win32'",))
    )
    assert verify(plan, wheelhouse)["dependencyCheck"]["status"] == "ok"


@pytest.mark.parametrize(
    "requirements,extras,reason",
    [
        (("missing==1.0",), (), "Missing installed dependency"),
        (("model==9.0",), (), "Incompatible installed dependency"),
        (("model[unknown]==2.0",), (), "Unknown requested extra"),
        (("demo @ https://example.invalid/demo.whl",), (), "direct-URL"),
        (("leaf==1.0; extra == 'fast'",), ("fast",), "Missing installed dependency"),
    ],
)
def test_actual_selected_dependency_metadata_is_checked(
    tmp_path: Path, requirements: tuple[str, ...], extras: tuple[str, ...], reason: str
) -> None:
    plan, wheelhouse = fixture(tmp_path)
    if extras:
        entries = payload(
            "imagegen-worker",
            "0.1.0",
            requirements=("core==1.0", "core[fast]==1.0; extra == 'inference'"),
            extras=("inference",),
        )
        write_wheel(wheelhouse, "imagegen-worker", "0.1.0", entries=entries)
    replace_core(plan, wheelhouse, payload("core", "1.0", requirements=requirements, extras=extras))
    with pytest.raises(ERROR, match=reason):
        verify(plan, wheelhouse)


@pytest.mark.parametrize(
    "field,value",
    [
        ("schemaVersion", True),
        ("schemaVersion", 2),
        ("scope", "unknown"),
        ("dependencyPolicy", "ignore-all"),
        ("excludedDependencies", ["notebook", "core"]),
        ("rootExtras", ["inference", "dev"]),
        ("artifactBytesVerified", True),
        ("installQualified", True),
        ("dependencyEvidence", "wheel-metadata"),
        ("totalWheelBytes", 1),
        ("externalWheelBytes", 1),
    ],
)
def test_unsupported_or_broadened_plan_refuses(tmp_path: Path, field: str, value: object) -> None:
    plan, wheelhouse = fixture(tmp_path)
    plan[field] = value
    with pytest.raises(ERROR):
        verify(plan, wheelhouse)


@pytest.mark.parametrize(
    "field,value",
    [
        ("distribution", "Core"),
        ("version", "1.0+wrong"),
        ("filename", "../outside.whl"),
        ("selectedTag", "cp312-cp312-win_amd64"),
        ("path", "outside/core.whl"),
        ("sha256", "a"),
        ("sizeBytes", True),
        ("sizeBytes", 0),
    ],
)
def test_invalid_or_drifting_plan_wheel_identity_refuses(
    tmp_path: Path, field: str, value: object
) -> None:
    plan, wheelhouse = fixture(tmp_path)
    plan["wheels"][1][field] = value
    with pytest.raises(ERROR):
        verify(plan, wheelhouse)


def test_duplicate_normalized_distribution_is_not_an_extra_runtime_wheel(tmp_path: Path) -> None:
    plan, wheelhouse = fixture(tmp_path)
    plan["wheels"].append(dict(plan["wheels"][1]))
    totals(plan)
    with pytest.raises(ERROR, match="Duplicate"):
        verify(plan, wheelhouse)


@pytest.mark.parametrize(
    "constant",
    [
        "MAX_WHEELS",
        "MAX_ARCHIVE_BYTES",
        "MAX_TOTAL_ARCHIVE_BYTES",
        "MAX_ENTRIES",
        "MAX_TOTAL_ENTRIES",
        "MAX_EXPANDED_BYTES",
        "MAX_TOTAL_EXPANDED_BYTES",
        "MAX_MEMBER_BYTES",
        "MAX_METADATA_BYTES",
        "MAX_TOTAL_METADATA_BYTES",
        "MAX_REPORT_BYTES",
    ],
)
def test_finite_bounds_refuse_at_real_consumer(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, constant: str
) -> None:
    plan, wheelhouse = fixture(tmp_path)
    monkeypatch.setattr(verifier, constant, 1)
    with pytest.raises(ERROR, match="bound|count|size"):
        verify(plan, wheelhouse)


@pytest.mark.parametrize("kind", ["central-bytes", "declared-count"])
def test_central_preflight_refuses_before_zipfile_index_allocation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, kind: str
) -> None:
    plan, wheelhouse = fixture(tmp_path)
    if kind == "central-bytes":
        monkeypatch.setattr(verifier, "MAX_CENTRAL_BYTES", 1)
    else:
        path = wheelhouse / "core-1.0-py3-none-any.whl"
        data = bytearray(path.read_bytes())
        end = data.rindex(b"PK\x05\x06")
        struct.pack_into("<HH", data, end + 8, 100, 100)
        path.write_bytes(data)
        refresh(plan, wheelhouse)
        monkeypatch.setattr(verifier, "MAX_ENTRIES", 5)
    calls: list[bool] = []

    def forbidden_zip(*_args: object, **_kwargs: object) -> None:
        calls.append(True)
        raise AssertionError("Preflight must refuse before ZipFile")

    monkeypatch.setattr(verifier, "_BoundedZipFile", forbidden_zip)
    with pytest.raises(ERROR, match="central directory"):
        verify(plan, wheelhouse)
    assert not calls


def test_equal_byte_inode_replacement_during_scan_is_not_verified(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    plan, wheelhouse = fixture(tmp_path)
    original = verifier._archive
    replaced = False

    def replace(stream: object, item: dict[str, Any], budget: object) -> object:
        nonlocal replaced
        result = original(stream, item, budget)
        if not replaced:
            path = wheelhouse / item["filename"]
            replacement = tmp_path / "equal-byte-replacement"
            replacement.write_bytes(path.read_bytes())
            replacement.replace(path)
            replaced = True
        return result

    monkeypatch.setattr(verifier, "_archive", replace)
    with pytest.raises(ERROR, match="changed"):
        verify(plan, wheelhouse)
    assert replaced


def test_lying_eocd_count_cannot_overallocate_the_actual_stdlib_index(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    plan, wheelhouse = fixture(tmp_path)
    path = wheelhouse / "core-1.0-py3-none-any.whl"
    data = bytearray(path.read_bytes())
    end = data.rindex(b"PK\x05\x06")
    struct.pack_into("<HH", data, end + 8, 1, 1)
    path.write_bytes(data)
    refresh(plan, wheelhouse)
    monkeypatch.setattr(verifier, "MAX_ENTRIES", 3)
    original_append = verifier._BoundedInfoList.append
    attempts: list[int] = []

    def append(entries: list[zipfile.ZipInfo], item: zipfile.ZipInfo) -> None:
        attempts.append(len(entries))
        original_append(entries, item)

    monkeypatch.setattr(verifier._BoundedInfoList, "append", append)
    with pytest.raises(ERROR, match="index entry count"):
        verify(plan, wheelhouse)
    assert attempts == [0, 1, 2, 3]
    # The neighboring genuine four-member wheels remain valid at their bound.
    monkeypatch.setattr(verifier, "MAX_ENTRIES", 4)
    assert verify(plan, wheelhouse)["wheelCount"] == 3
