"""Real create-only producer publication; no dependency downloads or installation."""

from __future__ import annotations

import importlib.util
import json
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
