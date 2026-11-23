"""Operate one owned KDE portal chooser on the isolated AT-SPI bus."""

import argparse
import json
import os
from pathlib import Path
import stat
import time

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi, GLib


OPEN_TITLES = ("Import Project", "Locate Project")
SAVE_NAMES = {
    "Export As": "canvas.png",
    "Export Generation BBox": "generation-bbox.png",
    "Save Recovery AppImage": "ImageGen-Studio-0.2.0-Recovery.AppImage",
}
SAVE_TITLES = tuple(SAVE_NAMES)
OVERWRITE_TITLE = "Overwrite File?"
COLLISION_NAME = "primary generation box.png"


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


def owned_overwrite_dialog(pid):
    for app in children(Atspi.get_desktop(0)):
        if app.get_process_id() != pid:
            continue
        for modal in controls(app):
            if (
                modal.get_role() in (Atspi.Role.DIALOG, Atspi.Role.ALERT)
                and modal.get_name() == OVERWRITE_TITLE
                and modal.get_process_id() == pid
            ):
                yield modal


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


def choose(pid, title, filename, accept_label, accept_default, existing_png):
    if existing_png:
        pending = list(owned_overwrite_dialog(pid))
        if filename is None and pending:
            modal = single(pending, "owned overwrite prompt to cancel")
            press(named_control(modal, Atspi.Role.PUSH_BUTTON, "Cancel"))
            wait_for(lambda: not list(owned_overwrite_dialog(pid)), "Overwrite prompt did not close.")
        elif pending:
            raise RuntimeError("An overwrite prompt was already present before selection.")
    dialog = single(wait_for(lambda: list(owned_dialog(pid, title)), "Chooser did not appear."), title)
    if filename is not None:
        suggested_name = SAVE_NAMES.get(title)
        if suggested_name is not None:
            named_control(dialog, Atspi.Role.LABEL, "Name:")
        if title == "Save Recovery AppImage":
            # KFileWidget can render the AppImage suffix through its filter.
            # Identify the filename by its pre-filled text instead of the combo's name.
            initial_names = {
                suggested_name,
                Path(suggested_name).stem + Path(suggested_name).suffix.lower(),
            }
            inputs = []
            for combo in controls(dialog):
                if combo.get_role() != Atspi.Role.COMBO_BOX:
                    continue
                for obj in children(combo):
                    if obj.get_role() == Atspi.Role.TEXT and showing(obj):
                        text = obj.get_text_iface()
                        if text is not None:
                            inputs.append((obj, Atspi.Text.get_text(text, 0, -1)))
            field = single(
                (obj for obj, value in inputs if value in initial_names),
                f"recovery filename field with its suggested value from {[value for _, value in inputs]}",
            )
        else:
            combo = named_control(dialog, Atspi.Role.COMBO_BOX, suggested_name or "Name:")
            field = single(
                (obj for obj in children(combo) if obj.get_role() == Atspi.Role.TEXT and showing(obj)),
                "chooser filename field",
            )
            initial_names = {suggested_name}
        editor = field.get_editable_text_iface()
        text = field.get_text_iface()
        if editor is None or text is None:
            raise RuntimeError("The chooser filename could not be edited.")
        if suggested_name is not None and Atspi.Text.get_text(text, 0, -1) not in initial_names:
            raise RuntimeError("The Save dialog did not show the expected suggested filename.")
        if accept_default:
            if Atspi.Text.get_text(text, 0, -1) != filename.name:
                raise RuntimeError("The recovery dialog shows a different default filename.")
        else:
            if not editor.set_text_contents(str(filename)):
                raise RuntimeError("The chooser did not accept the selected filename.")
            wait_for(
                lambda: Atspi.Text.get_text(text, 0, -1) == str(filename),
                "The chooser filename changed.",
            )

    button = named_control(dialog, Atspi.Role.PUSH_BUTTON, accept_label if filename else "Cancel")
    if existing_png and filename is not None:
        try:
            press(button)
        except (GLib.Error, RuntimeError):
            # The initial AT-SPI action can still be waiting in the nested KMessageBox loop.
            # Only a newly visible prompt from this portal process can prove it reached that loop.
            wait_for(lambda: list(owned_overwrite_dialog(pid)), "The export action did not open the overwrite prompt.")
        modal = single(
            wait_for(lambda: list(owned_overwrite_dialog(pid)), "The overwrite prompt did not appear."),
            "owned overwrite prompt",
        )
        message = f'The file "{filename.name}" already exists. Do you wish to overwrite it?'
        named_control(modal, Atspi.Role.LABEL, message)
        press(named_control(modal, Atspi.Role.PUSH_BUTTON, "Overwrite"))
        wait_for(lambda: not list(owned_overwrite_dialog(pid)), "Overwrite prompt did not close.")
    else:
        press(button)
    wait_for(lambda: not list(owned_dialog(pid, title)), "Chooser did not close.")
    result = {
        "pid": pid,
        "title": title,
        "action": "select" if filename else "dismiss",
        "selectedPath": str(filename) if filename else None,
        "closed": True,
    }
    if accept_default:
        result["acceptedDefaultName"] = filename.name
    if existing_png and filename is not None:
        result["overwriteConfirmation"] = {
            "pid": pid, "title": OVERWRITE_TITLE, "message": message,
            "action": "Overwrite", "closed": True,
        }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", required=True, type=int)
    parser.add_argument("--title", required=True, choices=OPEN_TITLES + SAVE_TITLES)
    parser.add_argument("--accept-label", choices=("Save", "Export PNG"))
    parser.add_argument("--select", type=Path)
    parser.add_argument("--accept-default", action="store_true")
    parser.add_argument("--owned-existing-png", action="store_true")
    args = parser.parse_args()
    if args.pid <= 1 or not os.environ.get("AT_SPI_BUS_ADDRESS"):
        parser.error("Supply the owned portal PID and its isolated AT-SPI bus.")
    saving = args.title in SAVE_TITLES
    if saving != (args.accept_label is not None):
        parser.error("Supply the observed SaveFile action label for save dialogs.")
    if args.title == "Save Recovery AppImage" and args.accept_label != "Save":
        parser.error("The recovery dialog must use the native Save action.")
    if args.accept_default and (args.title != "Save Recovery AppImage" or args.select is None):
        parser.error("Default-name acceptance requires an owned recovery destination.")
    if args.owned_existing_png and (
        args.title != "Export As" or os.environ.get("IMAGEGEN_LINUX_PACKAGE_PROJECT_EXPORT") != "1"
    ):
        parser.error("Existing PNG selection is restricted to the owned Project export check.")
    if args.select is not None:
        if not args.select.is_absolute():
            parser.error("The selected file must have a canonical absolute path.")
        if saving:
            evidence = Path(os.environ["IMAGEGEN_LINUX_PACKAGE_ARTIFACTS"])
            parent = args.select.parent
            if (
                not parent.is_relative_to(evidence)
                or parent.resolve(strict=True) != parent
                or args.select.suffix != (
                    ".appimage" if args.accept_default else Path(SAVE_NAMES[args.title]).suffix
                )
            ):
                parser.error("The save destination must be a canonical path of the expected format inside the run directory.")
            if args.owned_existing_png:
                if args.select != evidence / "exports" / COLLISION_NAME:
                    parser.error("Select only the previously produced BBox PNG.")
                entry = args.select.lstat()
                if not (stat.S_ISREG(entry.st_mode) and entry.st_uid == os.getuid() and entry.st_nlink == 1):
                    parser.error("The BBox PNG must be an owned regular file without aliases.")
            elif args.select.exists() or args.select.is_symlink():
                parser.error("The save destination must be a new file.")
        elif args.select.resolve(strict=True) != args.select or not args.select.is_file():
            parser.error("The selected path must be a file.")
    Atspi.set_timeout(1200, 1200)
    print(json.dumps(choose(
        args.pid, args.title, args.select, args.accept_label or "Open", args.accept_default,
        args.owned_existing_png,
    )))


if __name__ == "__main__":
    main()
