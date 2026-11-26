# Workspace folder choice in the stock AppImage on KDE Wayland

## Scope and source

The [linked-workspace Home scale check](./phase-5-packaged-home-scale-research.md#larger-rasters-across-linked-workspaces)
prepared registrations before startup. This check starts with a fresh profile
and uses **Add Workspace** and **Locate Folder** on the packaged renderer and
Main. It covers the native KDE directory chooser and verifies the persisted
workspace and Project identities across three app starts. The test uses small
owned saved `.igs` Packages, with no runtime, model or publisher prerequisite.
[Home contract](../features/home-screen.md), [Folder Locate contract](./phase-4-home-workspace-locate-research.md).

Studio package base `07fa95d23ea3ef82b31d32a9d06f793ad5bdddba`. Consulted clean
InvokeAI revision `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/frontend/webv2/src/features/models/ui/add-models/AddModelsView.tsx`
passes a user-entered server folder through `features/models/data/api.ts` to
`invokeai/app/api/routers/model_manager.py::scan_for_models`. The current
`invokeai/app/api/routers/image_moves.py` and
`invokeai/app/services/image_moves/image_moves_default.py` own the nearby
lock-and-transaction pattern for verified batch repointing. Invoke has no
Electron directory chooser or portable `.igs` folder registration to reuse.
The fixture exercises Studio's current Main, catalog and relocation owners.
[Main chooser](../../src/main/index.ts), [Project service](../../src/main/projects/project-service.ts),
[Relocation store](../../src/main/projects/project-relocation-store.ts).

Use the private KDE Wayland launcher with
`IMAGEGEN_LINUX_PACKAGE_OFFLINE_PROJECT=workspace-chooser`, the current
AppImage and a fresh `runs/packaged-workspace-chooser/<date>-rN/workspace-chooser`
directory with a neighboring `package-proof.json` (schema version 1, canonical
AppImage path, byte size and SHA-256). The run uses a short owned `TMPDIR`,
a 4 GiB zero-swap user scope and a 150-second wrapper deadline.
The driver verifies `OpenFile` with `directory=true` in both D-Bus requests,
links the handle to their private PIDs and checks the exact response status
and URI.
[AppImage smoke owner](../../scripts/smoke-linux-package.mjs),
[native chooser driver](../../scripts/fixtures/packaged-kde-chooser.mjs).

## Expected evidence

- Native Add Cancel preserves the draft and empty catalog. Selecting the
  folder registers its two direct `.igs` files. A valid nested `.igs` stays
  outside the catalog. The selected linked workspace opens a saved Project.
- After normal exit, an external rename takes the registered folder away.
  Restart shows the unavailable workspace and its cached Projects, with Open
  disabled. Native Locate Cancel preserves the cached registration and keys.
- A selected folder with the same two filenames contains one exact Project
  and one different document. Locate must refuse the whole set and preserve
  the checked catalog and bindings. The exact moved folder can then be
  selected, preserving both keys, document IDs, revisions, bytes and inodes.
- A third lifetime opens a Project through the repaired workspace. Closed
  SQLite snapshots retain both authoritative bindings and one registration
  with the new path. Uncategorized stays empty and the unrelated control
  Packages retain their bytes and identities.

[Fixture](../../scripts/fixtures/packaged-workspace-chooser.mjs).

## Executed result

The stock AppImage SHA-256 was
`2087017f2325d33be1b4a5f5297ecc374ef2ae1203fe1a01c5bd00359b080b4d`.
Final run `20261124-r4` matched five native KDE responses to their request
handles. Add and Locate each returned one Cancel with no URI. The three
confirmations returned exactly the original, wrong and moved directories in
that order. The wrong folder reached Main and displayed the saved-Project
identity refusal. No partial repoint survived. The correct folder preserved
both keys, document IDs, revisions, file digests and inodes, and the third
lifetime opened a Project from it. The nested package stayed outside the
catalog and all three control files retained their bytes and identities.

All three application lifetimes closed normally. The single 4 GiB zero-swap
scope peaked at 1,230,270,464 bytes with no memory-limit or OOM events. The
80 focused workspace, preload, relocation and relink tests passed with no
failures or skips. AppImage packaging, scoped ESLint, Prettier and syntax
checks passed.

Independent live readback verified the AppImage and ASAR receipt, 18 source
pins, the five D-Bus exchanges, all 15 members of the five retained packages,
three immutable SQLite snapshots and 30 exited process identities. The closed
indices also distinguish the real Project open before relocation from the
second Project open after restart. Cleanup reclaimed 555,307,008 allocated
bytes. The run retains the portal traces, proof JSON, three closed SQLite
bodies, five synthetic packages, screenshots and process receipts.

The first two attempts reached the real portal but stopped in the test driver.
KDE exposed an inert same-title wrapper alongside the actionable folder chooser.
The driver now requires the exact owned dialog with visible OK and Cancel
controls. A third attempt passed native Add but exposed an incorrect assumption
in the test. An initial path-derived key has no extra binding row. Successful
Locate writes both checked bindings as part of the repoint. The final run uses
that exact oracle. The prior attempts are preserved separately.

This local result exercises starting with an existing directory in the picker
on the current KDE Wayland host. The shipping desktop matrix and creation of
a new directory from the chooser remain separate checks.

## Restore Trash after re-registering its workspace

Studio base `50302db8`. The clean InvokeAI checkout was
`64ff2c600f04d220e470fdaeec570bd402af42a7`. Read
`invokeai/frontend/webv2/src/workbench/launchpad/projects/useProjectCardActions.ts`
and its `workbench/projects/library.ts` and `workbench/projects/api.ts`
callers through `invokeai/app/api/routers/projects.py` and
`invokeai/app/services/project_records/project_records_default.py`. Project
deletion there uses a server record and preserves its media. Studio's own
Home contract defines local workspace registration and the reversible Trash
record. This check uses those existing owners.

The AppImage registered an owned folder with two Projects via KDE OpenFile,
moved one closed Project to Trash and removed the workspace registration.
The normal close kept the exact Trash row and both files. A cold launch
refused Restore with `PROJECT_NOT_FOUND` and asked for the original folder.
Adding a different folder with the old display name and a byte-identical
copy of the trashed `.igs` still refused Restore. Adding the exact original
folder under a new display name allowed Restore.

The returned Project opened with its original local key, document ID,
revision, inode and bytes. Its neighbor and the other folder's copy stayed
intact. Both lifetimes closed normally. The closed SQLite snapshots preserve
the exact Trash row before recovery and record its removal, the three
expected catalog entries and no queue changes after Restore.

The first run `20261125-r1` received the exact original folder from KDE.
The test driver then encountered a disappearing AT-SPI control while
checking dialog closure. The scoped driver fix retries that exact stale
control read during directory dialog closure and requires a fresh
successful absence observation. The portal handle and exact URI checks
still run. `20261125-r2` passed all three native folder selections and both
refusals, with software composition confirmed by Chromium. See
`runs/packaged-workspace-trash-restore` in the artifact root.

The passing run used the existing stock package, SHA-256
`bead81dfeb229ee31d174fd0793cf479aa53e8284ef4ceefc914c0ff175c9078`.
Its private 4 GiB zero-swap scope peaked at 1,366,253,568 bytes. The independent
audit matched 20 source pins, three native portal exchanges, three Project
copies, two closed SQLite snapshots and 20 physically exited AppImage process
identities. All 135 focused workspace and Trash tests passed.

The combined workspace and warm-runtime cleanup released 30,220,288 allocated
bytes from the exact owned profiles and scratch paths. It rechecked 155
evidence files and kept the existing shared AppImage at its original path.

## Workspace removal focus and search contrast

Studio base `a5df8d6b`. The private KDE Wayland AppImage check used software
Mesa, native KWin resize to 900×620 and trusted Tab, Shift+Tab, Escape and
Enter. It opened the existing sidebar menu with the pointer. The two
`20261125-r3` and `20261125-r4` baselines preserved the existing Trash
and restoration oracles, but Escape lost the workspace action and
confirmation left focus on the page body. The custom modal also lacked
`aria-modal`. Both keyboard directions stayed in the modal. The baseline
screenshots and runtime color samples confirmed the faint 13 px Search
projects placeholder at 3.29:1 in the unfocused search after removal.
The warning paragraph and both dialog buttons already measured above
the 4.5:1 text threshold.
[W3C text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

The fix waits for the modal body to leave before checking for absent focus.
On the same active Home, Escape moves focus to the surviving workspace
action. After successful removal and the switch to Uncategorized, focus
moves to Search projects. Both paths defer to any existing focus. Naive's
local `placeholderColor` uses the existing muted text token, and the dialog
now declares its modality. The `20261125-r5` and `20261125-r6` intermediate
checks verified Search focus and contrast. Escape still lost focus until
the post-transition Vue render had completed.

Final `20261125-r7` passed the same actions and all three native folder
choices. After Escape, the workspace action was focused. After confirmation,
Search projects had the visible input ring, and its placeholder measured
5.23:1 in that focused state. Viewed the before and after screenshots.
The original Project, its sibling and the other folder's copy passed the
existing archive and SQLite checks. Both AppImage lifetimes closed normally.
The check sampled the dialog text, its two buttons and the Home search
placeholder on this desktop profile.

An independent audit matched the AppImage and 43 packaged members, 21
source pins, three portal exchanges, three Project copies, two closed
SQLite indexes and 20 exited AppImage process identities. After the native
run, the lint fix moved the static placeholder ahead of the theme prop
in the template. Comparing Vue compiler outputs showed only the order
of those two independent props changed. Of the 43 dist files, 40 were
byte-identical. The other three matched after accounting for that prop
order, the generated Home scope identifier and its asset names. Three
browser checks, full typecheck and the app build passed on the final
source. All 135 focused Main, preload and lifecycle tests passed in the
same qualification.

Replay the workspace Trash scenario with
`IMAGEGEN_WORKSPACE_TRASH_KEYBOARD=1` and the private KWin keyboard helper.
The PASS, baseline failure and intermediate diagnostic reports are in
`runs/packaged-workspace-trash-restore/20261125-r3` through `20261125-r7`.

## Keyboard focus after canceling Add Workspace folder selection

On stock `05a8aea3`, Enter opened the system folder chooser from either
the workspace name or the Choose Folder and Add button. The real KDE
portal canceled both requests. The app regained focus and retained the
name and Violet color, but Chromium reported `body` as its active
element. The named Add Workspace dialog also appeared in Chromium's
accessibility tree with `modal: false`. Escape from the form returned
visible focus to the Add Workspace action in Home.

The form disables its controls during folder selection. It now captures
the active form control as it submits and restores focus after Vue has
reenabled it on return. Closing the form clears the captured element.
Existing Naive focus handling returns focus to the Home action after
Escape. The custom card supplies `aria-modal="true"` on its dialog role.
[Add Workspace form](../../src/renderer/components/AddWorkspaceModal.vue)

The existing FUSE scenario accepts `IMAGEGEN_WORKSPACE_ADD_KEYBOARD=1`.
It records Chromium semantics and trusted Wayland input at 900×620 for
both cancellation paths. The same run also registers the intact draft,
checks Locate cancel and refusal, and reopens the relocated Project.
It runs to the final keyboard verdict after all three normal exits.
[Keyboard fixture](../../scripts/fixtures/packaged-add-workspace-keyboard.mjs)

Stock R1 failed the two focus-return and two modal assertions. R2
passed all four with the same native scenario. Returning from Cancel
focused the name field or the submit button, with a visible focus cue in
both screenshots. Escape focused the original Home action. The next
confirmation registered the same name and Violet color.

Independent readback verified 27 trusted keyboard events, six KDE portal
responses, three closed SQLite snapshots, five Project archives and their
15 member hashes, and 27 exited process identities per run. It also
verified both AppImages and the mounted ASAR before each normal close.
The 120% CPU scopes used 4 GiB RAM and zero swap. The R2 scope peaked
at 1,044,873,216 bytes. Candidate AppImage SHA-256 is
`da75f791f869726006681076df540d58398387fcb2dd11ed44869b3a30976c2b`.
Results are retained under `runs/packaged-workspace-chooser/20261126-r1`
and `runs/packaged-workspace-chooser/20261126-r2`.

The 29 focused Home browser tests, full typecheck, scoped lint, app build and
AppImage packaging passed. Cleanup reclaimed 423,292,928 allocated bytes
from the private profiles, scratch directories and unpacked build.
The exact candidate AppImage, synthetic archives and compact evidence remain.

## Locate Folder cancellation and Workspace Settings

The linked workspace was unavailable after its folder moved externally.
In stock R3 at `060023e2`, trusted Tab and Enter opened Locate Folder from the
Home warning. KDE canceled the native request, and focus landed on `body`
even after the application regained window focus. The cached registration
survived. Workspace Settings opened from the workspace actions menu and kept
Tab and Shift+Tab inside its dialog. Escape focused the original menu button.
The named card appeared as `modal: false` in Chromium.

The Home renderer now keeps the focused action and restores it after the
pending Locate UI has cleared, while the same Home context and action
remain available. A successful Locate refreshes the changed folder.
The existing Settings card supplies `aria-modal="true"` on its dialog
role. Naive continues to handle Tab and Escape.
[Home renderer](../../src/renderer/App.vue)
· [Workspace Settings](../../src/renderer/components/WorkspaceSettingsModal.vue)

The existing opt-in FUSE scenario at 900×620 exercises both additional
keyboard paths. The native Locate Cancel uses the real chooser while
its six portal outcomes, wrong-folder refusal, exact repoint, reopen
and three normal closes all run before the keyboard verdict.
The original Add Workspace keyboard path is an adjacent control.

R3 failed only the Locate focus and two Settings modal assertions.
R4 passed all three. Locate regained keyboard focus and its text changed
to the focused color. Chromium exposed one modal Workspace Settings
dialog. Tab and Shift+Tab stayed inside it, and Escape returned visible
focus to the workspace action. On the 900×620 screenshots, the sampled
text contrasts were 7.41:1 for focused Locate Folder, 11.54:1 for the
Settings title, 9.84:1 for Cancel and 12.76:1 for Save.

Independent readback matched 72 trusted key events, six portal
exchanges, three closed SQLite snapshots, five archives with 15 listed
members, three FUSE unmounts and 27 exited process identities per run.
Of the 13 source pins only the Home renderer and Settings card changed.
Candidate AppImage SHA-256 is
`edc5a05909d39500b0b675b127fecad36ae766f39e35eaa4a691af2ab36b3511`.
The 29 focused Home browser tests, full typecheck, scoped lint, app build
and packaging passed. Native results are under
`runs/packaged-workspace-chooser/20261126-r3` and `20261126-r4`.
Cleanup reclaimed 423,313,408 allocated bytes. The exact AppImage,
closed indexes, archive samples, screenshots and records remain.
