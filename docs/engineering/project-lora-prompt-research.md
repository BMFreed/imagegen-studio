# Project LoRA prompt context

## Research

Base: `16a41c1`, clean working tree. Scope: production positive/negative prompt
LoRA context, with shared matching and ranking rules for the Vue prototype.
Risk: medium (shared editor behavior). No document schema, IPC, filesystem or
resource lifecycle changes. Contracts: [LoRA](../features/project/generate-mode/lora-selector.md),
[prompt autocomplete](../features/project/generate-mode/tag-autocomplete.md),
PP-004 / PP-007. This does not implement inference or embedding insertion.

Confirmed from code: `PlainPromptEditor` only edits text; the prototype's
`GenerationPromptEditor` provides resource decorations and completion.
`ModelVersionView.trainedWords` belongs to an exact version; resource-level
`trainedWords` follows the default and is unsuitable for an existing draft.
`savedModelAvailability` checks saved local and portable identity, hash, family
and catalog file status. Catalog status is not a substitute for generation-time
file verification. A portable match is unavailable until explicitly linked.

Path: main model catalog + optimistic Project draft → exact-version context
adapter → shared phrase rules → CodeMirror decorations/completion → existing
text-only draft update → serialized IPC → shadow / explicit Save.
Prototype adapters supply their own mock resource context to the same rules.

Invariants:

- Only enabled, available exact LoRAs supply context; changing a default does
  not change phrases. Missing/corrupt/unlinked/error states remove context.
- Unknown family does not mean missing. Context does not certify compatibility.
- Case and spaces/underscores are equivalent; boundaries exclude longer words;
  longest overlapping phrases win and equivalent sources aggregate.
- Stored embedding tokens take precedence over LoRA decoration. No new
  embedding identity or LoRA ownership is attached to text.
- Completion replaces the search fragment, retains neighboring text, and can
  be undone. Disable/remove/catalog refresh changes presentation only.
- Popups escape the scrolling settings panel; both prompt polarities work.

Alternatives: importing the entire mock editor would bring mock embedding
resolution into production; duplicating matching would allow behavioral drift.
Use shared pure rules and narrow adapters, keeping production text persistence.

Verification plan: real adapter/rule tests with exact vs default versions,
availability and word/overlap controls; existing prototype editor scenarios;
Electron completion → draft → Save/reopen, disabled/missing controls, visible
tooltip and keyboard undo. Check narrow/full window screenshots. Semantic
mutations target unavailable-resource filtering and word boundaries. Prototype
tests cannot prove production persistence; tiny model fixtures cannot prove ML.

## Validation

Self-review of the working tree on `16a41c1` (27.09.2026).

- `project-prompt-context.test.ts` executes the production adapter with typed
  catalog fixtures. Exact vs Default version, enabled, ready/missing/corrupt,
  hash/file identity, unlinked IDs and unknown family controls are distinguished.
- `lora-triggers.test.ts` executes the shared rules, including Unicode word
  boundaries, literal regex characters, spaces/underscores, deduplication,
  longest overlap, ranking and multi-word fragment replacement.
- `prompt-lora-codemirror.test.ts` uses real CodeMirror state, completion context
  and decoration fields. It checks the typing threshold, explicit browsing,
  read-only suppression, editing updates and embedding range precedence.
- Electron smoke enters through both real Project editors, with tiny installed
  file fixtures and real main/SQLite/IPC. It checks no context before adding a
  LoRA; both polarities; Default changes; hover metadata; Ctrl+Space and automatic
  completion; click/Enter; local Undo/Redo; Save followed by real `.igs` loading;
  unchanged exact ref and no additional prompt metadata; disable/re-enable;
  removed-file refresh; and remove preserving prompt text. Existing portable
  LoRA/checkpoint linking and Save/reopen smoke paths remain covered.
- Prototype Project test now also selects a multi-word LoRA completion after
  a preceding phrase. Existing Project/Preset/Apply and embedding flows exercise
  the shared rules and popup stylesheet through their real mock-state consumers.
- Two semantic mutations ran in temporary copies of `src` with the real tests:
  ignoring `enabled` broke the adapter's disabled control; allowing either word
  boundary broke the substring controls (`artwork`, `светлый`). Both exited 1
  for assertion failures. The workspace was not mutated for these experiments.

The screenshot review caught missing production popup CSS: native light tooltip
styles had leaked into the dark UI. Popup styles and prompt color tokens now
have one shared file imported by both renderers. Actual Electron captures at
1380×900 and 900×620 show readable dark menus extending outside the settings
scroll pane, with subdued violet trigger marks. Files:
`/tmp/igs-prompt-context.png`, `/tmp/igs-prompt-context-small.png`.
This is a focused visual self-review, not an independent/accessibility audit.

Two harness issues were corrected without weakening assertions: Playwright's
redo shortcut must synthesize uppercase `Z` with Shift; keyboard completion
waits 100 ms after the option is visible to cross CodeMirror's documented 75 ms
interaction guard. Persistence assertions wait on Saved or main state, not time.

Final checks on this working tree:

| Command / check | Result |
| --- | --- |
| `pnpm run app:test` | 261 passed, 0 failed/skipped |
| `pnpm run prototype:test` | 142 passed, 0 failed/skipped |
| `pnpm run app:smoke` | All 7 reported Electron scenarios passed, including new prompt checks |
| `pnpm run typecheck` / `pnpm run lint` | Passed |
| `app:build` (inside smoke) / `pnpm run prototype:build` | Passed; known >500 kB bundle warning remains |
| Isolated semantic mutations | Both detected by assertion failures |
| `git diff --check` | Passed |

Local run logs: `/tmp/igs-prompt-tests.log`, `igs-prompt-prototype.log`,
`igs-prompt-smoke.log`, `igs-prompt-typecheck.log`, `igs-prompt-lint.log`,
`igs-prompt-build.log`, `igs-prompt-mutation-disabled.log`,
`igs-prompt-mutation-boundaries.log` (all under `/tmp`). No commit or publication.

Remaining scope: production embedding insertion/diagnostics, Danbooru index,
attention/phrase gestures, editor action rail/onboarding and Project-level undo.
Local CodeMirror undo is not document history. Catalog availability is not
model loading/preflight; no inference, GPU qualification or release runtime is
proved here. PP-004/PP-007 remain incomplete.
