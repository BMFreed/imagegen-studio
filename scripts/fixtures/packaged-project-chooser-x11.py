#!/usr/bin/python3
"""Launch one command with a privately authenticated Xvfb display and D-Bus session."""
import argparse
import os
from pathlib import Path
import select
import signal
import struct
import subprocess
import sys
import tempfile

HOST_SESSION_KEYS = (
    'AT_SPI_BUS_ADDRESS',
    'DBUS_SESSION_BUS_ADDRESS',
    'DBUS_STARTER_ADDRESS',
    'DBUS_STARTER_BUS_TYPE',
    'DESKTOP_STARTUP_ID',
    'DISPLAY',
    'IMAGEGEN_CHOOSER_SYSTEMD_RUNTIME_DIR',
    'SESSION_MANAGER',
    'WAYLAND_DISPLAY',
    'WAYLAND_SOCKET',
    'XAUTHORITY',
    'XDG_ACTIVATION_TOKEN',
    'XDG_RUNTIME_DIR',
)


def create_authority(path):
    fields = (b'', b'', b'MIT-MAGIC-COOKIE-1', os.urandom(16))
    # FamilyWild and an empty display number cover the yet unassigned display.
    entry = struct.pack('!H', 65535)
    entry += b''.join(struct.pack('!H', len(field)) + field for field in fields)
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as auth:
        auth.write(entry)


def stop_server(server):
    if server.poll() is None:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()


def main(xvfb, command):
    if command[:1] == ['--']:
        command = command[1:]
    if not command:
        raise SystemExit('Provide a command after --.')
    env = {key: value for key, value in os.environ.items() if key not in HOST_SESSION_KEYS}
    env.update(
        GDK_BACKEND='x11',
        GIO_USE_VFS='local',
        GSETTINGS_BACKEND='memory',
        QT_QPA_PLATFORM='xcb',
        XDG_CURRENT_DESKTOP='GNOME',
        XDG_SESSION_TYPE='x11',
    )

    def interrupted(signum, _frame):
        raise SystemExit(128 + signum)

    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGHUP, interrupted)
    with tempfile.TemporaryDirectory(prefix='igs-x11-') as directory:
        temporary = Path(directory)
        for kind in ('CACHE', 'CONFIG', 'DATA', 'STATE'):
            location = temporary / kind.lower()
            location.mkdir(mode=0o700)
            env[f'XDG_{kind}_HOME'] = str(location)
        runtime = temporary / 'runtime'
        runtime.mkdir(mode=0o700)
        env['XDG_RUNTIME_DIR'] = str(runtime)
        if host_runtime := os.environ.get('XDG_RUNTIME_DIR'):
            env['IMAGEGEN_CHOOSER_SYSTEMD_RUNTIME_DIR'] = host_runtime
        authority = temporary / 'Xauthority'
        create_authority(authority)
        read_fd, write_fd = os.pipe()
        server = None
        try:
            try:
                server = subprocess.Popen(
                    [
                        str(xvfb), '-displayfd', str(write_fd), '-auth', str(authority),
                        '-nolisten', 'tcp', '-screen', '0', '1440x900x24', '-noreset',
                    ],
                    env=env,
                    pass_fds=(write_fd,),
                    stdin=subprocess.DEVNULL,
                )
            finally:
                os.close(write_fd)
            if not select.select([read_fd], [], [], 10)[0]:
                raise RuntimeError('Xvfb did not report a display within 10 seconds.')
            number = os.read(read_fd, 32).strip()
            if not number.isdigit() or server.poll() is not None:
                raise RuntimeError('Xvfb exited or did not return a display number.')
            display = ':' + number.decode('ascii')
            env.update(
                DISPLAY=display,
                XAUTHORITY=str(authority),
                IMAGEGEN_CHOOSER_X11_PID=str(server.pid),
            )
            print(f'Isolated DISPLAY={display} Xvfb PID={server.pid}', file=sys.stderr, flush=True)
            status = subprocess.call(
                ['/usr/bin/dbus-run-session', '--dbus-daemon=/usr/bin/dbus-daemon', '--', *command],
                env=env,
            )
            return status if status >= 0 else 128 - status
        finally:
            os.close(read_fd)
            if server is not None:
                stop_server(server)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--xvfb', type=Path, default=Path('/usr/bin/Xvfb'))
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    raise SystemExit(main(args.xvfb.resolve(strict=True), args.command))
