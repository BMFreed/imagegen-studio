#!/usr/bin/python3
"""Signal only the enrolled Main of the private X11 model-install qualification."""

import json
import os
from pathlib import Path
import re
import signal
import sys


def identity(pid):
    entry = Path('/proc') / str(pid)
    if entry.stat().st_uid != os.getuid():
        raise RuntimeError('Unexpected process owner.')
    stat = (entry / 'stat').read_text().rsplit(')', 1)[1].split()
    group = (entry / 'cgroup').read_text().strip()
    return int(stat[1]), stat[19], group


def main():
    action, main_pid, wrapper_pid, controller_pid, start, group, database, temporary = sys.argv[1:]
    if action not in ('verify', 'kill'):
        raise RuntimeError('Unexpected private fault action.')
    main_pid, wrapper_pid, controller_pid = map(int, (main_pid, wrapper_pid, controller_pid))
    if min(main_pid, wrapper_pid, controller_pid) <= 1 or main_pid == controller_pid:
        raise RuntimeError('Invalid owned Main or launcher identity.')
    if not re.fullmatch(r'/[A-Za-z0-9/._@-]+/igs-model-install-interruption-\d{8}-r[1-9]\d*\.scope', group):
        raise RuntimeError('The process fault requires its dedicated private test scope.')
    expected = f'0::{group}'
    if (os.getppid() != controller_pid or identity(os.getpid())[2] != expected
            or identity(controller_pid)[2] != expected):
        raise RuntimeError('The controller and fault helper must share the private test scope.')
    wrapper_parent, _, wrapper_group = identity(wrapper_pid)
    if wrapper_parent != controller_pid or wrapper_group != expected:
        raise RuntimeError('The captured wrapper is not a child of the controller.')

    with_pidfd = os.pidfd_open(main_pid, 0)
    try:
        parent, current_start, current_group = identity(main_pid)
        if current_start != start or current_group != expected:
            raise RuntimeError('The enrolled Main process identity changed.')
        ancestry = [main_pid]
        while ancestry[-1] != wrapper_pid:
            if parent <= 1 or parent in ancestry or len(ancestry) == 8:
                raise RuntimeError('The enrolled Main is outside the spawned AppImage.')
            ancestry.append(parent)
            parent, _, parent_group = identity(parent)
            if parent_group != expected:
                raise RuntimeError('The AppImage process tree left the private test scope.')
        if parent != controller_pid:
            raise RuntimeError('The AppImage process tree does not lead to the captured controller.')
        proc = Path('/proc') / str(main_pid)
        executable = (proc / 'exe').resolve(strict=True)
        if executable.name != 'imagegen-studio' or not executable.is_relative_to(temporary):
            raise RuntimeError('The enrolled Main is not running the private AppImage extraction.')
        database = Path(database)
        db_stat = database.stat()
        if database.resolve(strict=True) != database or db_stat.st_uid != os.getuid():
            raise RuntimeError('The private SQLite path changed.')
        db_identity = (db_stat.st_dev, db_stat.st_ino)
        for descriptor in (proc / 'fd').iterdir():
            try:
                if os.readlink(descriptor) != str(database):
                    continue
                opened = descriptor.stat()
                if (opened.st_dev, opened.st_ino) == db_identity:
                    break
            except FileNotFoundError:
                continue
        else:
            raise RuntimeError('The enrolled Main does not hold the private SQLite file.')
        if action == 'kill':
            signal.pidfd_send_signal(with_pidfd, signal.SIGKILL)
    finally:
        os.close(with_pidfd)
    print(json.dumps({
        'signalRequested': action == 'kill', 'pidfd': True, 'pid': main_pid, 'start': start,
        'group': group, 'signal': 'SIGKILL' if action == 'kill' else None, 'ancestry': ancestry,
        'database': {'path': str(database), 'device': str(db_identity[0]), 'inode': str(db_identity[1])},
    }))


if __name__ == '__main__':
    main()
