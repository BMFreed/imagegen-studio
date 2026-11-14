"""Fixed installed-policy controls; synthetic metadata and ordinary dist-info reads."""

from __future__ import annotations

import json
from importlib import metadata
from pathlib import Path
from typing import cast

import pytest

from imagegen_worker import runtime_dependencies as checker

ENVIRONMENT = {
    "implementation_name": "cpython",
    "implementation_version": "3.12.13",
    "os_name": "posix",
    "platform_machine": "x86_64",
    "platform_release": "6.0.0",
    "platform_system": "Linux",
    "platform_version": "1",
    "python_full_version": "3.12.13",
    "platform_python_implementation": "CPython",
    "python_version": "3.12",
    "sys_platform": "linux",
}


def descriptor(
    name: str,
    version: str = "1.0",
    *,
    dependencies: tuple[str, ...] = (),
    extras: tuple[str, ...] = (),
    python: str | None = ">=3.12,<3.13",
    extra_lines: tuple[str, ...] = (),
) -> checker.DistributionMetadata:
    lines = ["Metadata-Version: 2.4", f"Name: {name}", f"Version: {version}"]
    if python is not None:
        lines.append(f"Requires-Python: {python}")
    lines.extend(f"Provides-Extra: {extra}" for extra in extras)
    lines.extend(f"Requires-Dist: {dependency}" for dependency in dependencies)
    return checker.DistributionMetadata(("\n".join([*lines, *extra_lines]) + "\n\n").encode())


def root(*dependencies: str) -> checker.DistributionMetadata:
    return descriptor("imagegen-worker", "0.1.0", dependencies=dependencies, extras=("inference",))


def check(*items: checker.DistributionMetadata) -> dict[str, object]:
    return checker.check_distribution_metadata(items, ENVIRONMENT)


def test_only_declared_active_notebook_dependency_is_exempt() -> None:
    report = check(
        root("compel==2.4.0; extra == 'inference'"),
        descriptor("compel", "2.4.0", dependencies=("notebook>=6.5.7",)),
    )
    assert report == {
        "schemaVersion": 1,
        "policy": "invoke-inference-v1",
        "root": "imagegen-worker",
        "rootExtras": ["inference"],
        "excludedDependencies": ["notebook"],
        "packageCount": 2,
        "checkedRequirements": 2,
        "exemptedRequirements": [
            {"distribution": "compel", "dependency": "notebook", "requirement": "notebook>=6.5.7"}
        ],
        "pythonVersion": "3.12.13",
        "status": "ok",
    }


def test_all_installed_base_requirements_are_checked_even_outside_root_closure() -> None:
    with pytest.raises(checker.DependencyCheckError, match="Missing installed dependency"):
        check(root(), descriptor("unrelated", dependencies=("absent==1",)))


@pytest.mark.parametrize("dependency", ["missing>=1", "torch>=2.8", "torch==2.7.1+cu128"])
def test_other_missing_or_wrong_version_dependencies_are_not_exempt(dependency: str) -> None:
    with pytest.raises(checker.DependencyCheckError, match="installed dependency"):
        check(root(dependency), descriptor("torch", "2.7.1"))


def test_transitive_requirement_is_reached_and_checked() -> None:
    with pytest.raises(checker.DependencyCheckError, match="leaf"):
        check(root("middle==1"), descriptor("middle", dependencies=("leaf>=2",)))
    assert (
        check(
            root("middle==1"),
            descriptor("middle", dependencies=("leaf>=2",)),
            descriptor("leaf", "2"),
        )["checkedRequirements"]
        == 2
    )


def test_later_requested_extra_is_not_lost_after_plain_package_visit() -> None:
    packages = (
        root("z-requester==1"),
        descriptor("a-addon", extras=("feature",), dependencies=("leaf>=2; extra == 'feature'",)),
        descriptor("z-requester", dependencies=("a-addon[feature]==1",)),
    )
    with pytest.raises(checker.DependencyCheckError, match="leaf"):
        check(*packages)
    assert check(*packages, descriptor("leaf", "2"))["checkedRequirements"] == 3


def test_extra_context_belongs_to_its_distribution_and_nested_extras_are_activated() -> None:
    report = check(
        root("addon[feature]==1; extra == 'inference'"),
        descriptor(
            "addon",
            extras=("feature",),
            dependencies=("nested[other]==1; extra == 'feature'", "absent; extra == 'inference'"),
        ),
        descriptor("nested", extras=("other",), dependencies=("leaf==1; extra == 'other'",)),
        descriptor("leaf"),
    )
    assert report["checkedRequirements"] == 3


def test_cycles_and_repeated_base_extra_edges_terminate_and_deduplicate() -> None:
    report = check(
        root("addon[feature]==1", "notebook>=6.5.7"),
        descriptor(
            "addon", extras=("feature",), dependencies=("imagegen-worker[inference]==0.1.0",)
        ),
    )
    assert report["checkedRequirements"] == 3
    assert len(cast("list[object]", report["exemptedRequirements"])) == 1


@pytest.mark.parametrize(
    "requirement",
    ["notebook>=6.5.7; sys_platform == 'win32'", "missing; python_version < '3.12'"],
)
def test_inactive_requirements_do_not_need_installed_dependencies(requirement: str) -> None:
    report = check(root(requirement))
    assert report["checkedRequirements"] == 0
    assert report["exemptedRequirements"] == []


def test_runtime_marker_activates_required_dependency() -> None:
    with pytest.raises(checker.DependencyCheckError, match="missing"):
        check(root("missing; platform_machine == 'x86_64' and python_full_version == '3.12.13'"))


@pytest.mark.parametrize("name", ["notebook", "NoteBook"])
def test_excluded_package_must_not_be_installed(name: str) -> None:
    with pytest.raises(checker.DependencyCheckError, match="Excluded Notebook"):
        check(root(), descriptor(name))


@pytest.mark.parametrize("name", ["missing", "notebook"])
def test_active_direct_urls_cannot_bypass_the_policy(name: str) -> None:
    with pytest.raises(checker.DependencyCheckError, match="direct-URL"):
        check(root(f"{name} @ https://example.invalid/package.whl"))


def test_inactive_direct_url_is_not_an_active_dependency() -> None:
    report = check(root("demo @ https://example.invalid/demo.whl ; sys_platform == 'win32'"))
    assert report["status"] == "ok"


@pytest.mark.parametrize(
    "requirement",
    [
        "broken => version",
        "dep; made_up == 'yes'",
        "dep; python_version >=",
        "dep; extras == 'feature'",
    ],
)
def test_invalid_or_unsupported_metadata_markers_refuse(requirement: str) -> None:
    with pytest.raises(checker.DependencyCheckError):
        check(root(requirement))


def test_missing_root_or_missing_inference_extra_refuses() -> None:
    with pytest.raises(checker.DependencyCheckError, match="worker distribution is missing"):
        check(descriptor("demo"))
    with pytest.raises(checker.DependencyCheckError, match="inference extra is missing"):
        check(descriptor("imagegen-worker", "0.1.0"))


def test_unknown_active_requested_extra_refuses() -> None:
    with pytest.raises(checker.DependencyCheckError, match="Unknown requested extra"):
        check(root("demo[feature]>=1"), descriptor("demo"))


def test_inactive_unknown_extra_does_not_activate() -> None:
    report = check(root("demo[feature]>=1; sys_platform == 'win32'"), descriptor("demo"))
    assert report["status"] == "ok"


def test_normalized_distribution_and_extra_duplicates_refuse() -> None:
    with pytest.raises(checker.DependencyCheckError, match="Duplicate normalized installed"):
        check(root(), descriptor("some-package"), descriptor("Some_Package"))
    with pytest.raises(checker.DependencyCheckError, match="Duplicate normalized extra"):
        check(root(), descriptor("demo", extras=("some-extra", "Some_Extra")))


@pytest.mark.parametrize("python", [">=3.13", "<3.12", "broken-range"])
def test_present_python_requirement_is_enforced(python: str) -> None:
    with pytest.raises(checker.DependencyCheckError):
        check(root(), descriptor("demo", python=python))


def test_python_requirement_may_be_absent_under_core_metadata() -> None:
    assert check(root(), descriptor("demo", python=None))["status"] == "ok"


@pytest.mark.parametrize(
    "extra_lines",
    [
        ("Name: other",),
        ("Version: 1.0",),
        ("Requires-Python: >=3.12",),
        ("Metadata-Version: 2.4",),
    ],
)
def test_duplicate_scalar_metadata_refuses(extra_lines: tuple[str, ...]) -> None:
    with pytest.raises(checker.DependencyCheckError):
        check(root(), descriptor("demo", extra_lines=extra_lines))


@pytest.mark.parametrize(
    "old,new",
    [
        (b"Name: imagegen-worker\n", b""),
        (b"Version: 0.1.0\n", b""),
        (b"Metadata-Version: 2.4\n", b""),
        (b"Name: imagegen-worker", b"Name: bad name"),
        (b"Version: 0.1.0", b"Version: garbage"),
        (b"Metadata-Version: 2.4", b"Metadata-Version: 9.0"),
        (b"Name: imagegen-worker", b"Name: \xff"),
    ],
)
def test_missing_or_invalid_scalar_metadata_refuses(old: bytes, new: bytes) -> None:
    with pytest.raises(checker.DependencyCheckError):
        check(checker.DistributionMetadata(root().metadata.replace(old, new)))


def test_pep440_local_versions_and_explicit_prereleases_use_packaging() -> None:
    assert check(root("torch==2.7.1"), descriptor("torch", "2.7.1+cu128"))["status"] == "ok"
    assert check(root("demo==2.0rc1"), descriptor("demo", "2.0rc1"))["status"] == "ok"
    # packaging >=26.0 contains() admits a single matching prerelease because
    # no alternative final candidate exists. Keep the library's semantics.
    assert check(root("demo>=1,<3"), descriptor("demo", "2.0rc1"))["status"] == "ok"
    with pytest.raises(checker.DependencyCheckError, match="Incompatible"):
        check(root("demo>=3"), descriptor("demo", "2.0rc1"))


def test_environment_must_not_silently_fall_back_to_build_host() -> None:
    missing = {key: value for key, value in ENVIRONMENT.items() if key != "sys_platform"}
    with pytest.raises(checker.DependencyCheckError, match="marker environment"):
        checker.check_distribution_metadata([root()], missing)
    with pytest.raises(checker.DependencyCheckError, match="marker environment"):
        checker.check_distribution_metadata([root()], {**ENVIRONMENT, "extra": "inference"})
    with pytest.raises(checker.DependencyCheckError, match="Inconsistent"):
        checker.check_distribution_metadata([root()], {**ENVIRONMENT, "python_version": "3.11"})


@pytest.mark.parametrize(
    "constant,value,packages,message",
    [
        ("MAX_DISTRIBUTIONS", 1, (root(), descriptor("demo")), "Too many installed"),
        ("MAX_METADATA_BYTES", 16, (root(),), "metadata exceeds"),
        ("MAX_TOTAL_METADATA_BYTES", 16, (root(),), "Total metadata"),
        ("MAX_REQUIREMENTS", 0, (root("notebook>=6.5.7"),), "Too many dependency"),
        ("MAX_VISITED_EDGES", 0, (root("notebook>=6.5.7"),), "traversal exceeds"),
        ("MAX_EXEMPTIONS", 0, (root("notebook>=6.5.7"),), "Too many Notebook"),
        ("MAX_REPORT_BYTES", 16, (root(),), "report exceeds"),
        ("MAX_TEXT", 4, (root(),), "Invalid or oversized"),
    ],
)
def test_finite_bounds_refuse_instead_of_truncating(
    monkeypatch: pytest.MonkeyPatch,
    constant: str,
    value: int,
    packages: tuple[checker.DistributionMetadata, ...],
    message: str,
) -> None:
    monkeypatch.setattr(checker, constant, value)
    with pytest.raises(checker.DependencyCheckError, match=message):
        check(*packages)


def test_exemption_rows_are_deterministic_and_preserve_trimmed_requirement_text() -> None:
    packages = (
        root("notebook>=6.5.7"),
        descriptor("z-package", dependencies=("notebook >= 7",)),
        descriptor("a-package", dependencies=("notebook>=6.5.7; sys_platform == 'linux'",)),
    )
    first = check(*packages)
    assert first == check(*reversed(packages))
    rows = cast("list[dict[str, str]]", first["exemptedRequirements"])
    assert [row["distribution"] for row in rows] == ["a-package", "imagegen-worker", "z-package"]
    assert rows[-1]["requirement"] == "notebook >= 7"


def installed(tmp_path: Path, descriptor: checker.DistributionMetadata, directory: str) -> Path:
    root = tmp_path / directory
    root.mkdir()
    (root / "METADATA").write_bytes(descriptor.metadata)
    return root


def test_collector_reads_real_dist_info_without_importing_packages(tmp_path: Path) -> None:
    installed(tmp_path, root("demo==1; extra == 'inference'"), "imagegen_worker-0.1.0.dist-info")
    installed(tmp_path, descriptor("demo"), "demo-1.0.dist-info")
    (tmp_path / "demo.py").write_text("raise RuntimeError('package must never be imported')")
    collected = checker.collect_distribution_metadata(metadata.distributions(path=[str(tmp_path)]))
    assert check(*collected)["packageCount"] == 2


def test_collector_refuses_symlink_metadata(tmp_path: Path) -> None:
    target = tmp_path / "original"
    target.write_bytes(root().metadata)
    directory = tmp_path / "imagegen_worker-0.1.0.dist-info"
    directory.mkdir()
    (directory / "METADATA").symlink_to(target)
    with pytest.raises(checker.DependencyCheckError, match="unavailable or not ordinary"):
        checker.collect_distribution_metadata(metadata.distributions(path=[str(tmp_path)]))
    assert target.read_bytes() == root().metadata


def test_collector_refuses_legacy_and_oversized_metadata(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    directory = installed(tmp_path, root(), "imagegen_worker.egg-info")
    with pytest.raises(checker.DependencyCheckError, match="Legacy"):
        checker.collect_distribution_metadata([metadata.PathDistribution(directory)])
    regular = installed(tmp_path, root(), "imagegen_worker-0.1.0.dist-info")
    monkeypatch.setattr(checker, "MAX_METADATA_BYTES", 16)
    with pytest.raises(checker.DependencyCheckError, match="ordinary bounded"):
        checker.collect_distribution_metadata([metadata.PathDistribution(regular)])


def test_cli_refuses_all_overrides_without_reading_metadata(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def must_not_collect() -> tuple[checker.DistributionMetadata, ...]:
        raise AssertionError("override must refuse before discovery")

    monkeypatch.setattr(checker, "collect_distribution_metadata", must_not_collect)
    assert checker.main(["--exclude", "torch"]) == 2
    report = json.loads(capsys.readouterr().out)
    assert report["status"] == "error" and report["policy"] == "invoke-inference-v1"


def test_cli_returns_json_success_or_explicit_error(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(checker, "collect_distribution_metadata", lambda: (root(),))
    monkeypatch.setattr(checker, "default_environment", lambda: ENVIRONMENT.copy())
    assert checker.main([]) == 0
    assert json.loads(capsys.readouterr().out)["status"] == "ok"
    monkeypatch.setattr(checker, "collect_distribution_metadata", lambda: (root("absent"),))
    assert checker.main([]) == 2
    failure = json.loads(capsys.readouterr().out)
    assert failure["status"] == "error" and "absent" in failure["message"]
