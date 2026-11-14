"""Real create-only producer publication; no dependency downloads or installation."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import zipfile
from importlib import metadata
from pathlib import Path
from typing import Any, cast

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/produce-runtime-wheelhouse.py"


def producer() -> Any:
    spec = importlib.util.spec_from_file_location("runtime_wheelhouse_cli", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return cast(Any, module)


def test_publication_creates_exact_new_plan_and_requirements(tmp_path: Path) -> None:
    output = tmp_path / "plan"
    plan = {"requirements": "pillow==12.2.0 --hash=sha256:fixture\n", "installQualified": False}
    producer().publish_plan(output, plan)
    assert sorted(p.name for p in output.iterdir()) == ["requirements.txt", "wheelhouse-plan.json"]
    assert json.loads((output / "wheelhouse-plan.json").read_bytes()) == plan
    assert (output / "requirements.txt").read_text() == plan["requirements"]


@pytest.mark.parametrize("symlink", [False, True])
def test_existing_destination_preserves_foreign_bytes(tmp_path: Path, symlink: bool) -> None:
    foreign = tmp_path / "foreign"
    foreign.mkdir()
    sentinel = foreign / "preserved"
    sentinel.write_bytes(b"Existing developer data")
    output = tmp_path / "plan" if symlink else foreign
    if symlink:
        output.symlink_to(foreign, target_is_directory=True)
    with pytest.raises(FileExistsError):
        producer().publish_plan(output, {"requirements": ""})
    assert sentinel.read_bytes() == b"Existing developer data"
    assert sorted(p.name for p in foreign.iterdir()) == ["preserved"]


def test_failed_publication_retains_incomplete_output(tmp_path: Path) -> None:
    output = tmp_path / "failed"
    with pytest.raises(ValueError, match="exact offline requirements"):
        producer().publish_plan(output, {"requirements": 1})
    assert (output / ".incomplete").is_file()
    assert not (output / "requirements.txt").exists()
    with pytest.raises(FileExistsError):
        producer().publish_plan(output, {"requirements": ""})


def test_replaced_new_output_cannot_adopt_an_existing_nonempty_directory(tmp_path: Path) -> None:
    output = tmp_path / "new-plan"
    foreign = tmp_path / "foreign"
    foreign.mkdir()
    (foreign / "preserved").write_bytes(b"Existing developer bytes")

    def replace_directory() -> None:
        output.rename(tmp_path / "moved-created-output")
        foreign.rename(output)

    error: ValueError | None = None
    try:
        producer().publish_plan(output, {"requirements": ""}, before_open_output=replace_directory)
    except ValueError as caught:
        error = caught
    assert sorted(p.name for p in output.iterdir()) == ["preserved"]
    assert (output / "preserved").read_bytes() == b"Existing developer bytes"
    assert error is not None


def tiny_wheelhouse(tmp_path: Path) -> tuple[list[str], Path]:
    """Real tiny archive/lock inputs; no installer, import or network transport."""
    wheelhouse = tmp_path / "wheels"
    wheelhouse.mkdir()
    files: dict[str, Path] = {}
    for name, version, requirements in (
        (
            "imagegen-worker",
            "0.1.0",
            "Requires-Dist: core==1.0\nProvides-Extra: inference\n"
            "Requires-Dist: model==2.0; extra == 'inference'\n",
        ),
        ("core", "1.0", ""),
        ("model", "2.0", "Requires-Dist: notebook>=6.5.7\n"),
    ):
        escaped = name.replace("-", "_")
        info = f"{escaped}-{version}.dist-info"
        file = wheelhouse / f"{escaped}-{version}-py3-none-any.whl"
        with zipfile.ZipFile(file, "w", compression=zipfile.ZIP_DEFLATED) as wheel:
            wheel.writestr(
                f"{escaped}/__init__.py",
                "raise AssertionError('The verifier must not execute wheel payloads')\n",
            )
            wheel.writestr(
                f"{info}/METADATA",
                "Metadata-Version: 2.4\n"
                f"Name: {name}\nVersion: {version}\n"
                "Requires-Python: >=3.12,<3.13\n"
                f"{requirements}\n",
            )
            wheel.writestr(
                f"{info}/WHEEL", "Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: py3-none-any\n\n"
            )
            wheel.writestr(f"{info}/RECORD", "")
        files[name] = file
    project = tmp_path / "pyproject.toml"
    project.write_text(
        "[project]\nname = 'imagegen-worker'\nversion = '0.1.0'\n"
        "requires-python = '>=3.12,<3.13'\ndependencies = ['core==1.0']\n"
        "[project.optional-dependencies]\ninference = ['model==2.0']\n"
        "[tool.uv]\nexclude-dependencies = ['notebook']\n"
    )
    lock = tmp_path / "uv.lock"
    text = (
        "version = 1\nrevision = 3\nrequires-python = '==3.12.*'\n"
        "[manifest]\nexcludes = ['notebook']\n"
        "[[package]]\nname = 'imagegen-worker'\nversion = '0.1.0'\n"
        "source = { editable = '.' }\ndependencies = [{ name = 'core' }]\n"
        "[package.optional-dependencies]\ninference = [{ name = 'model' }]\n"
        "[package.metadata]\nprovides-extras = ['inference']\nrequires-dist = ["
        "{ name = 'core', specifier = '==1.0' },"
        "{ name = 'model', specifier = '==2.0', marker = \"extra == 'inference'\" }]\n"
    )
    for name, version in (("core", "1.0"), ("model", "2.0")):
        file = files[name]
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        text += (
            f"[[package]]\nname = '{name}'\nversion = '{version}'\n"
            "source = { registry = 'https://pypi.org/simple' }\n"
            f"wheels = [{{ url = 'https://files.pythonhosted.org/locked/{file.name}', "
            f"hash = 'sha256:{digest}', size = {file.stat().st_size} }}]\n"
        )
    text += (
        "[[package]]\nname = 'packaging'\n"
        f"version = '{metadata.version('packaging')}'\n"
        "source = { registry = 'https://pypi.org/simple' }\n"
    )
    lock.write_text(text)
    return [
        "--lock",
        str(lock),
        "--project",
        str(project),
        "--worker-wheel",
        str(files["imagegen-worker"]),
        "--glibc",
        "2.28",
    ], wheelhouse


def test_local_wheelhouse_cli_publishes_separate_bound_receipt(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    args, wheelhouse = tiny_wheelhouse(tmp_path)
    output = tmp_path / "verified"
    assert (
        producer().main([*args, "--wheelhouse", str(wheelhouse), "--output-dir", str(output)]) == 0
    )
    assert sorted(p.name for p in output.iterdir()) == [
        "requirements.txt",
        "wheelhouse-plan.json",
        "wheelhouse-verification.json",
    ]
    plan_bytes = (output / "wheelhouse-plan.json").read_bytes()
    plan = json.loads(plan_bytes)
    receipt = json.loads((output / "wheelhouse-verification.json").read_bytes())
    assert plan["artifactBytesVerified"] is False
    assert plan["dependencyEvidence"] == "lock-graph-only"
    assert plan["installQualified"] is False
    assert receipt["planSha256"] == hashlib.sha256(plan_bytes).hexdigest()
    assert receipt["artifactBytesVerified"] is True
    assert receipt["dependencyEvidence"] == "wheel-metadata"
    assert receipt["installQualified"] is False
    assert receipt["dependencyCheck"]["packageCount"] == 3
    assert receipt["dependencyCheck"]["exemptedRequirements"] == [
        {"distribution": "model", "dependency": "notebook", "requirement": "notebook>=6.5.7"},
    ]
    summary = json.loads(capsys.readouterr().out)
    assert summary["artifactBytesVerified"] is True
    assert summary["installQualified"] is False


def test_absent_wheelhouse_option_preserves_plan_only_cli(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    args, _wheelhouse = tiny_wheelhouse(tmp_path)
    output = tmp_path / "plan-only"
    assert producer().main([*args, "--output-dir", str(output)]) == 0
    assert sorted(p.name for p in output.iterdir()) == ["requirements.txt", "wheelhouse-plan.json"]
    assert "artifactBytesVerified" not in json.loads(capsys.readouterr().out)


def test_verified_cli_repeat_is_byte_identical(tmp_path: Path) -> None:
    args, wheelhouse = tiny_wheelhouse(tmp_path)
    first, second = tmp_path / "first", tmp_path / "second"
    cli = producer()
    for output in (first, second):
        assert cli.main([*args, "--wheelhouse", str(wheelhouse), "--output-dir", str(output)]) == 0
    for name in ("requirements.txt", "wheelhouse-plan.json", "wheelhouse-verification.json"):
        assert (first / name).read_bytes() == (second / name).read_bytes()


@pytest.mark.parametrize("change", ["missing", "corrupt", "extra"])
def test_bad_wheelhouse_refuses_before_any_output(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], change: str
) -> None:
    args, wheelhouse = tiny_wheelhouse(tmp_path)
    core = wheelhouse / "core-1.0-py3-none-any.whl"
    if change == "missing":
        core.unlink()
    elif change == "corrupt":
        core.write_bytes(core.read_bytes() + b"changed")
    else:
        (wheelhouse / "extra.whl").write_bytes(b"Unexpected file")
    worker = wheelhouse / "imagegen_worker-0.1.0-py3-none-any.whl"
    before = worker.read_bytes()
    output = tmp_path / "refused"
    assert (
        producer().main([*args, "--wheelhouse", str(wheelhouse), "--output-dir", str(output)]) == 2
    )
    assert not output.exists()
    assert worker.read_bytes() == before
    assert json.loads(capsys.readouterr().err)["outcome"] == "REFUSED"


@pytest.mark.parametrize("source", ["--lock", "--project", "--worker-wheel"])
def test_inputs_changed_after_real_verification_refuse_before_publication(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, source: str
) -> None:
    args, wheelhouse = tiny_wheelhouse(tmp_path)
    cli = producer()
    import runtime_wheelhouse_verify as verifier

    verify = verifier.verify_wheelhouse
    changed = Path(args[args.index(source) + 1])

    def change_after_verify(plan: dict[str, Any], directory: Path) -> dict[str, object]:
        report = verify(plan, directory)
        changed.write_bytes(changed.read_bytes() + b"\n")
        return report

    monkeypatch.setattr(verifier, "verify_wheelhouse", change_after_verify)
    output = tmp_path / "changed-input"
    assert cli.main([*args, "--wheelhouse", str(wheelhouse), "--output-dir", str(output)]) == 2
    assert not output.exists()


def test_verification_receipt_failure_retains_incomplete_publication(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    cli = producer()
    monkeypatch.setattr(cli, "MAX_VERIFICATION_BYTES", 1)
    output = tmp_path / "partial-verification"
    with pytest.raises(ValueError, match="verification receipt exceeds"):
        cli.publish_plan(output, {"requirements": ""}, verification={"artifactBytesVerified": True})
    assert (output / ".incomplete").is_file()
    assert (output / "wheelhouse-plan.json").is_file()
    assert (output / "requirements.txt").is_file()
    assert not (output / "wheelhouse-verification.json").exists()


def test_wheelhouse_cannot_be_reused_as_publication_output(tmp_path: Path) -> None:
    args, wheelhouse = tiny_wheelhouse(tmp_path)
    before = {p.name: p.read_bytes() for p in wheelhouse.iterdir()}
    assert (
        producer().main(
            [
                *args,
                "--wheelhouse",
                str(wheelhouse),
                "--output-dir",
                str(wheelhouse),
            ]
        )
        == 2
    )
    assert {p.name: p.read_bytes() for p in wheelhouse.iterdir()} == before
