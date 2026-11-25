# Native keyboard and modal semantics in Application Updates

The stock R57 AppImage opens Updates from the Help menu. It was built
at `9192d2f76d1a979ffaa44d4e13d5575f0342848a`. Its production renderer
matches audit base `e6a848d0eb96d567cbbb22381bea7cfabc92171f`.
The [Application Updates contract](../features/application-updates.md)
uses an in-app dialog, including when the publisher is unavailable.
This qualification uses that stock state at 900×620 on private KDE
Wayland with software compositing.

## Reproduction and fix

The keyboard follows the actual Help button and the Check for Updates
option. The private compositor delivers trusted Tab, Enter, Down,
Shift+Tab and Escape events. Close receives visible focus on open.
Tab and Shift+Tab visit both dialog actions and stay inside the
dialog. Escape and Enter on Close return visible focus to Help.
Both action buttons are fully inside the viewport. The status title,
status detail and the two actions have measured text contrast ratios
of 8.60, 7.46, 9.74 and 9.84 to one, respectively.

The first observation on R57 found a named dialog with a working
focus trap and a missing modal marker. The strict repeat reached the
same state. Chromium's accessibility tree exposed a dialog with
`modal: false`. The run closed normally and returned failure for
these two exact assertions.

The installed Naive UI `modal/src/BodyWrapper.mjs` adds the modal
ARIA attribute to its preset surfaces. Application Updates uses a
custom `NCard` and owns the named dialog role on that card. The fix
sets `aria-modal="true"` at the same point so the semantics match
the existing presentation and keyboard behavior.
[ApplicationUpdatesModal.vue](../../src/renderer/components/ApplicationUpdatesModal.vue).

The [native fixture](../../scripts/fixtures/packaged-application-updates-keyboard.mjs)
checks the DOM attribute and the Chromium accessibility node, records
trusted key events and saves the open, focused and returned-focus
screenshots. The fixture also keeps package hashes and the normal
physical exit receipts. Set `IMAGEGEN_APPLICATION_UPDATES_KEYBOARD_STRICT=1`
to require every recorded check to pass.

## Packaged verification

The rebuilt stock AppImage exposes the named dialog with
`aria-modal="true"` in the DOM and `modal: true` in Chromium's
accessibility tree. The same strict native path passed with 17 trusted
keys, visible focus on entry and both returns to Help. The four text
samples ranged from 7.46 to 9.84 to one. The screenshots show both
unclipped actions, the visible focus cue and the returned focus.
The application closed with code zero. The private scope used 120%
CPU, a 4 GiB memory ceiling and zero swap, and peaked at 1,213,730,816
bytes. An independent readback verified the exact AppImage, eight
source pins, the accessibility result and the physical exit of all ten
recorded process identities.

The corrected AppImage is 147,152,158 bytes with SHA-256
`a5e59c1c0207acb8fbddc27f65955509a4810d2bb21eedee08c37b69e0294068`.
All 40 focused Updates renderer tests, full typecheck, scoped lint,
the desktop build and packaging passed.

The observation, strict failure and strict pass are under
`runs/packaged-application-updates-keyboard/20261126-r1` through
`20261126-r3`. This evidence covers the unavailable-publisher dialog
on KDE Wayland at 900×620. Screen-reader operation and other platform
combinations remain open.
