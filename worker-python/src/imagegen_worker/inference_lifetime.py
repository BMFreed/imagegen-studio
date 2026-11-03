"""Linux ownership for the existing inference child and its disposable regional leases.

InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd provides the nonblocking flock
in working_memory_calibration_store.py and boot/start/inode/atomic-claim recovery
in model_install/install_staging_ledger.py, plus util/no_replace.py's Linux
renameat2. Adapt those owners here. Invoke's
inference is in-process threads; PR_SET_PDEATHSIG is the disclosed Linux adapter
for Studio's separate native child, not another inference loop or process reaper.
"""

from __future__ import annotations

import ctypes
import errno
import json
import os
import re
import signal
import stat
import sys
import uuid
from collections.abc import Generator
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast

OWNED_INFERENCE_CAPABILITY = "linux-owned-inference-v1"
LOCK_NAME = ".inference-lifetime-v1.lock"
OWNER_NAME = ".owner-v1.json"
MAX_OWNER_BYTES = 4096
MAX_FILES = 32
MAX_PAYLOAD_BYTES = 192 * 1024 * 1024
MAX_DIAGNOSTICS = 10
_UUID = r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}"
_DECIMAL = re.compile(r"(?:0|[1-9][0-9]*)\Z")
_POSITIVE = re.compile(r"[1-9][0-9]*\Z")
_REGIONAL = re.compile(r"regional-request-[A-Za-z0-9]{6}\Z")
_RECLAIM = re.compile(rf"\.regional-reclaim-v1-{_UUID}\Z")
_TEMPORARY = re.compile(r"\.(result\.png(?:\.thumb\.webp)?)\.[a-z0-9_]{8}\.tmp\Z")
_PAYLOAD_NAMES = frozenset(
    {
        "bundle.json",
        "target.png",
        "region-0.alpha8",
        "region-1.alpha8",
        "region-2.alpha8",
        "global-positive.alpha8",
        "global-negative.alpha8",
        "result.png",
        "result.png.thumb.webp",
    }
)


class InferenceLifetimeError(RuntimeError):
    """The Linux inference lifetime could not be established safely."""


@dataclass(frozen=True)
class ProcessIdentity:
    pid: int
    start_ticks: str


@dataclass(frozen=True)
class RecoveryReport:
    reclaimed: int
    retained_unmarked: int
    diagnostics: tuple[str, ...]


@dataclass(frozen=True)
class OwnedInferenceLifetime:
    boot_id: str
    main: ProcessIdentity
    worker: ProcessIdentity
    recovery: RecoveryReport


@dataclass(frozen=True)
class _Owner:
    boot_id: str
    main: ProcessIdentity
    worker: ProcessIdentity
    device: str
    inode: str


@dataclass(frozen=True)
class _Scratch:
    path: Path
    descriptor: int
    identity: os.stat_result


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise InferenceLifetimeError(message)


def _linux() -> None:
    _require(sys.platform == "linux" and os.name == "posix", "Owned inference requires Linux.")


def _pid(value: object) -> int:
    _require(type(value) is int and 1 < value <= 2**31 - 1, "Invalid process ID.")
    return cast(int, value)


def read_boot_id() -> str:
    _linux()
    value = Path("/proc/sys/kernel/random/boot_id").read_text(encoding="ascii").strip()
    _require(re.fullmatch(_UUID, value) is not None, "Invalid Linux boot identity.")
    return value


def _read_process_state(pid: int) -> tuple[str, str]:
    descriptor = os.open(f"/proc/{_pid(pid)}/stat", os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
    try:
        content = os.read(descriptor, 64 * 1024 + 1)
    finally:
        os.close(descriptor)
    _require(len(content) <= 64 * 1024, "Linux process identity exceeds its bound.")
    _require(content.startswith(f"{pid} (".encode("ascii")), "Invalid Linux process identity.")
    fields = content.rsplit(b")", 1)[-1].split()
    _require(len(fields) > 19, "Incomplete Linux process identity.")
    state, ticks = fields[0].decode("ascii"), fields[19].decode("ascii")
    _require(len(state) == 1 and state in "RSDZTtXxKWPI", "Unknown Linux process state.")
    _require(_POSITIVE.fullmatch(ticks) is not None, "Invalid Linux process start ticks.")
    return state, ticks


def capture_process_identity(pid: int) -> ProcessIdentity:
    _linux()
    state, ticks = _read_process_state(_pid(pid))
    _require(state not in {"Z", "X", "x"}, "The process has already exited.")
    return ProcessIdentity(pid, ticks)


def arm_parent_death_guard(parent_pid: int) -> None:
    """Arm before native imports; do not signal any nominated or reused PID.

    Linux binds this to the creating parent thread, not every thread of its
    process. Fork children do not inherit it; credential/set-id changes can clear
    it. This owner neither forks inference descendants nor changes credentials.
    """
    _linux()
    parent_pid = _pid(parent_pid)
    _require(os.getppid() == parent_pid, "The expected inference parent has exited.")
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        prctl = libc.prctl
        prctl.argtypes = [ctypes.c_int, *([ctypes.c_ulong] * 4)]
        prctl.restype = ctypes.c_int
        if prctl(1, signal.SIGKILL, 0, 0, 0) != 0:  # PR_SET_PDEATHSIG
            raise InferenceLifetimeError("Cannot arm the Linux parent-death guard.")
        observed = ctypes.c_int()
        if prctl(2, ctypes.addressof(observed), 0, 0, 0) != 0:  # PR_GET_PDEATHSIG
            raise InferenceLifetimeError("Cannot verify the Linux parent-death guard.")
        _require(observed.value == signal.SIGKILL, "Linux parent-death guard differs.")
    except (AttributeError, OSError) as error:
        raise InferenceLifetimeError("Linux parent-death protection is unavailable.") from error
    # Parent death before PR_SET sends no retrospective signal. Close that registration race.
    _require(os.getppid() == parent_pid, "The inference parent exited during registration.")


def _same(left: os.stat_result, right: os.stat_result) -> bool:
    return (left.st_dev, left.st_ino) == (right.st_dev, right.st_ino)


def _private_directory(entry: os.stat_result) -> None:
    _require(
        stat.S_ISDIR(entry.st_mode)
        and entry.st_uid == os.getuid()
        and stat.S_IMODE(entry.st_mode) == 0o700,
        "Inference scratch directory is not private and owned.",
    )


def _assert_scratch(scratch: _Scratch) -> None:
    at_path = scratch.path.lstat()
    _private_directory(at_path)
    _private_directory(os.fstat(scratch.descriptor))
    _require(
        _same(at_path, scratch.identity) and scratch.path.resolve(strict=True) == scratch.path,
        "Inference scratch directory was replaced.",
    )


@contextmanager
def _scratch_lock(scratch_base: str | Path) -> Generator[_Scratch]:
    _linux()
    import fcntl

    value = cast(object, os.fspath(scratch_base))
    _require(
        isinstance(value, str)
        and 0 < len(value) <= 4096
        and "\0" not in value
        and os.path.isabs(value)
        and os.path.normpath(value) == value,
        "Invalid canonical inference scratch path.",
    )
    path = Path(cast(str, value))
    _require(path.resolve(strict=True) == path, "Inference scratch path is not canonical.")
    root_fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    lock_fd: int | None = None
    locked = False
    try:
        scratch = _Scratch(path, root_fd, os.fstat(root_fd))
        _assert_scratch(scratch)
        lock_fd = os.open(
            LOCK_NAME,
            os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC,
            0o600,
            dir_fd=root_fd,
        )
        lock_descriptor = lock_fd
        captured = os.fstat(lock_descriptor)

        def check_lock() -> None:
            current = os.stat(LOCK_NAME, dir_fd=root_fd, follow_symlinks=False)
            at_descriptor = os.fstat(lock_descriptor)
            _require(
                all(
                    stat.S_ISREG(entry.st_mode)
                    and entry.st_uid == os.getuid()
                    and entry.st_nlink == 1
                    and stat.S_IMODE(entry.st_mode) == 0o600
                    for entry in (captured, current, at_descriptor)
                )
                and _same(captured, current)
                and _same(captured, at_descriptor),
                "Inference lifetime lock is unsafe or replaced.",
            )

        check_lock()
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise InferenceLifetimeError(
                "Another owned inference worker is still active."
            ) from error
        locked = True
        _assert_scratch(scratch)
        check_lock()
        os.fsync(lock_fd)
        os.fsync(root_fd)
        yield scratch
    finally:
        if lock_fd is not None:
            if locked:
                fcntl.flock(lock_fd, fcntl.LOCK_UN)
            os.close(lock_fd)
        os.close(root_fd)


def _decimal(value: object, *, positive: bool = False) -> str:
    _require(
        isinstance(value, str)
        and len(value) <= 20
        and (_POSITIVE if positive else _DECIMAL).fullmatch(value) is not None
        and int(value) <= 2**64 - 1,
        "Malformed regional owner number.",
    )
    return cast(str, value)


def _object(value: object, keys: set[str]) -> dict[str, object]:
    _require(isinstance(value, dict), "Malformed regional owner schema.")
    fields = cast(dict[str, object], value)
    _require(set(fields) == keys, "Malformed regional owner schema.")
    return fields


def _process(value: object) -> ProcessIdentity:
    fields = _object(value, {"pid", "startTicks"})
    return ProcessIdentity(_pid(fields["pid"]), _decimal(fields["startTicks"], positive=True))


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        _require(key not in result, "Duplicate regional owner key.")
        result[key] = value
    return result


def _parse_owner(content: bytes) -> _Owner:
    try:
        value = json.loads(content.decode("utf-8"), object_pairs_hook=_unique_object)
    except (UnicodeError, ValueError) as error:
        raise InferenceLifetimeError("Regional owner marker is unreadable.") from error
    owner = _object(value, {"schemaVersion", "kind", "bootId", "main", "worker", "directory"})
    _require(
        type(owner["schemaVersion"]) is int
        and owner["schemaVersion"] == 1
        and owner["kind"] == "regional-transport-owner-v1"
        and isinstance(owner["bootId"], str)
        and re.fullmatch(_UUID, owner["bootId"]) is not None,
        "Unsupported regional owner marker.",
    )
    directory = _object(owner["directory"], {"device", "inode"})
    parsed = _Owner(
        cast(str, owner["bootId"]),
        _process(owner["main"]),
        _process(owner["worker"]),
        _decimal(directory["device"]),
        _decimal(directory["inode"]),
    )
    _require(parsed.main.pid != parsed.worker.pid, "Regional owner parent and worker must differ.")
    return parsed


def _stable_fields(entry: os.stat_result) -> tuple[int, ...]:
    return (
        entry.st_dev,
        entry.st_ino,
        entry.st_mode,
        entry.st_uid,
        entry.st_size,
        entry.st_mtime_ns,
        entry.st_ctime_ns,
    )


def _read_owner(directory_fd: int) -> tuple[_Owner, bytes] | None:
    try:
        descriptor = os.open(
            OWNER_NAME,
            os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC,
            dir_fd=directory_fd,
        )
    except FileNotFoundError:
        return None
    try:
        before = os.fstat(descriptor)
        _require(
            stat.S_ISREG(before.st_mode)
            and before.st_uid == os.getuid()
            and before.st_nlink == 1
            and stat.S_IMODE(before.st_mode) == 0o600
            and 0 < before.st_size <= MAX_OWNER_BYTES,
            "Regional owner marker is unsafe.",
        )
        content = bytearray()
        while len(content) <= MAX_OWNER_BYTES:
            part = os.read(descriptor, MAX_OWNER_BYTES + 1 - len(content))
            if not part:
                break
            content.extend(part)
        after = os.fstat(descriptor)
        at_path = os.stat(OWNER_NAME, dir_fd=directory_fd, follow_symlinks=False)
        _require(
            len(content) == before.st_size
            and _stable_fields(before) == _stable_fields(after) == _stable_fields(at_path)
            and after.st_nlink == at_path.st_nlink == 1,
            "Regional owner marker changed during inspection.",
        )
        data = bytes(content)
        return _parse_owner(data), data
    finally:
        os.close(descriptor)


def _owner_state(
    boot_id: str, identity: ProcessIdentity, current_boot: str
) -> Literal["dead", "live", "unknown"]:
    if boot_id != current_boot:
        return "dead"
    try:
        state, ticks = _read_process_state(identity.pid)
    except OSError as error:
        return "dead" if error.errno in {errno.ENOENT, errno.ESRCH} else "unknown"
    except (InferenceLifetimeError, UnicodeError, ValueError):
        return "unknown"
    if ticks != identity.start_ticks or state in {"Z", "X", "x"}:
        return "dead"
    return "live"


def _assert_dead(owner: _Owner, current_boot: str) -> None:
    _require(
        _owner_state(owner.boot_id, owner.main, current_boot) == "dead"
        and _owner_state(owner.boot_id, owner.worker, current_boot) == "dead",
        "Regional transport still has a live or unverifiable owner; it was retained.",
    )


def _assert_lease(scratch: _Scratch, name: str, descriptor: int) -> os.stat_result:
    _assert_scratch(scratch)
    captured = os.fstat(descriptor)
    current = os.stat(name, dir_fd=scratch.descriptor, follow_symlinks=False)
    _private_directory(captured)
    _private_directory(current)
    _require(
        _same(captured, current)
        and (scratch.path / name).resolve(strict=True) == scratch.path / name,
        "Regional transport directory was replaced.",
    )
    return captured


def _names(directory_fd: int) -> list[str]:
    names: list[str] = []
    with os.scandir(directory_fd) as entries:
        for entry in entries:
            _require(len(names) < MAX_FILES, "Regional transport contains too many files.")
            names.append(entry.name)
    return names


def _files(directory_fd: int) -> dict[str, os.stat_result]:
    entries: dict[str, os.stat_result] = {}
    groups: dict[tuple[int, int], list[str]] = {}
    total = 0
    for name in _names(directory_fd):
        _require(
            name == OWNER_NAME or name in _PAYLOAD_NAMES or _TEMPORARY.fullmatch(name) is not None,
            "Regional transport contains an unexpected file; it was retained.",
        )
        entry = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        _require(
            stat.S_ISREG(entry.st_mode)
            and entry.st_uid == os.getuid()
            and stat.S_IMODE(entry.st_mode) == 0o600,
            "Regional transport contains an unsafe file; it was retained.",
        )
        total += entry.st_size  # Count both names of a publisher pair conservatively.
        _require(total <= MAX_PAYLOAD_BYTES, "Regional transport exceeds its cleanup byte bound.")
        entries[name] = entry
        groups.setdefault((entry.st_dev, entry.st_ino), []).append(name)
    for names in groups.values():
        entry = entries[names[0]]
        if len(names) == 1 and entry.st_nlink == 1:
            continue
        # generation_artifacts.py/candidate_thumbnail.py publish with link(temp, destination)
        # before unlinking temp. Only that exact internal two-link crash window is admitted.
        temporary = [name for name in names if _TEMPORARY.fullmatch(name)]
        match = _TEMPORARY.fullmatch(temporary[0]) if len(temporary) == 1 else None
        _require(
            len(names) == 2
            and match is not None
            and set(names) == {temporary[0], match.group(1)}
            and all(entries[name].st_nlink == 2 for name in names),
            "Regional transport contains unaccounted hardlinks; it was retained.",
        )
    return entries


def _delete_files(directory_fd: int, expected: dict[str, os.stat_result]) -> None:
    current_files = _files(directory_fd)
    _require(
        set(current_files) == set(expected)
        and all(
            _stable_fields(current_files[name]) == _stable_fields(before)
            and current_files[name].st_nlink == before.st_nlink
            for name, before in expected.items()
        ),
        "Regional transport changed before deletion.",
    )
    remaining = set(expected)
    # The owner is the recovery authority. Keep it until every payload has been removed.
    for name in sorted(remaining - {OWNER_NAME}) + [OWNER_NAME]:
        _require(set(_names(directory_fd)) == remaining, "Regional transport file set changed.")
        descriptor = os.open(
            name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=directory_fd
        )
        try:
            current = os.fstat(descriptor)
            at_path = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
            before = expected[name]
            peers = [peer for peer in remaining if _same(expected[peer], before)]
            _require(
                _same(current, before)
                and _stable_fields(current) == _stable_fields(at_path)
                and current.st_uid == before.st_uid
                and current.st_mode == before.st_mode
                and current.st_size == before.st_size
                and current.st_mtime_ns == before.st_mtime_ns
                and (before.st_nlink == 2 or current.st_ctime_ns == before.st_ctime_ns)
                and current.st_nlink == at_path.st_nlink == len(peers),
                "Regional transport file changed before unlink.",
            )
            os.unlink(name, dir_fd=directory_fd)
            _require(
                os.fstat(descriptor).st_nlink == len(peers) - 1,
                "Regional transport acquired an unaccounted hardlink.",
            )
            remaining.remove(name)
            os.fsync(directory_fd)
        finally:
            os.close(descriptor)
    _require(not _names(directory_fd), "Regional transport changed during deletion.")


def _rename_noreplace(directory_fd: int, source: str, destination: str) -> None:
    """Invoke util/no_replace.py's Linux rename, anchored to the captured private root."""
    libc = ctypes.CDLL(None, use_errno=True)
    renameat2 = getattr(libc, "renameat2", None)
    if renameat2 is None:
        raise InferenceLifetimeError("Atomic regional quarantine rename is unavailable.")
    renameat2.argtypes = [
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_uint,
    ]
    renameat2.restype = ctypes.c_int
    if renameat2(directory_fd, os.fsencode(source), directory_fd, os.fsencode(destination), 1) != 0:
        code = ctypes.get_errno()
        raise OSError(code, "Atomic regional quarantine rename failed.")


def _recover_locked(scratch: _Scratch, boot_id: str) -> RecoveryReport:
    reclaimed = 0
    retained = 0
    diagnostics: list[str] = []
    with os.scandir(scratch.descriptor) as entries:
        for entry in entries:
            name = entry.name
            quarantine = _RECLAIM.fullmatch(name) is not None
            if not quarantine and _REGIONAL.fullmatch(name) is None:
                continue
            _assert_scratch(scratch)
            try:
                directory_fd = os.open(
                    name,
                    os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                    dir_fd=scratch.descriptor,
                )
            except FileNotFoundError:
                continue
            try:
                captured = _assert_lease(scratch, name, directory_fd)
                owner_record = _read_owner(directory_fd)
                if owner_record is None:
                    if quarantine and not _names(directory_fd):
                        _assert_lease(scratch, name, directory_fd)
                        os.rmdir(name, dir_fd=scratch.descriptor)
                        os.fsync(scratch.descriptor)
                        reclaimed += 1
                    else:
                        retained += 1
                        if len(diagnostics) < MAX_DIAGNOSTICS:
                            diagnostics.append(f"Unmarked regional transport retained: {name}")
                    continue
                owner, marker_bytes = owner_record
                _require(
                    owner.device == str(captured.st_dev) and owner.inode == str(captured.st_ino),
                    "Regional owner directory identity differs; it was retained.",
                )
                _assert_dead(owner, boot_id)
                files = _files(directory_fd)
                if not quarantine:
                    next_name = f".regional-reclaim-v1-{uuid.uuid4()}"
                    _assert_lease(scratch, name, directory_fd)
                    _rename_noreplace(scratch.descriptor, name, next_name)
                    os.fsync(scratch.descriptor)
                    name = next_name
                _assert_lease(scratch, name, directory_fd)
                _require(
                    _read_owner(directory_fd) == (owner, marker_bytes),
                    "Quarantined regional ownership changed.",
                )
                _assert_dead(owner, boot_id)
                _delete_files(directory_fd, files)
                _assert_lease(scratch, name, directory_fd)
                os.rmdir(name, dir_fd=scratch.descriptor)
                os.fsync(scratch.descriptor)
                reclaimed += 1
            finally:
                os.close(directory_fd)
    return RecoveryReport(reclaimed, retained, tuple(diagnostics))


def recover_regional_transport_leases(scratch_base: str | Path) -> RecoveryReport:
    """Model-free recovery entry; serialize against every owned native worker."""
    try:
        boot_id = read_boot_id()
        with _scratch_lock(scratch_base) as scratch:
            return _recover_locked(scratch, boot_id)
    except (OSError, UnicodeError, ValueError) as error:
        raise InferenceLifetimeError(
            "Regional transport recovery could not be verified."
        ) from error


@contextmanager
def owned_inference_lifetime(
    parent_pid: int, scratch_base: str | Path
) -> Generator[OwnedInferenceLifetime]:
    """Hold the stable lock through native qualification, idle stdin and request execution."""
    arm_parent_death_guard(parent_pid)
    with ExitStack() as stack:
        try:
            boot_id = read_boot_id()
            main = capture_process_identity(parent_pid)
            worker = capture_process_identity(os.getpid())
            _require(os.getppid() == parent_pid, "The inference parent exited before admission.")
            scratch = stack.enter_context(_scratch_lock(scratch_base))
            recovery = _recover_locked(scratch, boot_id)
        except (OSError, UnicodeError, ValueError) as error:
            raise InferenceLifetimeError(
                "Owned inference startup could not be verified."
            ) from error
        yield OwnedInferenceLifetime(boot_id, main, worker, recovery)
