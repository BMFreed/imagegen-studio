"""Restore the pinned DB29 checkpoint into an isolated Repair qualification profile."""

import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import tarfile


ARCHIVE_SHA256 = "a89100e6ac36a68f3fabd0a5e009ed063750218a3d3157aadf56729d8eab3251"
HISTORICAL_REVISION = "6b812f93d2715af2c4f904e70093b3f9c5b09713"
ORIGINAL_LINE = b'PROTOCOL_VERSION = "1"\n'
ALTERNATE_LINE = b'PROTOCOL_VERSION = "2"  # isolated qualification value\n'
DATA_PREFIX = "data/imagegen-studio/"


def digest(body):
    return hashlib.sha256(body).hexdigest()


def directory(path):
    assert path.resolve(strict=True) == path and path.is_dir(), path
    assert path.stat().st_uid == os.getuid(), path
    return path


def pin(path, maximum_size):
    assert path.resolve(strict=True) == path, path
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        before = os.fstat(stream.fileno())
        assert stat.S_ISREG(before.st_mode) and before.st_nlink == 1, path
        assert before.st_uid == os.getuid() and 0 < before.st_size <= maximum_size, path
        sha = hashlib.file_digest(stream, "sha256").hexdigest()
        after = os.fstat(stream.fileno())
        assert (
            before.st_mtime_ns, before.st_ctime_ns, before.st_size
        ) == (after.st_mtime_ns, after.st_ctime_ns, after.st_size), path
    return {"path": str(path), "sizeBytes": before.st_size, "sha256": sha}


def check_bytes(body, expected):
    assert len(body) == expected["sizeBytes"] and digest(body) == expected["sha256"]


def write_bytes(path, body, mode=0o600):
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode), "wb") as stream:
        stream.write(body)


def write_json(path, value):
    write_bytes(path, (json.dumps(value, indent=2) + "\n").encode())


def read_checkpoint(archive, descriptor):
    files = descriptor["checkpoint29"]["files"]
    expected_paths = {
        "database/app.sqlite",
        "models/compatibility-fixture.safetensors",
        f'generation-inputs/{descriptor["queue"]["id"]}/manifest.json',
        f'generation-inputs/{descriptor["queue"]["id"]}/target.png',
        "workspaces/Uncategorized/" + Path(descriptor["project"]["projectFile"]).name,
    }
    assert len(files) == len(expected_paths) == 5
    assert {entry["path"] for entry in files} == {DATA_PREFIX + name for name in expected_paths}
    assert all(".." not in Path(name).parts for name in expected_paths)
    records = {}
    with tarfile.open(archive, "r:gz") as checkpoint:
        members = checkpoint.getmembers()
        for entry in files:
            assert entry["kind"] == "file"
            matches = [item for item in members if item.name == "payloads/checkpoint-29/" + entry["path"]]
            assert len(matches) == 1
            member = matches[0]
            assert member.isfile() and 0 < member.size == entry["sizeBytes"] <= 16 * 1024**2
            with checkpoint.extractfile(member) as stream:
                body = stream.read()
            check_bytes(body, entry)
            records[entry["path"].removeprefix(DATA_PREFIX)] = body
    return records


def prepare(run):
    assert re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]*", run.name)
    directory(run)
    artifacts = directory(run.parents[2])
    assert run.parent == artifacts / "runs/packaged-runtime-setup"
    assert artifacts == Path.home() / ".codex/artifacts/imagegen-studio"
    smoke = run / "protocol-repair"
    state = run / "protocol-repair-state"
    inputs = run / "protocol-repair-inputs"
    assert all(not os.path.lexists(path) for path in [smoke, state, inputs])

    package_proof = run / "package.json"
    pin(package_proof, 1024**2)
    package = json.loads(package_proof.read_text())["package"]
    package_path = Path(package["path"])
    assert package_path.parent == run / "package-work/output"
    assert package_path.suffix == ".AppImage"
    assert pin(package_path, 512 * 1024**2) == package

    engine = directory(artifacts / "runs/packaged-installed-engine/20261118")
    report_path = engine / "installed-engine.json"
    source_report = pin(report_path, 8 * 1024**2)
    report = json.loads(report_path.read_text())
    assert report["outcome"] == "PASS"
    assert report["qualification"] == "actual-signed-full-engine-install-native-qualification"
    app_data = directory(Path(report["roots"]["appDataDir"]))
    assert app_data == engine / "payloads/native-runtime-offline-VzNDka/data/imagegen-studio"
    runtime = directory(app_data / "runtime")
    assert runtime == Path(report["roots"]["runtimeDir"])
    pointer = report["activatedPointer"]
    slot = pointer["runtimeId"]
    assert re.fullmatch(r"release-[0-9a-f-]{36}", slot)
    environment = directory(runtime / "environments" / slot)
    python = directory(runtime / "python" / slot)
    python_executable = environment / "bin/python"
    assert python_executable.resolve(strict=True).is_relative_to(python)
    assert str(python_executable) == pointer["pythonExecutable"]
    worker = directory(Path(report["installedInspection"]["workerRoot"]))
    assert worker == environment / "lib/python3.12/site-packages/imagegen_worker"
    original_source = worker / "__init__.py"
    original = pin(original_source, 1024)
    signed = report["installedInspection"]["workerFiles"]["__init__.py"]
    assert original["sha256"] == signed["sha256"] and original["sizeBytes"] == signed["bytes"]
    original_body = original_source.read_bytes()
    check_bytes(original_body, original)
    assert original_body.count(ORIGINAL_LINE) == 1
    alternate_body = original_body.replace(ORIGINAL_LINE, ALTERNATE_LINE)
    prior_alternate = engine / "protocol-namespace-preflight-20261120/alternate-protocol.py"
    check_bytes(alternate_body, pin(prior_alternate, 1024))

    historical = directory(engine / "historical-upgrade-r2")
    descriptor_path = historical / "historical-fixture.json"
    descriptor_pin = pin(descriptor_path, 8 * 1024**2)
    descriptor = json.loads(descriptor_path.read_text())
    assert descriptor["schemaVersion"] == 1 and descriptor["historicalRevision"] == HISTORICAL_REVISION
    assert descriptor["appData"] == str(app_data)
    assert descriptor["database"]["file"] == str(app_data / "database/app.sqlite")
    assert descriptor["runtime"]["pythonExecutable"] == str(python_executable)
    pointer_path = runtime / "current-runtime.json"
    journal_path = runtime / "runtime-installation.json"
    pointer_pin = pin(pointer_path, 4096)
    journal_pin = pin(journal_path, 16 * 1024)
    pointer_body = pointer_path.read_bytes()
    journal_body = journal_path.read_bytes()
    check_bytes(pointer_body, pointer_pin)
    check_bytes(journal_body, journal_pin)
    assert pointer_pin["sha256"] == descriptor["runtime"]["pointer"]["sha256"]
    assert json.loads(pointer_body) == pointer
    assert json.loads(journal_body) == report["completedJournal"]
    raster_source = historical / "historical-raster.png"
    raster_pin = pin(raster_source, 1024**2)
    assert raster_pin["path"] == descriptor["project"]["raster"]["source"]["path"]
    raster_body = raster_source.read_bytes()
    check_bytes(raster_body, raster_pin)
    check_bytes(raster_body, descriptor["project"]["raster"]["source"])
    archive_path = historical / "retained-payloads.tar.gz"
    archive_pin = pin(archive_path, 16 * 1024**2)
    assert archive_pin["sha256"] == ARCHIVE_SHA256
    records = read_checkpoint(archive_path, descriptor)
    assert pin(archive_path, 16 * 1024**2) == archive_pin

    state.mkdir()
    inputs.mkdir()
    for name, body in records.items():
        target = state / name
        target.parent.mkdir(parents=True, exist_ok=True)
        write_bytes(target, body)
    for target in (
        state / "runtime/python" / slot,
        state / "runtime/environments" / slot,
        state / "inference-resources",
        inputs / "mounts/environment",
        inputs / "mounts/python",
    ):
        target.mkdir(parents=True)
    write_bytes(state / "runtime/current-runtime.json", pointer_body)
    write_bytes(state / "runtime/runtime-installation.json", journal_body)
    write_bytes(inputs / "checkpoint-29.sqlite", records["database/app.sqlite"], 0o400)
    write_bytes(inputs / "historical-raster.png", raster_body, 0o400)
    write_bytes(inputs / "original-protocol.py", original_body, 0o400)
    write_bytes(inputs / "alternate-protocol.py", alternate_body, 0o400)
    descriptor["database"]["checkpointFile"] = str(inputs / "checkpoint-29.sqlite")
    descriptor["project"]["raster"]["source"]["path"] = str(inputs / "historical-raster.png")
    write_json(inputs / "historical-fixture.json", descriptor)
    write_json(inputs / "protocol-fixture.json", {"schemaVersion": 1, "protocol": "2", "packageIdentity": package})
    write_json(inputs / "profile.json", {
        "schemaVersion": 1,
        "appData": str(app_data),
        "runtimeId": slot,
        "workerRoot": str(worker),
        "pythonExecutable": str(python_executable),
        "sourceReport": source_report,
        "packageIdentity": package,
        "pointer": pointer_pin,
        "journal": journal_pin,
        "originalModule": original,
        "alternateModule": pin(inputs / "alternate-protocol.py", 1024),
        "historicalDescriptor": descriptor_pin,
        "historicalArchive": archive_pin,
        "hostNamespace": {
            "mount": os.readlink("/proc/self/ns/mnt"),
            "user": os.readlink("/proc/self/ns/user"),
        },
    })
    print(inputs / "profile.json")


if __name__ == "__main__":
    if not __debug__:
        raise RuntimeError("Fixture guards require Python assertions")
    os.umask(0o077)
    assert len(sys.argv) == 2, "Supply the fresh packaged-runtime-setup run with package.json"
    prepare(Path(sys.argv[1]))
