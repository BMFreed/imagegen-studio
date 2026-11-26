"""Operate one owned KDE portal chooser on the isolated AT-SPI bus."""

import argparse
from itertools import islice
import json
import os
from pathlib import Path
from pwd import getpwuid
import stat
import time

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi, GLib


OPEN_TITLES = ("Import Project", "Locate Project")
DIRECTORY_TITLES = ("Add Workspace", "Locate Workspace Folder")
DIRECTORY_ACCEPT = "OK"
RECOVERY_TITLE = "Save Recovery AppImage"
SAVE_NAMES = {
    "Export As": "canvas.png",
    "Export Generation BBox": "generation-bbox.png",
}
SAVE_TITLES = (*SAVE_NAMES, RECOVERY_TITLE)
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


def owned_dialog(pid, title, *, include_hidden=False):
    for app in children(Atspi.get_desktop(0)):
        if app.get_process_id() != pid:
            continue
        for dialog in children(app):
            if dialog.get_role() == Atspi.Role.DIALOG and (include_hidden or showing(dialog)):
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


def directory_diagnostic(pid, title):
    def describe(obj):
        state = obj.get_state_set()
        flags = ("active", "modal", "focused", "focusable", "visible", "showing", "enabled")
        return {
            "role": obj.get_role_name(),
            "name": (obj.get_name() or "")[:120],
            "index": obj.get_index_in_parent(),
            "states": [name for name in flags if state.contains(getattr(Atspi.StateType, name.upper()))],
        }

    result = []
    for dialog in islice(owned_dialog(pid, title, include_hidden=True), 4):
        result.append({
            **describe(dialog),
            "children": [describe(obj) for obj in islice(children(dialog), 12)],
            "controls": [describe(obj) for obj in islice((
                child for child in controls(dialog)
                if child.get_role() in (Atspi.Role.LABEL, Atspi.Role.COMBO_BOX, Atspi.Role.PUSH_BUTTON)
            ), 16)],
        })
    return json.dumps({"pid": pid, "title": title, "dialogs": result})


def named_control(dialog, role, name):
    return single(
        (obj for obj in controls(dialog) if obj.get_role() == role and obj.get_name() == name),
        f"{name} chooser control",
    )


def owned_directory_dialogs(pid, title):
    # KDE exposes a same-title wrapper without controls alongside KDirSelectDialog.
    for dialog in owned_dialog(pid, title):
        buttons = [obj.get_name() for obj in controls(dialog) if obj.get_role() == Atspi.Role.PUSH_BUTTON]
        if buttons.count(DIRECTORY_ACCEPT) == 1 and buttons.count("Cancel") == 1:
            yield dialog


def directory_editor(dialog):
    return single(
        (
            obj for combo in controls(dialog) if combo.get_role() == Atspi.Role.COMBO_BOX
            for obj in children(combo)
            if obj.get_role() in (Atspi.Role.TEXT, Atspi.Role.ENTRY) and showing(obj)
            and obj.get_editable_text_iface() is not None and obj.get_text_iface() is not None
        ),
        "editable directory location field",
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


def choose(pid, title, filename, accept_label, accept_default, confirm_existing, suggested_name):
    directory = title in DIRECTORY_TITLES
    matching_dialogs = owned_directory_dialogs if directory else owned_dialog
    if confirm_existing:
        pending = list(owned_overwrite_dialog(pid))
        if filename is None and pending:
            modal = single(pending, "owned overwrite prompt to cancel")
            press(named_control(modal, Atspi.Role.PUSH_BUTTON, "Cancel"))
            wait_for(lambda: not list(owned_overwrite_dialog(pid)), "Overwrite prompt did not close.")
        elif pending:
            raise RuntimeError("An overwrite prompt was already present before selection.")
    dialog = single(wait_for(lambda: list(matching_dialogs(pid, title)), "Chooser did not appear."), title)
    if filename is not None:
        initial_names = {suggested_name}
        if suggested_name is not None:
            named_control(dialog, Atspi.Role.LABEL, "Name:")
        if title == RECOVERY_TITLE:
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
        elif directory:
            field = directory_editor(dialog)
        else:
            combo = named_control(dialog, Atspi.Role.COMBO_BOX, suggested_name or "Name:")
            field = single(
                (obj for obj in children(combo) if obj.get_role() == Atspi.Role.TEXT and showing(obj)),
                "chooser filename field",
            )
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
    if confirm_existing and filename is not None:
        try:
            press(button)
        except (GLib.Error, RuntimeError):
            # The initial AT-SPI action can still be waiting in the nested KMessageBox loop.
            # Only a newly visible prompt from this portal process can prove it reached that loop.
            wait_for(lambda: list(owned_overwrite_dialog(pid)), "The Save action did not open the overwrite prompt.")
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

    def chooser_closed():
        try:
            return not list(matching_dialogs(pid, title))
        except GLib.Error as error:
            # KDirSelectDialog may remove a control while the AT-SPI close poll
            # enumerates it. Require a fresh successful observation of absence.
            if (
                not directory
                or error.domain != "atspi_error"
                or error.code != 1
                or not error.message.startswith("No such object path '/org/a11y/atspi/accessible/")
            ):
                raise
            return False

    wait_for(chooser_closed, "Chooser did not close.")
    result = {
        "pid": pid,
        "title": title,
        "action": "select" if filename else "dismiss",
        "selectedPath": str(filename) if filename else None,
        "closed": True,
    }
    if accept_default:
        result["acceptedDefaultName"] = filename.name
    if confirm_existing and filename is not None:
        result["overwriteConfirmation"] = {
            "pid": pid, "title": OVERWRITE_TITLE, "message": message,
            "action": "Overwrite", "closed": True,
        }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", required=True, type=int)
    parser.add_argument("--title", required=True, choices=OPEN_TITLES + DIRECTORY_TITLES + SAVE_TITLES)
    parser.add_argument("--accept-label", choices=("Save", "Export PNG", DIRECTORY_ACCEPT))
    parser.add_argument("--select", type=Path)
    parser.add_argument("--accept-default", action="store_true")
    parser.add_argument("--owned-existing-png", action="store_true")
    parser.add_argument("--owned-existing-recovery", action="store_true")
    parser.add_argument("--recovery-version", choices=("0.2.0", "0.4.0"))
    args = parser.parse_args()
    if args.pid <= 1 or not os.environ.get("AT_SPI_BUS_ADDRESS"):
        parser.error("Supply the owned portal PID and its isolated AT-SPI bus.")
    saving = args.title in SAVE_TITLES
    directory = args.title in DIRECTORY_TITLES
    if saving and args.accept_label not in ("Save", "Export PNG"):
        parser.error("Supply the observed SaveFile action label for save dialogs.")
    if directory and args.accept_label not in (None, DIRECTORY_ACCEPT):
        parser.error("Supply an observed directory action label.")
    if not saving and not directory and args.accept_label is not None:
        parser.error("The OpenFile action label is fixed for file dialogs.")
    recovery = args.title == RECOVERY_TITLE
    if args.recovery_version is not None and not recovery:
        parser.error("A recovery version requires the recovery Save dialog.")
    if recovery and args.accept_label != "Save":
        parser.error("The recovery dialog must use the native Save action.")
    if args.accept_default and (not recovery or args.select is None):
        parser.error("Default-name acceptance requires an owned recovery destination.")
    suggested_name = (
        f"ImageGen-Studio-{args.recovery_version or '0.2.0'}-Recovery.AppImage"
        if recovery else SAVE_NAMES.get(args.title)
    )
    if args.owned_existing_png and (
        args.title != "Export As" or os.environ.get("IMAGEGEN_LINUX_PACKAGE_PROJECT_EXPORT") != "1"
    ):
        parser.error("Existing PNG selection is restricted to the owned Project export check.")
    if args.owned_existing_recovery:
        if (
            not recovery or args.owned_existing_png or args.accept_default
            or args.recovery_version not in (None, "0.2.0")
            or os.environ.get("IMAGEGEN_RECOVERY_QUALIFY_OCCUPIED") != "1"
        ):
            parser.error("Existing AppImage selection is restricted to the occupied recovery qualification.")
        evidence = Path(os.environ["IMAGEGEN_LINUX_PACKAGE_ARTIFACTS"])
        runs = Path(getpwuid(os.getuid()).pw_dir) / ".codex/artifacts/imagegen-studio/runs/packaged-recovery-action"
        if evidence.parent != runs or evidence.resolve(strict=True) != evidence:
            parser.error("Use a canonical recovery qualification directory.")
        run = evidence.lstat()
        if not (stat.S_ISDIR(run.st_mode) and run.st_uid == os.getuid() and run.st_mode & 0o077 == 0):
            parser.error("The recovery qualification directory must be private and owned.")
        occupied = evidence / "payloads" / "Applications" / "Occupied.AppImage"
        if args.select not in (None, occupied) or occupied.resolve(strict=True) != occupied:
            parser.error("Select only the owned occupied recovery destination.")
        file = occupied.lstat()
        if not (
            stat.S_ISREG(file.st_mode) and file.st_uid == os.getuid() and file.st_nlink == 1
            and stat.S_IMODE(file.st_mode) == 0o600
        ):
            parser.error("The occupied recovery destination must be a private owned regular file without aliases.")
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
                    ".appimage" if args.accept_default else Path(suggested_name).suffix
                )
            ):
                parser.error("The save destination must be a canonical path of the expected format inside the run directory.")
            if args.owned_existing_png:
                if args.select != evidence / "exports" / COLLISION_NAME:
                    parser.error("Select only the previously produced BBox PNG.")
                entry = args.select.lstat()
                if not (stat.S_ISREG(entry.st_mode) and entry.st_uid == os.getuid() and entry.st_nlink == 1):
                    parser.error("The BBox PNG must be an owned regular file without aliases.")
            elif not args.owned_existing_recovery and (args.select.exists() or args.select.is_symlink()):
                parser.error("The save destination must be a new file.")
        elif directory:
            evidence = Path(os.environ["IMAGEGEN_LINUX_PACKAGE_ARTIFACTS"])
            if (
                evidence.resolve(strict=True) != evidence
                or args.select == evidence
                or not args.select.is_relative_to(evidence)
                or args.select.resolve(strict=True) != args.select
            ):
                parser.error("Select a canonical directory inside the owned run directory.")
            entry = args.select.lstat()
            if not (stat.S_ISDIR(entry.st_mode) and entry.st_uid == os.getuid()):
                parser.error("The selected directory must belong to the current user.")
        elif args.select.resolve(strict=True) != args.select or not args.select.is_file():
            parser.error("The selected path must be a file.")
    Atspi.set_timeout(1200, 1200)
    accept_label = args.accept_label or (DIRECTORY_ACCEPT if directory else "Open")
    try:
        result = choose(
            args.pid, args.title, args.select, accept_label, args.accept_default,
            args.owned_existing_png or args.owned_existing_recovery, suggested_name,
        )
    except RuntimeError as error:
        if not directory:
            raise
        raise RuntimeError(f"{error} Owned directory dialogs: {directory_diagnostic(args.pid, args.title)}") from error
    print(json.dumps(result))


if __name__ == "__main__":
    main()
