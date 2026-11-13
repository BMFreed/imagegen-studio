"""Lock-graph candidate tests. Tiny artifact descriptors are not verified wheel bytes.

The real-current-lock test also stays offline: it checks a plan, not downloaded
artifacts, selected-wheel METADATA, pip check or installed CUDA qualification.
"""

from __future__ import annotations

import copy
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any, cast

import pytest
from packaging.tags import Tag

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "igs_runtime_wheelhouse_plan", REPO / "scripts/runtime_wheelhouse_plan.py"
)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)
planner = cast(Any, MODULE)
REGISTRY = {"registry": "https://pypi.org/simple"}
WORKER: dict[str, object] = {
    "distribution": "imagegen-worker",
    "version": "0.1.0",
    "filename": "imagegen_worker-0.1.0-py3-none-any.whl",
    "sha256": "a" * 64,
    "sizeBytes": 100,
}


def toml(value: object) -> str:
    """Minimal fixture encoding, never a dependency resolver or wheel selector."""
    if isinstance(value, dict):
        entries = cast(dict[str, object], value)
        return "{ " + ", ".join(f"{json.dumps(k)} = {toml(v)}" for k, v in entries.items()) + " }"
    if isinstance(value, list):
        return "[" + ", ".join(toml(v) for v in cast(list[object], value)) + "]"
    return json.dumps(value)


def encoded(tables: dict[str, Any]) -> bytes:
    lines: list[str] = []
    for key, value in sorted(tables.items(), key=lambda pair: pair[0] == "package"):
        if key == "package":
            for package in value:
                lines.append("[[package]]")
                lines.extend(f"{name} = {toml(item)}" for name, item in package.items())
        else:
            lines.append(f"{key} = {toml(value)}")
    return ("\n".join(lines) + "\n").encode()


def wheel(name: str, version: str, tag: str = "py3-none-any", **changes: Any) -> dict[str, Any]:
    filename = f"{name.replace('-', '_')}-{version}-{tag}.whl"
    return {
        "url": "https://files.pythonhosted.org/locked/" + filename.replace("+", "%2B"),
        "hash": "sha256:" + "b" * 64,
        "size": 200,
        **changes,
    }


def package(
    name: str,
    version: str,
    *,
    deps: list[dict[str, Any]] | None = None,
    wheels: list[dict[str, Any]] | None = None,
    **changes: Any,
) -> dict[str, Any]:
    return {
        "name": name,
        "version": version,
        "source": dict(REGISTRY),
        "dependencies": deps or [],
        "wheels": wheels if wheels is not None else [wheel(name, version)],
        **changes,
    }


def fixture() -> tuple[dict[str, Any], dict[str, Any]]:
    root = {
        "name": "imagegen-worker",
        "version": "0.1.0",
        "source": {"editable": "."},
        "dependencies": [{"name": "core"}],
        "optional-dependencies": {"inference": [{"name": "model"}]},
        "dev-dependencies": {"dev": [{"name": "dev-only"}]},
        "metadata": {
            "provides-extras": ["inference"],
            "requires-dist": [
                {"name": "core", "specifier": "==1.0"},
                {"name": "model", "specifier": "==2.0", "marker": "extra == 'inference'"},
            ],
        },
    }
    lock = {
        "version": 1,
        "revision": 3,
        "requires-python": "==3.12.*",
        "manifest": {"excludes": ["notebook"]},
        "package": [
            root,
            package("core", "1.0"),
            package(
                "model", "2.0", wheels=[wheel("model", "2.0", "cp312-cp312-manylinux_2_28_x86_64")]
            ),
            package("dev-only", "9.0", wheels=[]),
        ],
    }
    project = {
        "project": {
            "name": "imagegen-worker",
            "version": "0.1.0",
            "requires-python": ">=3.12,<3.13",
            "dependencies": ["core==1.0"],
            "optional-dependencies": {"inference": ["model==2.0"]},
        },
        "dependency-groups": {"dev": ["dev-only==9.0"]},
        "tool": {"uv": {"exclude-dependencies": ["notebook"]}},
    }
    return lock, project


def plan(
    lock: dict[str, Any],
    project: dict[str, Any],
    *,
    glibc: str = "2.28",
    worker: dict[str, object] | None = None,
) -> dict[str, Any]:
    return cast(
        dict[str, Any],
        planner.plan_wheelhouse(
            encoded(lock),
            encoded(project),
            glibc=glibc,
            worker_wheel=worker if worker is not None else WORKER,
        ),
    )


def names(result: dict[str, Any]) -> set[str]:
    return {item["distribution"] for item in result["wheels"]}


def test_target_tags_are_explicit_cpython_glibc_not_the_running_host() -> None:
    tags = planner.target_tags("2.28")
    assert tags[0] == Tag("cp312", "cp312", "manylinux_2_28_x86_64")
    for tag in [
        Tag("cp312", "cp312", "manylinux_2_17_x86_64"),
        Tag("cp37", "abi3", "manylinux2014_x86_64"),
        Tag("cp312", "none", "any"),
        Tag("py3", "none", "any"),
        Tag("cp312", "cp312", "manylinux_2_12_x86_64"),
    ]:
        assert tag in tags
    assert Tag("cp312", "cp312", "manylinux_2_29_x86_64") not in tags
    assert len(tags) == len(set(tags))


@pytest.mark.parametrize("glibc", ["2.9", "2.16", "3.28", "2.028", "2.100", "2.28.0", "unknown"])
def test_unknown_or_out_of_domain_target_floor_refuses(glibc: str) -> None:
    with pytest.raises(planner.WheelhousePlanError):
        planner.target_tags(glibc)


def test_base_and_inference_are_selected_without_dev_or_implicit_installation() -> None:
    lock, project = fixture()
    result = plan(lock, project)
    assert names(result) == {"core", "imagegen-worker", "model"}
    assert result["rootExtras"] == ["inference"]
    assert result["excludedDependencies"] == ["notebook"]
    assert result["totalWheelBytes"] == 500
    assert result["externalWheelBytes"] == 400
    assert result["artifactBytesVerified"] is False
    assert result["installQualified"] is False
    assert result["dependencyEvidence"] == "lock-graph-only"
    worker = next(item for item in result["wheels"] if item["distribution"] == "imagegen-worker")
    assert worker["url"] is None and worker["source"] == {"editable": "."}
    assert worker["extras"] == ["inference"]


def test_transitive_closure_and_later_requested_extra_are_not_lost() -> None:
    lock, project = fixture()
    lock["package"][2]["dependencies"] = [{"name": "addon", "extra": ["fast"]}, {"name": "addon"}]
    addon = package("addon", "3.0")
    addon["optional-dependencies"] = {"fast": [{"name": "leaf"}]}
    lock["package"] += [
        addon,
        package("leaf", "4.0", deps=[{"name": "core"}]),
    ]
    result = plan(lock, project)
    assert names(result) == {"core", "imagegen-worker", "model", "addon", "leaf"}
    addon = next(item for item in result["wheels"] if item["distribution"] == "addon")
    assert addon["extras"] == ["fast"]


def test_exact_target_patch_and_platform_markers_ignore_windows_edges() -> None:
    lock, project = fixture()
    lock["package"][2]["dependencies"] = [
        {
            "name": "linux-only",
            "marker": "sys_platform == 'linux' and python_full_version >= '3.12.13'",
        },
        {"name": "missing-win", "marker": "sys_platform == 'win32'"},
    ]
    lock["package"].append(package("linux-only", "1.0"))
    assert "linux-only" in names(plan(lock, project))


@pytest.mark.parametrize(
    "marker",
    [
        "platform_release == '6.0'",
        "platform_version == 'Ubuntu'",
        "extra == 'extra-15-imagegen-worker-inference'",
        "not a marker",
    ],
)
def test_unknown_marker_facts_or_conflicting_uv_universes_refuse(marker: str) -> None:
    lock, project = fixture()
    lock["package"][2]["dependencies"] = [{"name": "missing", "marker": marker}]
    with pytest.raises(planner.WheelhousePlanError):
        plan(lock, project)


@pytest.mark.parametrize(
    "change", ["duplicate", "unresolved", "unknown-extra", "ambiguous", "overlap"]
)
def test_graph_identity_failures_do_not_silently_shrink_or_fork_runtime(change: str) -> None:
    lock, project = fixture()
    model = lock["package"][2]
    if change == "duplicate":
        lock["package"].append(copy.deepcopy(model))
    elif change == "unresolved":
        model["dependencies"] = [{"name": "missing"}]
    elif change == "unknown-extra":
        model["dependencies"] = [{"name": "core", "extra": ["missing"]}]
    elif change == "ambiguous":
        lock["package"].append(package("core", "1.1"))
    else:
        model["dependencies"] = [
            {"name": "other", "version": "1.0", "source": REGISTRY},
            {"name": "other", "version": "2.0", "source": REGISTRY},
        ]
        lock["package"] += [package("other", "1.0"), package("other", "2.0")]
    with pytest.raises(planner.WheelhousePlanError):
        plan(lock, project)


def test_pinned_forks_resolve_exact_version_source_and_normalized_names() -> None:
    lock, project = fixture()
    lock["package"][2]["dependencies"] = [
        {
            "name": "Fork_Name",
            "version": "1.0",
            "source": REGISTRY,
            "marker": "sys_platform == 'linux'",
        },
        {
            "name": "fork-name",
            "version": "2.0",
            "source": REGISTRY,
            "marker": "sys_platform == 'win32'",
        },
    ]
    lock["package"] += [package("fork-name", "1.0"), package("fork-name", "2.0")]
    selected = next(
        item for item in plan(lock, project)["wheels"] if item["distribution"] == "fork-name"
    )
    assert selected["version"] == "1.0"
    lock["package"][2]["dependencies"][0]["source"] = {"registry": "https://another.example/simple"}
    with pytest.raises(planner.WheelhousePlanError):
        plan(lock, project)


@pytest.mark.parametrize(
    "tag",
    [
        "cp313-cp313-manylinux_2_28_x86_64",
        "cp312-cp312t-manylinux_2_28_x86_64",
        "cp312-cp312-win_amd64",
        "cp312-cp312-musllinux_1_2_x86_64",
        "cp312-cp312-manylinux_2_28_aarch64",
        "cp312-cp311-manylinux_2_28_x86_64",
        "cp312-cp312-manylinux_2_29_x86_64",
    ],
)
def test_wheel_tags_reject_wrong_python_abi_os_architecture_or_libc(tag: str) -> None:
    lock, project = fixture()
    lock["package"][2]["wheels"] = [wheel("model", "2.0", tag)]
    with pytest.raises(planner.WheelhousePlanError, match="No compatible"):
        plan(lock, project)


def test_abi3_and_pure_wheels_are_candidates_and_preference_is_deterministic() -> None:
    lock, project = fixture()
    lock["package"][2]["wheels"] = [
        wheel("model", "2.0"),
        wheel("model", "2.0", "cp37-abi3-manylinux2014_x86_64"),
        wheel("model", "2.0", "cp312-cp312-manylinux_2_28_x86_64"),
    ]
    result = plan(lock, project)
    assert (
        next(w for w in result["wheels"] if w["distribution"] == "model")["selectedTag"]
        == "cp312-cp312-manylinux_2_28_x86_64"
    )
    lock["package"][2]["wheels"].reverse()
    lock["package"].reverse()
    assert plan(lock, project)["wheels"] == result["wheels"]
    lock["package"].reverse()
    lock["package"][2]["wheels"] = [wheel("model", "2.0", "cp37-abi3-manylinux2014_x86_64")]
    assert (
        next(w for w in plan(lock, project)["wheels"] if w["distribution"] == "model")[
            "selectedTag"
        ]
        == "cp37-abi3-manylinux2014_x86_64"
    )


def test_same_rank_artifacts_and_sdist_only_dependencies_refuse() -> None:
    lock, project = fixture()
    artifact = lock["package"][2]["wheels"][0]
    lock["package"][2]["wheels"].append(
        {**artifact, "url": artifact["url"].replace("/locked/", "/other/")}
    )
    with pytest.raises(planner.WheelhousePlanError, match="Ambiguous equally"):
        plan(lock, project)
    lock["package"][2]["wheels"] = []
    lock["package"][2]["sdist"] = {"url": "https://example.org/model.tar.gz"}
    with pytest.raises(planner.WheelhousePlanError, match="no sdist fallback"):
        plan(lock, project)


@pytest.mark.parametrize(
    "url",
    [
        "http://files.example/model-2.0-py3-none-any.whl",
        "https://user:secret@files.example/model-2.0-py3-none-any.whl",
        "https://files.example/a/../model-2.0-py3-none-any.whl",
        "https://files.example/%2e%2e/model-2.0-py3-none-any.whl",
        "https://files.example/a%2fb/model-2.0-py3-none-any.whl",
        "https://files.example/model-2.0-py3-none-any.whl#fragment",
        "https://files.example/model-2.0-py3-none-any.whl?token=x",
    ],
)
def test_unsafe_artifact_urls_refuse(url: str) -> None:
    lock, project = fixture()
    lock["package"][2]["wheels"][0]["url"] = url
    with pytest.raises(planner.WheelhousePlanError):
        plan(lock, project)


@pytest.mark.parametrize(
    "field,value",
    [
        ("hash", "md5:" + "a" * 32),
        ("hash", "sha256:" + "A" * 64),
        ("size", 0),
        ("size", True),
        ("size", 2**53),
    ],
)
def test_locked_hash_and_size_are_mandatory_safe_facts(field: str, value: object) -> None:
    lock, project = fixture()
    lock["package"][2]["wheels"][0][field] = value
    with pytest.raises(planner.WheelhousePlanError):
        plan(lock, project)


def test_local_version_suffix_is_preserved_in_filename_version_and_requirement() -> None:
    lock, project = fixture()
    model = lock["package"][2]
    model["version"] = "2.0+cu126"
    model["wheels"] = [wheel("model", "2.0+cu126")]
    project["project"]["optional-dependencies"]["inference"] = ["model==2.0+cu126"]
    lock["package"][0]["metadata"]["requires-dist"][1]["specifier"] = "==2.0+cu126"
    result = plan(lock, project)
    assert "model==2.0+cu126 --hash=sha256:" in result["requirements"]
    assert (
        next(w for w in result["wheels"] if w["distribution"] == "model")["filename"]
        == "model-2.0+cu126-py3-none-any.whl"
    )


@pytest.mark.parametrize(
    "change",
    [
        "project-version",
        "project-pin",
        "metadata-pin",
        "excluded",
        "missing-inference",
        "python",
        "supported",
        "conflicts",
        "source",
        "override",
    ],
)
def test_project_lock_and_target_drift_refuse(change: str) -> None:
    lock, project = fixture()
    if change == "project-version":
        project["project"]["version"] = "0.2.0"
    elif change == "project-pin":
        project["project"]["dependencies"] = ["core==1.1"]
    elif change == "metadata-pin":
        lock["package"][0]["metadata"]["requires-dist"][0]["specifier"] = "==1.1"
    elif change == "excluded":
        project["tool"]["uv"]["exclude-dependencies"] = []
    elif change == "missing-inference":
        del lock["package"][0]["optional-dependencies"]["inference"]
    elif change == "python":
        lock["requires-python"] = "<3.12.13"
    elif change == "supported":
        lock["supported-markers"] = ["sys_platform == 'win32'"]
    elif change == "conflicts":
        lock["conflicts"] = [[{"package": "imagegen-worker", "extra": "inference"}]]
    elif change == "source":
        lock["package"][2]["source"] = {"git": "https://example.org/model"}
    else:
        project["tool"]["uv"]["override-dependencies"] = ["core==2"]
    with pytest.raises(planner.WheelhousePlanError):
        plan(lock, project)


@pytest.mark.parametrize("change", ["name", "version", "filename", "hash", "size"])
def test_built_worker_descriptor_is_bound_to_the_locked_root(change: str) -> None:
    lock, project = fixture()
    worker = dict(WORKER)
    worker[
        {
            "name": "distribution",
            "version": "version",
            "filename": "filename",
            "hash": "sha256",
            "size": "sizeBytes",
        }[change]
    ] = {
        "name": "another-worker",
        "version": "0.2",
        "filename": "../imagegen_worker.whl",
        "hash": "bad",
        "size": 0,
    }[change]
    with pytest.raises(planner.WheelhousePlanError):
        plan(lock, project, worker=worker)


def test_plan_binds_exact_source_bytes_and_requirements_total() -> None:
    lock, project = fixture()
    a = plan(lock, project)
    b = planner.plan_wheelhouse(
        encoded(lock) + b"\n", encoded(project), glibc="2.28", worker_wheel=WORKER
    )
    assert a["wheels"] == b["wheels"]
    assert a["lockSha256"] != b["lockSha256"]
    assert a["requirements"] == "".join(
        f"{w['distribution']}=={w['version']} --hash=sha256:{w['sha256']}\n" for w in a["wheels"]
    )
    assert json.loads(json.dumps(a)) == a


def test_safe_integer_total_overflow_refuses_even_when_each_wheel_is_in_range() -> None:
    lock, project = fixture()
    lock["package"][1]["wheels"][0]["size"] = 2**53 - 1
    with pytest.raises(planner.WheelhousePlanError, match="byte total"):
        plan(lock, project)


def test_selected_package_fork_and_python_bounds_cannot_contradict_active_edges() -> None:
    lock, project = fixture()
    lock["package"][2]["resolution-markers"] = ["sys_platform == 'win32'"]
    with pytest.raises(planner.WheelhousePlanError, match="outside its fork"):
        plan(lock, project)
    del lock["package"][2]["resolution-markers"]
    lock["package"][2]["requires-python"] = ">=3.13"
    with pytest.raises(planner.WheelhousePlanError, match="target Python"):
        plan(lock, project)


def test_missing_python_and_empty_inference_declarations_refuse() -> None:
    lock, project = fixture()
    del lock["requires-python"]
    with pytest.raises(planner.WheelhousePlanError):
        plan(lock, project)
    lock, project = fixture()
    project["project"]["optional-dependencies"]["inference"] = []
    lock["package"][0]["optional-dependencies"]["inference"] = []
    lock["package"][0]["metadata"]["requires-dist"].pop()
    with pytest.raises(planner.WheelhousePlanError, match="cannot be empty"):
        plan(lock, project)


def test_normalized_duplicate_identity_and_noncanonical_versions_refuse() -> None:
    lock, project = fixture()
    duplicate = copy.deepcopy(lock["package"][1])
    duplicate["name"] = "CoRe"
    lock["package"].append(duplicate)
    with pytest.raises(planner.WheelhousePlanError, match="Duplicate normalized"):
        plan(lock, project)
    lock, project = fixture()
    lock["package"][1]["version"] = "v1.0"
    with pytest.raises(planner.WheelhousePlanError, match="canonical spelling"):
        plan(lock, project)


def test_wrong_filename_identity_and_missing_locked_wheel_facts_refuse() -> None:
    lock, project = fixture()
    lock["package"][2]["wheels"][0] = wheel("other", "2.0")
    with pytest.raises(planner.WheelhousePlanError, match="identity disagrees"):
        plan(lock, project)
    lock, project = fixture()
    del lock["package"][2]["wheels"][0]["hash"]
    with pytest.raises(planner.WheelhousePlanError, match="SHA-256"):
        plan(lock, project)


def test_input_schema_and_unknown_project_resolution_settings_refuse() -> None:
    lock, project = fixture()
    lock["version"] = True
    with pytest.raises(planner.WheelhousePlanError, match="schema"):
        plan(lock, project)
    with pytest.raises(planner.WheelhousePlanError, match="TOML"):
        planner.plan_wheelhouse(b"bad = [", encoded(project), glibc="2.28", worker_wheel=WORKER)
    lock, project = fixture()
    project["tool"]["uv"]["sources"] = {"model": {"git": "https://example.org/model"}}
    with pytest.raises(planner.WheelhousePlanError, match="Unsupported uv"):
        plan(lock, project)


def test_real_current_lock_candidate_has_inference_and_no_dev_or_notebook() -> None:
    worker = {**WORKER, "version": "0.1.0"}
    result = planner.plan_wheelhouse(
        (REPO / "worker-python/uv.lock").read_bytes(),
        (REPO / "worker-python/pyproject.toml").read_bytes(),
        glibc="2.28",
        worker_wheel=worker,
    )
    selected = names(result)
    assert {
        "imagegen-worker",
        "pillow",
        "torch",
        "torchvision",
        "transformers",
        "diffusers",
        "compel",
    } <= selected
    assert not {"pytest", "ruff", "basedpyright", "notebook"}.intersection(selected)
    assert result["artifactBytesVerified"] is False and result["installQualified"] is False
