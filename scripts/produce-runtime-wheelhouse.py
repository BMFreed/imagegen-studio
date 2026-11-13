"""Build-time Invoke-derived lock -> wheel selection, not a client installer.

Run with the locked worker development environment. This command never downloads,
installs, signs or imports inference packages. Its output is deliberately a plan.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
import stat
import sys
import tomllib
from collections.abc import Callable
from pathlib import Path
from typing import Any

# -I is supported: only this reviewed script directory is added, never cwd/PYTHONPATH.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from runtime_wheelhouse_plan import plan_wheelhouse, target_tags  # noqa: E402
from runtime_worker_wheel import inspect_worker_wheel  # noqa: E402

REPOSITORY = Path(__file__).resolve().parent.parent
MAX_INPUT_BYTES = 8 * 1024 * 1024
DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


def file_identity(value: os.stat_result) -> tuple[int, ...]:
    return (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns)


def stable_input(path: Path) -> bytes:
    if not path.is_absolute() or path.resolve() != path:
        raise ValueError("Producer inputs must be canonical ordinary files.")
    before = path.lstat()
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        opened = os.fstat(descriptor)
        if not stat.S_ISREG(opened.st_mode) or opened.st_size > MAX_INPUT_BYTES:
            raise ValueError("Producer input is not a bounded regular file.")
        if file_identity(before) != file_identity(opened):
            raise ValueError("Producer input changed while opening.")
        with os.fdopen(os.dup(descriptor), "rb") as stream:
            data = stream.read(MAX_INPUT_BYTES + 1)
        if len(data) != opened.st_size or file_identity(os.fstat(descriptor)) != file_identity(
            opened
        ):
            raise ValueError("Producer input changed while reading.")
        if file_identity(path.lstat()) != file_identity(opened):
            raise ValueError("Producer input path changed while reading.")
        return data
    finally:
        os.close(descriptor)


def publish_plan(
    destination: Path,
    plan: dict[str, Any],
    *,
    before_open_output: Callable[[], None] | None = None,
) -> None:
    """New output directory only; fd-anchored files retain an incomplete marker on failure.

    Adapt the existing runtime controller's directory identity and create-only
    publication pattern. A partial producer output is never a signed release.
    """
    if destination.name in ("", ".", "..") or destination.parent.resolve() != destination.parent:
        raise ValueError("Output parent must be a canonical existing directory.")
    parent = os.open(destination.parent, DIRECTORY_FLAGS)
    output: int | None = None
    try:
        parent_info = os.fstat(parent)

        def same_parent() -> None:
            current = destination.parent.lstat()
            if (
                not stat.S_ISDIR(current.st_mode)
                or (current.st_dev, current.st_ino) != (parent_info.st_dev, parent_info.st_ino)
                or destination.parent.resolve() != destination.parent
            ):
                raise ValueError("Output parent changed during publication.")

        same_parent()
        os.mkdir(destination.name, mode=0o700, dir_fd=parent)
        if before_open_output is not None:
            before_open_output()
        output = os.open(destination.name, DIRECTORY_FLAGS, dir_fd=parent)
        output_info = os.fstat(output)
        with os.scandir(output) as entries:
            if next(entries, None) is not None:
                raise ValueError("The newly created output was replaced by a nonempty directory.")

        def same_output() -> None:
            same_parent()
            current = os.stat(destination.name, dir_fd=parent, follow_symlinks=False)
            if not stat.S_ISDIR(current.st_mode) or (current.st_dev, current.st_ino) != (
                output_info.st_dev,
                output_info.st_ino,
            ):
                raise ValueError("Output directory changed during publication.")

        def write(name: str, data: bytes) -> None:
            same_output()
            descriptor = os.open(
                name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=output
            )
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())

        write(".incomplete", b"Unpublished wheelhouse plan\n")
        write("wheelhouse-plan.json", (json.dumps(plan, sort_keys=True, indent=2) + "\n").encode())
        requirements = plan["requirements"]
        if not isinstance(requirements, str):
            raise ValueError("The plan did not supply exact offline requirements.")
        write("requirements.txt", requirements.encode())
        same_output()
        os.fsync(output)
        os.unlink(".incomplete", dir_fd=output)
        os.fsync(output)
        os.fsync(parent)
        same_output()
    finally:
        if output is not None:
            os.close(output)
        os.close(parent)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lock", type=Path, default=REPOSITORY / "worker-python/uv.lock")
    parser.add_argument("--project", type=Path, default=REPOSITORY / "worker-python/pyproject.toml")
    parser.add_argument("--worker-wheel", type=Path, required=True)
    parser.add_argument(
        "--glibc", required=True, help="Explicit target floor; not the current host libc"
    )
    parser.add_argument("--output-dir", type=Path, required=True, help="Must not already exist")
    args = parser.parse_args(argv)
    try:
        if sys.platform != "linux":
            raise ValueError("This producer publication path requires Linux.")
        lock_path, project_path = args.lock.absolute(), args.project.absolute()
        lock, project = stable_input(lock_path), stable_input(project_path)
        packages = tomllib.loads(lock.decode())["package"]
        tooling = [entry["version"] for entry in packages if entry["name"] == "packaging"]
        if tooling != [importlib.metadata.version("packaging")]:
            raise ValueError("Use the worker's locked development packaging version.")
        worker_path = args.worker_wheel.absolute()
        worker_before = worker_path.lstat()
        worker = inspect_worker_wheel(worker_path, project, target_tags(args.glibc))
        plan = plan_wheelhouse(lock, project, glibc=args.glibc, worker_wheel=worker)
        if stable_input(lock_path) != lock or stable_input(project_path) != project:
            raise ValueError("Lock/project changed during selection.")
        if file_identity(worker_path.lstat()) != file_identity(worker_before):
            raise ValueError("Built worker wheel changed during selection.")
        plan["tooling"] = {"packaging": tooling[0]}
        publish_plan(args.output_dir.absolute(), plan)
        summary = {
            "scope": plan["scope"],
            "outputDirectory": str(args.output_dir.absolute()),
            "packages": len(plan["wheels"]),
            "totalWheelBytes": plan["totalWheelBytes"],
            "lockSha256": hashlib.sha256(lock).hexdigest(),
            "installQualified": False,
        }
        print(json.dumps(summary, sort_keys=True))
        return 0
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(json.dumps({"outcome": "REFUSED", "message": str(error)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
