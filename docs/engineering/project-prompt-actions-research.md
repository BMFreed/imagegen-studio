# Project prompt editing actions

## Research

Base `95927be`, clean checkout. Medium risk: shared editor behavior and UI.
Contracts: [Prompt Editor](../features/project/generate-mode/prompt-editor.md),
PP-007 text persistence and the shared UI component contract. No changes to
archive schema, main/IPC validation, recovery, inference or model lifecycle.

Confirmed: production `PlainPromptEditor` edits plain text and has exact-version
LoRA completion but no phrase-selection override or attention commands. The
prototype's `GenerationPromptEditor` and Project card implement these, with
separate Project history. Production must keep local editor history until
document-wide undo is implemented, not pretend the prototype history is durable.

Path: pointer/key/action rail → real CodeMirror selection/transaction → existing
text-only draft sync → Project IPC/main → document/shadow → explicit Save.
Prototype Project/Preset editors consume the same pure attention and phrase
rules and CodeMirror command. Mock embedding reconciliation remains separate.

Invariants: normal double-click/Shift selection remain native; triple-click
selects one top-level phrase (nested/escaped delimiters do not split it).
Attention modifies only the selection or caret phrase, preserves direction and
neighbors, and returns to neutral without accumulating brackets. Empty and
read-only editors cannot be changed by commands. Pointer action clicks retain
selection; keyboard activation uses the remembered CodeMirror selection.
Copy does not alter the document; Clear is an undoable local edit. Save flushes
the action result through the existing queue. Onboarding dismissal persists,
while ordinary help remains available. Help only names implemented completion
sources; no unsupported dynamic-preview action is shown in Electron.

UI uses the approved compact prototype composition and tokens. Shared controls
avoid duplicating the action rail/help. The renderer does not invent a tokenizer:
token counts and general syntax diagnostics remain pending.

Checks: pure-rule/real CodeMirror state tests with neighboring cases; Electron
mouse and keyboard entry points, saved `.igs` read, local Undo/Redo, both
polarities, help dismissal and clipboard; prototype consumers; screenshots at
1380×900 and 900×620. Mutations will remove the read-only guard and redirect
selection edits to the whole prompt to verify test sensitivity.

## Validation

Implemented in the working tree over `95927be` on 27.09.2026. Shared pure rules
live in `src/shared/projects/prompt-text.ts`; actual CodeMirror transactions,
keymap and triple-click override live in
`src/renderer/components/prompt-editing-codemirror.ts`. Production and prototype
consume these and the same `PromptEditorActions` / `PromptEditorHelp` components.
Project IPC, storage and schema are unchanged.

### Findings fixed during implementation

- Caret positions on whitespace before a comma selected the next phrase because
  lookup compared against already trimmed ranges. Lookup now selects the raw
  segment first, then trims its editing range; an empty neighboring phrase stays
  empty. Both caret attention and semantic selection use the same rule.
- A nested multiword outer group acquired another wrapper on attention increase.
  Balanced outer-group detection now respects nested and escaped parentheses;
  neutral transitions no longer accumulate wrappers. Three of six focused tests
  failed before these two fixes, all six passed afterward.
- Preserving focus on every action interfered with the Dynamic Prompt Preview
  modal's focus restoration. The existing Seed Reuse UI test caught text intended
  for the count field entering the prompt instead. `IconButton.preserveFocus`
  is now explicit and defaults to false; only Browse/attention/Clear use it.
  The modal trigger retains its normal focus lifecycle. The same test now also
  checks that the count and prompt remain unchanged by that focus handoff.
- The prototype's negative card needed a larger minimum height to fit all six
  actions at the shared 24 px hit area / 18 px glyph size. This prevents clipping
  Clear while keeping the existing palette and compact layout.

### Evidence

- `pnpm run app:test`: **267 passed**, no skipped tests. Six new tests exercise
  the production rules and real `EditorState`/history transactions: phrase
  boundaries, nesting/escapes, reversed selection, whitespace neighbors, neutral
  and numeric attention, read-only/empty controls, independent Clear/attention
  undo steps. No test-owned attention or history implementation is used.
- `pnpm run app:smoke`: **7 desktop scenarios passed**. The first scenario now
  calls `scripts/desktop-prompt-actions-checks.mjs` against the real Electron
  renderer: native double-click, triple-click, Shift selection, pointer and
  keyboard action activation, both polarities, local Undo/Redo, empty controls,
  clipboard with restoration, hint dismissal and later ordinary help. It then
  saves through IPC and reads the actual `.igs` package, asserting both prompts.
  Browse also opens the existing exact-version LoRA suggestions in this flow.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run prototype:build`: passed.
  App/prototype builds retain the existing bundle-size warning (>500 kB).
- `pnpm run prototype:test`: **142 passed**. This includes Project, Preset and
  Apply editor consumers, native selection, completion, attention, modal focus
  handoff/Seed Reuse and shared IconButton geometry/keyboard behavior.
- Visual review through `ui-audit`: Electron at **1380×900 and 900×620**, shared
  prototype Project at **1440×900**. Action rails fit their cards, controls remain
  reachable in the settings scrollbar, Info help is outside the clipping
  container, title and text do not overlap the rail. Screenshot capture waits
  for the Naive transition to finish; no CSS is disabled for screenshots.
  Local artifacts: `/tmp/igs-prompt-actions.png`,
  `/tmp/igs-prompt-actions-small.png`,
  `docs/prototype-app/screenshots/project-laptop-1440.png`.

### Semantic mutation check

Each mutation ran against an isolated temporary source copy with the real
CodeMirror dependencies, not against the working implementation. Removing the
read-only guard made **1 of 2** CodeMirror tests fail; replacing the editor's
selection with the whole prompt made **2 of 2** fail. Failures asserted actual
transactions/text, not mutation strings. The normal implementation passes both.
This is targeted sensitivity evidence for these invariants, not a repository-wide
mutation score.

Run logs: `/tmp/igs-actions-tests-final.log`,
`/tmp/igs-actions-prototype-final.log`, `/tmp/igs-actions-smoke-visual.log`,
`/tmp/igs-actions-typecheck-final.log`, `/tmp/igs-actions-lint-final.log`,
`/tmp/igs-actions-build-final.log`, `/tmp/igs-actions-red.log`,
`/tmp/igs-actions-mutation-readonly.log`, `/tmp/igs-actions-mutation-selection.log`.

### Remaining boundaries

This implements authoring actions, not generation. Electron still lacks dynamic
preview, embedding insertion/diagnostics, Danbooru completion, tokenizer counts,
document-wide undo, queue/staging and inference. Local Undo restores text only:
it cannot recreate an embedding sidecar ref already removed by main's existing
literal-token pruning. The prototype retains its separate document history.
Disabled/read-only command behavior is proven with real CodeMirror state;
this slice does not introduce a new production UI state that locks an editor.
PP-007 evidence and the roadmap are updated without raising the public promise
status or marking Phase 2 complete.
