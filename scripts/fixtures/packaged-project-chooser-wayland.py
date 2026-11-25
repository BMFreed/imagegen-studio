#!/usr/bin/python3
"""Run one packaged chooser test with a private virtual KWin and a private session bus."""
import ast
import json
import os
from pathlib import Path
import pwd
import re
import select
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time

SOCKET = 'igs-chooser'
HOST_SESSION_KEYS = (
    'AT_SPI_BUS_ADDRESS',
    'DBUS_SESSION_BUS_ADDRESS',
    'DBUS_STARTER_ADDRESS',
    'DBUS_STARTER_BUS_TYPE',
    'DESKTOP_STARTUP_ID',
    'DISPLAY',
    'IMAGEGEN_CHOOSER_KWIN_PID',
    'IMAGEGEN_CHOOSER_SYSTEMD_RUNTIME_DIR',
    'IMAGEGEN_CHOOSER_X11_PID',
    'KDE_FULL_SESSION',
    'SESSION_MANAGER',
    'WAYLAND_DISPLAY',
    'WAYLAND_SOCKET',
    'XAUTHORITY',
    'XDG_ACTIVATION_TOKEN',
    'XDG_RUNTIME_DIR',
)


def forward_signal(signum, _frame):
    raise SystemExit(128 + signum)


def run(command, **options):
    code = subprocess.call(command, **options)
    return code if code >= 0 else 128 - code


def wait_socket(server, filename):
    end = time.monotonic() + 12
    while time.monotonic() < end:
        if server.poll() is not None:
            raise RuntimeError(f'Virtual KWin exited with status {server.returncode}.')
        try:
            if stat.S_ISSOCK(filename.lstat().st_mode):
                return
        except FileNotFoundError:
            pass
        time.sleep(0.08)
    raise RuntimeError('Virtual KWin did not publish its private socket.')


def run_with_keyboard(command, binary):
    # The seat must advertise a keyboard before Chromium starts and keep it
    # available across the individual short-lived input clients.
    with subprocess.Popen(
        [binary, '--hold'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True,
    ) as hold:
        try:
            if not select.select([hold.stdout], [], [], 6)[0]:
                raise RuntimeError('The private keyboard did not become ready.')
            ready = json.loads(hold.stdout.readline())
            if (hold.poll() is not None or ready['action'] != '--hold'
                    or ready['interface'] != 'org_kde_kwin_fake_input'
                    or ready['boundVersion'] != 4):
                raise RuntimeError('The private compositor keyboard is unavailable.')
            print(f'Private Wayland keyboard ready: {json.dumps(ready)}',
                  file=sys.stderr, flush=True)
            return run(command)
        finally:
            hold.stdin.close()
            try:
                if hold.wait(timeout=6) != 0:
                    raise RuntimeError('The private keyboard did not exit normally.')
            except subprocess.TimeoutExpired:
                hold.kill()
                hold.wait()
                raise


def start_private_session(command):
    runtime = Path(os.environ['XDG_RUNTIME_DIR'])
    artifacts = Path(pwd.getpwuid(os.getuid()).pw_dir) / '.codex/artifacts/imagegen-studio'
    profile = Path(os.environ['HOME'])
    if (runtime.resolve() != runtime or runtime.parent != artifacts
            or stat.S_IMODE(runtime.stat().st_mode) != 0o700
            or runtime.stat().st_uid != os.getuid()
            or artifacts not in profile.parents
            or 'DISPLAY' in os.environ or 'WAYLAND_SOCKET' in os.environ):
        raise RuntimeError('The private Wayland launcher requires its isolated session.')
    keyboard = os.environ.get('IMAGEGEN_WAYLAND_KEYBOARD_HELPER')
    scenario = os.environ.get('IMAGEGEN_LINUX_PACKAGE_OFFLINE_PROJECT')
    if keyboard is not None:
        if scenario not in ('home-recovery-keyboard', 'model-install-history', 'trash', 'home-scale',
                            'workspace-trash-restore', 'application-updates-keyboard'):
            raise RuntimeError('The private keyboard belongs to a supported keyboard test.')
        binary = Path(keyboard)
        if (not re.fullmatch(r'/[A-Za-z0-9/_.-]+', keyboard)
                or binary.resolve(strict=True) != binary or artifacts not in binary.parents
                or not binary.is_file() or binary.stat().st_uid != os.getuid()
                or not os.access(binary, os.X_OK)):
            raise RuntimeError('Use the exact owned keyboard helper.')
        applications = Path(os.environ['XDG_DATA_HOME']) / 'applications'
        assert profile in applications.parents and applications.parent.resolve() == applications.parent
        applications.mkdir(mode=0o700)
        entry = applications / 'org.imagegen.StudioQualificationKeyboard.desktop'
        with entry.open('x') as desktop:
            desktop.write('[Desktop Entry]\nType=Application\n'
                          'Name=ImageGen Studio Qualification Keyboard\n'
                          f'Exec={binary}\n'
                          'X-KDE-Wayland-Interfaces=org_kde_kwin_fake_input\n')
    if scenario == 'model-install-history':
        mesa = Path('/usr/share/glvnd/egl_vendor.d/50_mesa.json')
        if keyboard is None or not mesa.is_file():
            raise RuntimeError('Install Queue requires a private keyboard and software Mesa EGL.')
        os.environ.update(
            __EGL_VENDOR_LIBRARY_FILENAMES=str(mesa),
            LIBGL_ALWAYS_SOFTWARE='1',
            GALLIUM_DRIVER='llvmpipe',
        )
    address = subprocess.check_output(
        [
            '/usr/bin/gdbus', 'call', '--session', '--dest', 'org.a11y.Bus',
            '--object-path', '/org/a11y/bus', '--method', 'org.a11y.Bus.GetAddress',
        ],
        text=True,
        timeout=8,
    )
    (accessibility_bus,) = ast.literal_eval(address)
    if not accessibility_bus.startswith('unix:'):
        raise RuntimeError('The private accessibility bus is not a Unix endpoint.')
    os.environ['AT_SPI_BUS_ADDRESS'] = accessibility_bus
    subprocess.run(
        ['/usr/bin/dbus-update-activation-environment', 'AT_SPI_BUS_ADDRESS'],
        check=True,
        timeout=5,
    )
    server = subprocess.Popen(
        [
            '/usr/bin/setpriv', '--no-new-privs',
            '/usr/bin/kwin_wayland', '--virtual', '--socket', SOCKET,
            '--width', '1440', '--height', '900',
            '--no-lockscreen', '--no-global-shortcuts', '--no-kactivities',
        ],
        stdin=subprocess.DEVNULL,
    )
    try:
        wait_socket(server, runtime / SOCKET)
        subprocess.run(
            [
                '/usr/bin/gdbus', 'call', '--session', '--dest', 'org.freedesktop.DBus',
                '--object-path', '/org/freedesktop/DBus', '--method',
                'org.freedesktop.DBus.StartServiceByName',
                'org.freedesktop.impl.portal.desktop.kde', '0',
            ],
            check=True,
            timeout=12,
            stdout=subprocess.DEVNULL,
        )
        os.environ['IMAGEGEN_CHOOSER_KWIN_PID'] = str(server.pid)
        print(f'Private Wayland socket {runtime / SOCKET}, KWin PID={server.pid}',
              file=sys.stderr, flush=True)
        if keyboard is not None:
            return run_with_keyboard(command, keyboard)
        return run(command)
    finally:
        if server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=6)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()


def remove_runtime(runtime):
    # The private D-Bus finishes before xdg-document-portal releases FUSE.
    # Do not traverse a still-mounted test document directory.
    end = time.monotonic() + 8
    while time.monotonic() < end:
        mount_paths = [
            line.split()[4] for line in Path('/proc/self/mountinfo').read_text().splitlines()
        ]
        if not any(item == runtime or item.startswith(runtime + '/') for item in mount_paths):
            shutil.rmtree(runtime)
            return
        time.sleep(0.1)
    raise RuntimeError(f'Private portal mount did not settle at {runtime}.')


def launch(command):
    actual_home = Path(pwd.getpwuid(os.getuid()).pw_dir)
    artifacts = actual_home / '.codex/artifacts/imagegen-studio'
    scratch = Path(tempfile.gettempdir())
    if scratch.resolve() != scratch or artifacts not in scratch.parents:
        raise RuntimeError('Use a short owned TMPDIR inside the ImageGen Studio artifact root.')
    manager_runtime = os.environ.get('XDG_RUNTIME_DIR')
    env = {key: value for key, value in os.environ.items() if key not in HOST_SESSION_KEYS}
    # KIO appends its own socket name inside XDG_RUNTIME_DIR. Keep that
    # directory directly under the artifact root to fit Unix socket addresses.
    with tempfile.TemporaryDirectory(prefix='wl-', dir=scratch) as directory:
        tmp = Path(directory)
        runtime = tempfile.mkdtemp(prefix='w', dir=artifacts)
        env.update(
            HOME=directory,
            WAYLAND_DISPLAY=SOCKET,
            XDG_RUNTIME_DIR=runtime,
            XDG_CURRENT_DESKTOP='KDE',
            XDG_SESSION_TYPE='wayland',
            QT_QPA_PLATFORM='wayland',
            QT_LINUX_ACCESSIBILITY_ALWAYS_ON='1',
            GDK_BACKEND='wayland',
            GSETTINGS_BACKEND='memory',
            GIO_USE_VFS='local',
            LC_ALL='C.UTF-8',
        )
        for key, leaf in (
            ('XDG_CONFIG_HOME', 'c'), ('XDG_DATA_HOME', 'd'), ('XDG_CACHE_HOME', 'cache'),
            ('XDG_STATE_HOME', 's'),
        ):
            folder = tmp / leaf
            folder.mkdir(mode=0o700)
            env[key] = str(folder)
        if manager_runtime:
            env['IMAGEGEN_CHOOSER_SYSTEMD_RUNTIME_DIR'] = manager_runtime
        try:
            return run(
                [
                    '/usr/bin/dbus-run-session', '--dbus-daemon=/usr/bin/dbus-daemon', '--',
                    sys.executable, __file__, '--session-child', *command,
                ],
                env=env,
            )
        finally:
            remove_runtime(runtime)


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, forward_signal)
    signal.signal(signal.SIGHUP, forward_signal)
    arguments = sys.argv[1:]
    if arguments[:1] == ['--session-child'] and len(arguments) > 1:
        raise SystemExit(start_private_session(arguments[1:]))
    if arguments[:1] != ['--'] or len(arguments) == 1:
        raise SystemExit('Provide one command after --.')
    raise SystemExit(launch(arguments[1:]))
