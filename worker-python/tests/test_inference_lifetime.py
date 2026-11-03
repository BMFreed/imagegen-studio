"""CPU-only ownership tests; only an owned child ever arms Linux PDEATHSIG.

InvokeAI a61ac4fb install_staging_ledger.py supplies boot/start/inode claims and
the flock pattern. These tests qualify the finite Linux adaptation, not inference.
"""

from __future__ import annotations

import errno
import json
import os
import select
import signal
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path
from typing import cast

import pytest

from imagegen_worker import inference_lifetime as lifetime
from imagegen_worker.inference_lifetime import (
    InferenceLifetimeError,
    ProcessIdentity,
    capture_process_identity,
    read_boot_id,
    recover_regional_transport_leases,
)

pytestmark = pytest.mark.skipif(sys.platform != "linux", reason="Linux lifetime contract")
SOURCE = Path(__file__).resolve().parents[1] / "src"

# The supervisor is the sole subreaper. The pytest process never changes prctl state.
# Worker stdin EOF deliberately does not exit: losing a parent must exercise PDEATHSIG.
SUPERVISOR = r'''
import ctypes,json,os,select,signal,subprocess,sys,time
mode,source=sys.argv[1:]
libc=ctypes.CDLL(None,use_errno=True)
assert libc.prctl(36,1,0,0,0)==0
flag=ctypes.c_int()
assert libc.prctl(37,ctypes.byref(flag),0,0,0)==0 and flag.value==1
worker_code=r"""
import json,os,sys,time
sys.path.insert(0,sys.argv[3])
from imagegen_worker import inference_lifetime as lifetime
parent=int(sys.argv[1]);mode=sys.argv[2]
if mode=='registration-race':
 original=lifetime.os.getppid
 calls=0
 def observed_parent():
  global calls
  calls+=1
  actual=original()
  if calls==1:
   print(json.dumps({'kind':'registration-window','pid':os.getpid(),'parent':actual}),flush=True)
   assert sys.stdin.readline()==''
  return actual
 lifetime.os.getppid=observed_parent
try:
 lifetime.arm_parent_death_guard(parent)
except lifetime.InferenceLifetimeError:
 sys.exit(78)
assert not any(n.split('.')[0] in {'torch','diffusers','transformers'} for n in sys.modules)
print(json.dumps({'kind':'armed','pid':os.getpid(),'parent':os.getppid()}),flush=True)
while True:
 command=sys.stdin.readline()
 if command=='close\n':
  sys.exit(0)
 if command=='':
  time.sleep(.02)
"""
parent_code=r"""
import json,os,subprocess,sys
print(json.dumps({'kind':'parent','pid':os.getpid()}),flush=True)
worker=subprocess.Popen([sys.executable,'-I','-B','-c',sys.argv[1],str(os.getpid()),
                         sys.argv[2],sys.argv[3]],stdin=subprocess.PIPE)
print(json.dumps({'kind':'child','pid':worker.pid}),flush=True)
command=sys.stdin.readline()
if command=='close\n':
 worker.stdin.write(b'close\n');worker.stdin.flush();worker.stdin.close()
 sys.exit(worker.wait(timeout=3))
sys.exit(79)
"""
parent=None;worker_pid=None;worker_status=None;record={};fallback=False
def line(stream):
 value=b''
 while not value.endswith(b'\n'):
  assert select.select([stream],[],[],4)[0], 'fixture handshake timed out'
  byte=os.read(stream.fileno(),1)
  assert byte, 'fixture ended before handshake'
  value+=byte
  assert len(value)<=4096
 return json.loads(value)
def wait_owned(pid,seconds):
 end=time.monotonic()+seconds
 while time.monotonic()<end:
  found,status=os.waitpid(pid,os.WNOHANG)
  if found:return status
  time.sleep(.01)
 return None
try:
 parent=subprocess.Popen([sys.executable,'-I','-B','-c',parent_code,worker_code,mode,source],
                         stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                         text=True,bufsize=1)
 announced=line(parent.stdout)
 assert announced=={'kind':'parent','pid':parent.pid}
 records=[]
 for unused in range(2):
  value=line(parent.stdout);records.append(value);worker_pid=value['pid']
 child=next(value for value in records if value['kind']=='child')
 worker_pid=child['pid']
 ready=next(value for value in records if value['kind']!='child')
 assert ready['pid']==worker_pid
 assert ready['parent']==parent.pid
 assert ready['kind']==('registration-window' if mode=='registration-race' else 'armed')
 if mode=='normal':
  assert parent.poll() is None
  time.sleep(.05)
  assert os.path.exists('/proc/'+str(worker_pid))
  parent.stdin.write('close\n');parent.stdin.flush()
  assert parent.wait(timeout=4)==0
  record={'normal':True,'parentExit':0,'workerGone':not os.path.exists('/proc/'+str(worker_pid))}
 else:
  parent.kill()  # Only the actual parent is killed in the semantic experiment.
  assert parent.wait(timeout=4)==-signal.SIGKILL
  worker_status=wait_owned(worker_pid,2)
  record={'parentExit':parent.returncode,'workerStatus':worker_status,
          'workerSignaled':worker_status is not None and os.WIFSIGNALED(worker_status),
          'workerSignal':os.WTERMSIG(worker_status) if worker_status is not None and
                         os.WIFSIGNALED(worker_status) else None,
          'workerExit':os.WEXITSTATUS(worker_status) if worker_status is not None and
                       os.WIFEXITED(worker_status) else None}
finally:
 # Record the independent result before any fallback signal. Fallback can only fail a test.
 if parent is not None and parent.poll() is None:
  fallback=True;parent.kill();parent.wait(timeout=4)
 if worker_pid is not None and worker_status is None:
  try:
   found,status=os.waitpid(worker_pid,os.WNOHANG)
   if not found:
    fallback=True;os.kill(worker_pid,signal.SIGKILL);os.waitpid(worker_pid,0)
  except ChildProcessError:pass
 record['fallbackCleanup']=fallback
 print(json.dumps(record),flush=True)
'''


def supervised(mode: str) -> dict[str, object]:
    process = subprocess.Popen(
        [sys.executable, "-I", "-B", "-c", SUPERVISOR, mode, str(SOURCE)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(timeout=12)
    except subprocess.TimeoutExpired:
        # A broken fixture is failure, even though all its owned processes still need cleanup.
        os.killpg(process.pid, signal.SIGKILL)
        stdout, stderr = process.communicate(timeout=4)
        pytest.fail(f"Owned lifetime fixture timed out; fallback cleanup: {stdout} {stderr}")
    assert process.returncode == 0, (stdout, stderr)
    value = cast(dict[str, object], json.loads(stdout))
    assert value["fallbackCleanup"] is False, (value, stderr)
    return value


def test_linux_parent_death_guard_kills_idle_child_without_child_kill_assistance() -> None:
    result = supervised("parent-death")
    assert result["parentExit"] == -signal.SIGKILL
    assert result["workerSignaled"] is True
    assert result["workerSignal"] == signal.SIGKILL


def test_linux_parent_death_guard_normal_alive_parent_and_clean_close_control() -> None:
    result = supervised("normal")
    assert result == {
        "normal": True,
        "parentExit": 0,
        "workerGone": True,
        "fallbackCleanup": False,
    }


def test_linux_parent_death_guard_refuses_parent_death_during_registration() -> None:
    result = supervised("registration-race")
    assert result["parentExit"] == -signal.SIGKILL
    assert result["workerExit"] == 78
    assert result["workerSignaled"] is False


def ready_line(process: subprocess.Popen[str], expected: str) -> None:
    assert process.stdout is not None
    assert select.select([process.stdout], [], [], 4)[0], "Owned CPU fixture did not become ready"
    assert process.stdout.readline() == expected


def close_owned_fixture(process: subprocess.Popen[str]) -> None:
    if process.stdin is not None:
        process.stdin.close()
    try:
        code = process.wait(timeout=4)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=4)
        pytest.fail("Owned CPU fixture needed fallback termination; normal close was not proven")
    assert code == 0


def dead_identity() -> ProcessIdentity:
    process = subprocess.Popen(
        [sys.executable, "-I", "-B", "-c", "import sys;print('ready',flush=True);sys.stdin.read()"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
    )
    try:
        ready_line(process, "ready\n")
        identity = capture_process_identity(process.pid)
        assert identity.pid == process.pid
    finally:
        close_owned_fixture(process)
    return identity


@pytest.fixture
def owners() -> tuple[ProcessIdentity, ProcessIdentity]:
    main, worker = dead_identity(), dead_identity()
    assert main.pid != worker.pid
    return main, worker


def private_file(path: Path, payload: bytes) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        assert os.write(descriptor, payload) == len(payload)
    finally:
        os.close(descriptor)


def marked_lease(
    scratch: Path, owners: tuple[ProcessIdentity, ProcessIdentity]
) -> tuple[Path, dict[str, object]]:
    root = scratch / "regional-request-Ab12Cd"
    root.mkdir(mode=0o700)
    identity = root.stat()
    marker: dict[str, object] = {
        "schemaVersion": 1,
        "kind": "regional-transport-owner-v1",
        "bootId": read_boot_id(),
        "main": {"pid": owners[0].pid, "startTicks": owners[0].start_ticks},
        "worker": {"pid": owners[1].pid, "startTicks": owners[1].start_ticks},
        "directory": {"device": str(identity.st_dev), "inode": str(identity.st_ino)},
    }
    private_file(root / ".owner-v1.json", json.dumps(marker).encode())
    private_file(root / "target.png", b"interrupted private target payload")
    return root, marker


def test_dead_owned_transport_is_reclaimed_once_and_legacy_unmarked_is_retained(
    tmp_path: Path, owners: tuple[ProcessIdentity, ProcessIdentity]
) -> None:
    root, _ = marked_lease(tmp_path, owners)
    legacy = tmp_path / "regional-request-Lg12Cd"
    legacy.mkdir(mode=0o700)
    private_file(legacy / "target.png", b"legacy must survive")
    report = recover_regional_transport_leases(tmp_path)
    assert report.reclaimed == 1
    assert report.retained_unmarked == 1
    assert report.diagnostics
    assert not root.exists()
    assert (legacy / "target.png").read_bytes() == b"legacy must survive"
    again = recover_regional_transport_leases(tmp_path)
    assert again.reclaimed == 0 and again.retained_unmarked == 1


@pytest.mark.parametrize("output", ["result.png", "result.png.thumb.webp"])
def test_dead_owned_transport_admits_only_complete_internal_publisher_link_pair(
    tmp_path: Path, owners: tuple[ProcessIdentity, ProcessIdentity], output: str
) -> None:
    root, _ = marked_lease(tmp_path, owners)
    result = root / output
    private_file(result, b"published private bytes")
    os.link(result, root / f".{output}.abc123_4.tmp")
    assert result.stat().st_nlink == 2
    assert recover_regional_transport_leases(tmp_path).reclaimed == 1
    assert not root.exists()


def test_dead_owned_transport_refuses_external_hardlink_and_preserves_every_byte(
    tmp_path: Path, owners: tuple[ProcessIdentity, ProcessIdentity]
) -> None:
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    root, _ = marked_lease(scratch, owners)
    outside = tmp_path / "outside-result.png"
    private_file(root / "result.png", b"external link must survive")
    os.link(root / "result.png", outside)
    before = {p.name: p.read_bytes() for p in root.iterdir()}
    with pytest.raises(InferenceLifetimeError):
        recover_regional_transport_leases(scratch)
    assert {p.name: p.read_bytes() for p in root.iterdir()} == before
    assert outside.read_bytes() == b"external link must survive"
    assert outside.stat().st_nlink == 2


@pytest.mark.parametrize("which", ["main", "worker"])
def test_transport_with_either_actual_owner_alive_is_retained(
    tmp_path: Path, owners: tuple[ProcessIdentity, ProcessIdentity], which: str
) -> None:
    live = capture_process_identity(os.getpid())
    pair = (live, owners[1]) if which == "main" else (owners[0], live)
    root, _ = marked_lease(tmp_path, pair)
    before = {p.name: p.read_bytes() for p in root.iterdir()}
    with pytest.raises(InferenceLifetimeError, match="live or unverifiable"):
        recover_regional_transport_leases(tmp_path)
    assert {p.name: p.read_bytes() for p in root.iterdir()} == before


@pytest.mark.parametrize("which", [0, 1])
def test_transport_with_unverifiable_actual_owner_is_retained(
    tmp_path: Path,
    owners: tuple[ProcessIdentity, ProcessIdentity],
    monkeypatch: pytest.MonkeyPatch,
    which: int,
) -> None:
    root, _ = marked_lease(tmp_path, owners)
    original = cast(Callable[[int], tuple[str, str]], vars(lifetime)["_read_process_state"])

    def denied(pid: int) -> tuple[str, str]:
        if pid == owners[which].pid:
            raise PermissionError(errno.EACCES, "controlled proc identity refusal")
        return original(pid)

    monkeypatch.setattr(lifetime, "_read_process_state", denied)
    with pytest.raises(InferenceLifetimeError, match="live or unverifiable"):
        recover_regional_transport_leases(tmp_path)
    assert (root / "target.png").read_bytes() == b"interrupted private target payload"


@pytest.mark.parametrize(
    "fault", ["version", "extra", "duplicate", "alias", "ticks", "inode", "boot", "oversized"]
)
def test_malformed_or_unbound_marker_preserves_transport(
    tmp_path: Path, owners: tuple[ProcessIdentity, ProcessIdentity], fault: str
) -> None:
    root, marker = marked_lease(tmp_path, owners)
    if fault == "version":
        marker["schemaVersion"] = True
    elif fault == "extra":
        marker["path"] = "/not-an-authority"
    elif fault == "alias":
        marker["worker"] = marker["main"]
    elif fault == "ticks":
        marker["worker"] = {"pid": owners[1].pid, "startTicks": "01"}
    elif fault == "inode":
        marker["directory"] = {"device": str(root.stat().st_dev), "inode": "0"}
    elif fault == "boot":
        marker["bootId"] = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA"
    payload = json.dumps(marker).encode()
    if fault == "duplicate":
        payload = payload.replace(b'"schemaVersion": 1', b'"schemaVersion": 1, "schemaVersion": 1')
    elif fault == "oversized":
        payload += b" " * 4096
    (root / ".owner-v1.json").write_bytes(payload)
    with pytest.raises(InferenceLifetimeError):
        recover_regional_transport_leases(tmp_path)
    assert (root / ".owner-v1.json").read_bytes() == payload
    assert (root / "target.png").read_bytes() == b"interrupted private target payload"


@pytest.mark.parametrize("name", [".owner-v1.json", "target.png"])
def test_marker_and_input_hardlinks_are_never_publisher_pairs(
    tmp_path: Path, owners: tuple[ProcessIdentity, ProcessIdentity], name: str
) -> None:
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    root, _ = marked_lease(scratch, owners)
    outside = tmp_path / "external-link"
    os.link(root / name, outside)
    before = outside.read_bytes()
    with pytest.raises(InferenceLifetimeError):
        recover_regional_transport_leases(scratch)
    assert outside.read_bytes() == before
    assert (root / name).read_bytes() == before


@pytest.mark.parametrize("fault", ["symlink", "directory", "bytes", "files"])
def test_unsafe_unexpected_and_overbudget_children_refuse_without_partial_delete(
    tmp_path: Path, owners: tuple[ProcessIdentity, ProcessIdentity], fault: str
) -> None:
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    root, _ = marked_lease(scratch, owners)
    if fault == "symlink":
        outside = tmp_path / "protected-result"
        outside.write_bytes(b"outside")
        (root / "result.png").symlink_to(outside)
    elif fault == "directory":
        (root / "unexpected-child").mkdir(mode=0o700)
    elif fault == "bytes":
        # Sparse owned fixture exercises metadata bounds without allocating a large payload.
        with (root / "target.png").open("r+b") as handle:
            handle.truncate(192 * 1024 * 1024 + 1)
    else:
        for index in range(31):
            private_file(root / f".result.png.{index:08d}.tmp", b"partial publisher")
    marker = (root / ".owner-v1.json").read_bytes()
    with pytest.raises(InferenceLifetimeError):
        recover_regional_transport_leases(scratch)
    assert (root / ".owner-v1.json").read_bytes() == marker
    assert (root / "target.png").exists()
    if fault == "symlink":
        assert (tmp_path / "protected-result").read_bytes() == b"outside"


def test_changed_directory_inode_refuses_and_preserves_both_owned_versions(
    tmp_path: Path,
    owners: tuple[ProcessIdentity, ProcessIdentity],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root, _ = marked_lease(tmp_path, owners)
    moved = tmp_path / "captured-original"
    original = cast(Callable[[int], dict[str, os.stat_result]], vars(lifetime)["_files"])
    changed = False

    def replace_after_inspection(descriptor: int) -> dict[str, os.stat_result]:
        nonlocal changed
        result = original(descriptor)
        if not changed:
            changed = True
            root.rename(moved)
            root.mkdir(mode=0o700)
            private_file(root / "target.png", b"replacement must survive")
        return result

    monkeypatch.setattr(lifetime, "_files", replace_after_inspection)
    with pytest.raises(InferenceLifetimeError, match="replaced"):
        recover_regional_transport_leases(tmp_path)
    assert (moved / "target.png").read_bytes() == b"interrupted private target payload"
    assert (root / "target.png").read_bytes() == b"replacement must survive"


@pytest.mark.parametrize("fault", ["scratch-link", "scratch-file", "lock-link"])
def test_scratch_and_stable_lock_refuse_links_or_files_without_following_them(
    tmp_path: Path, fault: str
) -> None:
    scratch = tmp_path / "scratch"
    outside = tmp_path / "outside"
    outside.mkdir(mode=0o700)
    private_file(outside / "protected", b"outside must survive")
    if fault == "scratch-link":
        scratch.symlink_to(outside, target_is_directory=True)
    elif fault == "scratch-file":
        private_file(scratch, b"scratch file must survive")
    else:
        scratch.mkdir(mode=0o700)
        (scratch / ".inference-lifetime-v1.lock").symlink_to(outside / "protected")
    with pytest.raises(InferenceLifetimeError):
        recover_regional_transport_leases(scratch)
    assert (outside / "protected").read_bytes() == b"outside must survive"
    if fault == "scratch-file":
        assert scratch.read_bytes() == b"scratch file must survive"
    elif fault == "scratch-link":
        assert scratch.is_symlink()
    else:
        assert (scratch / ".inference-lifetime-v1.lock").is_symlink()


def test_quarantine_resumes_after_one_internal_publisher_link_was_unlinked(
    tmp_path: Path,
    owners: tuple[ProcessIdentity, ProcessIdentity],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root, _ = marked_lease(tmp_path, owners)
    private_file(root / "result.png", b"completed publisher bytes")
    os.link(root / "result.png", root / ".result.png.abc123_4.tmp")
    unlink = os.unlink

    def interrupted(
        path: str | bytes | os.PathLike[str] | os.PathLike[bytes], *, dir_fd: int | None = None
    ) -> None:
        if path == "result.png":
            raise OSError(errno.EIO, "controlled interruption after first publisher unlink")
        unlink(path, dir_fd=dir_fd)

    with monkeypatch.context() as patch:
        patch.setattr(lifetime.os, "unlink", interrupted)
        with pytest.raises(InferenceLifetimeError):
            recover_regional_transport_leases(tmp_path)
    quarantines = list(tmp_path.glob(".regional-reclaim-v1-*"))
    assert len(quarantines) == 1 and not root.exists()
    retained = quarantines[0]
    assert (retained / ".owner-v1.json").is_file()
    assert (retained / "result.png").stat().st_nlink == 1
    assert not (retained / ".result.png.abc123_4.tmp").exists()
    assert recover_regional_transport_leases(tmp_path).reclaimed == 1
    assert recover_regional_transport_leases(tmp_path).reclaimed == 0


def test_lifetime_lock_is_exclusive_through_idle_and_released_on_normal_close(
    tmp_path: Path,
) -> None:
    script = """
import os,sys
sys.path.insert(0,sys.argv[1])
from imagegen_worker.inference_lifetime import owned_inference_lifetime
with owned_inference_lifetime(os.getppid(),sys.argv[2]):
 print('locked',flush=True)
 sys.stdin.readline()
"""
    process = subprocess.Popen(
        [sys.executable, "-I", "-B", "-c", script, str(SOURCE), str(tmp_path)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        ready_line(process, "locked\n")
        lock = tmp_path / ".inference-lifetime-v1.lock"
        before = lock.stat()
        with pytest.raises(InferenceLifetimeError, match="still active"):
            recover_regional_transport_leases(tmp_path)
    finally:
        close_owned_fixture(process)
    assert recover_regional_transport_leases(tmp_path).reclaimed == 0
    after = lock.stat()
    assert (before.st_dev, before.st_ino) == (after.st_dev, after.st_ino)


@pytest.mark.parametrize("mode", ["normal", "unsafe-scratch"])
def test_owned_entry_import_tripwire_requires_guard_and_lock_before_inference_import(
    tmp_path: Path, mode: str
) -> None:
    scratch = tmp_path / "scratch"
    if mode == "normal":
        scratch.mkdir(mode=0o700)
    else:
        scratch.write_bytes(b"not a directory")
    script = r"""
import ctypes,importlib.abc,importlib.util,json,os,signal,sys
sys.path.insert(0,sys.argv[1])
mode=sys.argv[3];calls=[]
class NativeTripwire(importlib.abc.MetaPathFinder,importlib.abc.Loader):
 def find_spec(self,fullname,path=None,target=None):
  if fullname=='imagegen_worker.inference_main':
   assert mode=='normal', 'inference imported before refused lifetime'
   value=ctypes.c_int();libc=ctypes.CDLL(None)
   assert libc.prctl(2,ctypes.byref(value),0,0,0)==0 and value.value==signal.SIGKILL
   assert os.path.isfile(sys.argv[2]+'/.inference-lifetime-v1.lock')
   calls.append(fullname)
   return importlib.util.spec_from_loader(fullname,self)
  if fullname.split('.')[0] in {'torch','PIL','diffusers','transformers'}:
   raise AssertionError('heavy import escaped CPU tripwire')
 def create_module(self,spec):return None
 def exec_module(self,module):
  def main(*,owner_lifetime=False):
   assert owner_lifetime is True
   return 0
  module.main=main
sys.meta_path.insert(0,NativeTripwire())
from imagegen_worker.owned_inference import main
result=main(['--parent-pid',str(os.getppid()),'--scratch-base',sys.argv[2]])
print(json.dumps({'result':result,'imports':calls}),flush=True)
sys.exit(result)
"""
    result = subprocess.run(
        [sys.executable, "-I", "-B", "-c", script, str(SOURCE), str(scratch), mode],
        capture_output=True,
        text=True,
        timeout=6,
        check=False,
    )
    assert result.returncode == (0 if mode == "normal" else 78), result.stderr
    assert json.loads(result.stdout) == {
        "result": result.returncode,
        "imports": ["imagegen_worker.inference_main"] if mode == "normal" else [],
    }
