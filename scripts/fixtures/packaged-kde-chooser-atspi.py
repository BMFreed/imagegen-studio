"""Operate one owned KDE portal chooser on the isolated AT-SPI bus."""

import argparse
import json
import os
from pathlib import Path
import time

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi, GLib


def wait_for(observe, message):
    context = GLib.MainContext.default()
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        while context.pending():
            context.iteration(False)
        result = observe()
        if result:
            return result
        time.sleep(0.08)
    raise RuntimeError(message)


def children(parent):
    for index in range(parent.get_child_count()):
        child = parent.get_child_at_index(index)
        if child is not None:
            yield child


def showing(obj):
    return obj.get_state_set().contains(Atspi.StateType.SHOWING)


def owned_dialog(pid, title):
    for app in children(Atspi.get_desktop(0)):
        if app.get_process_id() != pid:
            continue
        for dialog in children(app):
            if dialog.get_role() == Atspi.Role.DIALOG and showing(dialog):
                if dialog.get_name() == title and dialog.get_process_id() == pid:
                    yield dialog


def single(items, description):
    matches = list(items)
    if len(matches) != 1:
        raise RuntimeError(f"Expected one {description}, found {len(matches)}.")
    return matches[0]


def controls(parent):
    # The filename and action controls are outside the file/place list contents.
    data_roles = {Atspi.Role.LIST, Atspi.Role.TABLE, Atspi.Role.TREE, Atspi.Role.TREE_TABLE}
    for child in children(parent):
        if child.get_role() not in data_roles and showing(child):
            yield child
            yield from controls(child)


def named_control(dialog, role, name):
    return single(
        (obj for obj in controls(dialog) if obj.get_role() == role and obj.get_name() == name),
        f"{name} chooser control",
    )


def press(button):
    action = button.get_action_iface()
    if action is None:
        raise RuntimeError("The chooser button has no AT-SPI action.")
    index = single(
        (index for index in range(action.get_n_actions()) if action.get_action_name(index) == "Press"),
        "chooser Press action",
    )
    wait_for(
        lambda: button.get_state_set().contains(Atspi.StateType.ENABLED),
        "The chooser button stayed disabled.",
    )
    if not action.do_action(index):
        raise RuntimeError("The chooser did not accept the AT-SPI action.")


def choose(pid, title, filename):
    dialog = single(wait_for(lambda: list(owned_dialog(pid, title)), "Chooser did not appear."), title)
    if filename is not None:
        combo = named_control(dialog, Atspi.Role.COMBO_BOX, "Name:")
        field = single(
            (obj for obj in children(combo) if obj.get_role() == Atspi.Role.TEXT and showing(obj)),
            "chooser filename field",
        )
        editor = field.get_editable_text_iface()
        text = field.get_text_iface()
        if editor is None or text is None or not editor.set_text_contents(str(filename)):
            raise RuntimeError("The chooser did not accept the selected filename.")
        wait_for(
            lambda: Atspi.Text.get_text(text, 0, -1) == str(filename),
            "The chooser filename changed.",
        )

    press(named_control(dialog, Atspi.Role.PUSH_BUTTON, "Open" if filename else "Cancel"))
    wait_for(lambda: not list(owned_dialog(pid, title)), "Chooser did not close.")
    return {
        "pid": pid,
        "title": title,
        "action": "select" if filename else "dismiss",
        "selectedPath": str(filename) if filename else None,
        "closed": True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", required=True, type=int)
    parser.add_argument("--title", required=True, choices=("Import Project", "Locate Project"))
    parser.add_argument("--select", type=Path)
    args = parser.parse_args()
    if args.pid <= 1 or not os.environ.get("AT_SPI_BUS_ADDRESS"):
        parser.error("Supply the owned portal PID and its isolated AT-SPI bus.")
    if args.select is not None:
        if not args.select.is_absolute() or args.select.resolve(strict=True) != args.select:
            parser.error("The selected file must have a canonical absolute path.")
        if not args.select.is_file():
            parser.error("The selected path must be a file.")
    Atspi.set_timeout(1200, 1200)
    print(json.dumps(choose(args.pid, args.title, args.select)))


if __name__ == "__main__":
    main()
